'use server'

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateGeofence, calculateSha256 } from '@/lib/geo'

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png']

const reportSchema = z.object({
  lahan_id: z.string().uuid('ID lahan tidak valid'),
  latitude: z.coerce.number().min(-90, 'Latitude tidak valid').max(90, 'Latitude tidak valid'),
  longitude: z.coerce.number().min(-180, 'Longitude tidak valid').max(180, 'Longitude tidak valid'),
  ai_status: z.enum(['aman', 'rusak_ringan', 'rusak_berat']).nullable().optional(),
  ai_confidence: z.coerce.number().min(0).max(1).nullable().optional(),
  ai_damage_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  idempotency_key: z.string().uuid('ID ketik tidak valid').optional(),
  client_created_at: z.string().datetime({ offset: true }).optional(),
})

export type AiStatus = 'aman' | 'rusak_ringan' | 'rusak_berat'

export interface ReportItem {
  id: string
  lahan: { id: string; name: string } | null
  district: string | null
  ai_status: AiStatus | null
  ai_confidence: number | null
  ai_damage_pct: number | null
  latitude: number
  longitude: number
  client_created_at: string
  server_created_at: string
  is_verified: boolean
  verification_note: string | null
  verified_at: string | null
  photo_urls: string[]
}

export async function submitReport(
  formData: FormData
): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: null, error: 'Sesi berakhir. Silakan masuk kembali.' }
  }

  // Ambil foto dari FormData (key 'photos')
  const photos: File[] = []
  for (const [key, value] of Array.from(formData.entries())) {
    if (key === 'photos' && value instanceof File) {
      photos.push(value)
    }
  }

  const parsed = reportSchema.safeParse({
    lahan_id: formData.get('lahan_id'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    ai_status: formData.get('ai_status') || null,
    ai_confidence: formData.get('ai_confidence') || null,
    ai_damage_pct: formData.get('ai_damage_pct') || null,
    idempotency_key: formData.get('idempotency_key') || undefined,
    client_created_at: formData.get('client_created_at') || undefined,
  })

  if (!parsed.success) {
    return { data: null, error: parsed.error.errors[0].message }
  }

  if (photos.length === 0) {
    return { data: null, error: 'Minimal 1 foto diperlukan' }
  }

  if (photos.length > MAX_PHOTOS) {
    return { data: null, error: `Maksimal ${MAX_PHOTOS} foto per laporan` }
  }

  for (const photo of photos) {
    if (!ALLOWED_MIME.includes(photo.type)) {
      return { data: null, error: 'Foto harus berformat JPG atau PNG' }
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return { data: null, error: 'Ukuran foto maksimal 5MB' }
    }
  }

  const input = parsed.data
  const idempotencyKey = input.idempotency_key || randomUUID()
  const clientCreatedAt = input.client_created_at || new Date().toISOString()

  // 1) Cek lahan + akses + ambil polygon untuk geofence
  const { data: lahan, error: lahanError } = await supabase
    .from('lahan')
    .select('id, owner_id, poktan_id, polygon')
    .eq('id', input.lahan_id)
    .single()

  if (lahanError || !lahan) {
    return { data: null, error: 'Lahan tidak ditemukan' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('poktan_id')
    .eq('id', user.id)
    .single()

  const isOwner = lahan.owner_id === user.id
  const isSamePoktan = Boolean(profile?.poktan_id && profile.poktan_id === lahan.poktan_id)

  if (!isOwner && !isSamePoktan) {
    return { data: null, error: 'Tidak memiliki akses ke lahan ini' }
  }

  // 2) Geofence: titik laporan harus di dalam polygon lahan (ray-casting, lib/geo.ts)
  const inside = validateGeofence(input.latitude, input.longitude, lahan.polygon)
  if (!inside) {
    return { data: null, error: 'Lokasi laporan berada di luar batas lahan. Periksa titik lokasi.' }
  }

  // 3) Dedupe foto: sha256 foto pertama; tolak hash sama dari user yang sama <24 jam
  const photoHash = await calculateSha256(photos[0])
  const dedupeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existingHash } = await supabase
    .from('damage_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('photo_hash', photoHash)
    .neq('idempotency_key', idempotencyKey)
    .gte('server_created_at', dedupeCutoff)
    .limit(1)

  if (existingHash && existingHash.length > 0) {
    return { data: null, error: 'Foto serupa sudah dilaporkan dalam 24 jam terakhir.' }
  }

  // 4) Upload foto ke bucket 'photos' (private). Path = userId/reports/key_i.ext
  const photoPaths: string[] = []
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const ext = photo.type === 'image/png' ? 'png' : 'jpg'
    const path = `${user.id}/reports/${idempotencyKey}_${i}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, photo, {
        contentType: photo.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[submitReport] upload foto gagal:', uploadError.message)
      return { data: null, error: 'Gagal mengunggah foto. Coba lagi.' }
    }

    photoPaths.push(path)
  }

  // 5) Simpan laporan (upsert idempotent via idempotency_key, bukan insert mentah)
  const reportId = randomUUID()
  const { error: reportError } = await supabase
    .from('damage_reports')
    .upsert(
      {
        id: reportId,
        user_id: user.id,
        lahan_id: input.lahan_id,
        photo_paths: photoPaths,
        photo_hash: photoHash,
        ai_status: input.ai_status ?? null,
        ai_confidence: input.ai_confidence ?? null,
        ai_damage_pct: input.ai_damage_pct ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        client_created_at: clientCreatedAt,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'idempotency_key' }
    )

  if (reportError) {
    console.error('[submitReport] insert/upsert gagal:', reportError.message)
    return { data: null, error: 'Gagal menyimpan laporan. Coba lagi.' }
  }

  // 6) Audit log (via service role; RLS audit_logs hanya boleh baca)
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: user.id,
    action: 'submit_report',
    entity: 'damage_reports',
    entity_id: reportId,
    meta: {
      lahan_id: input.lahan_id,
      ai_status: input.ai_status ?? null,
      source: 'scan',
    },
  })
  if (auditError) {
    console.error('[submitReport] audit log gagal:', auditError.message)
  }

  revalidatePath('/laporan')

  return { data: { id: reportId }, error: null }
}

export async function listMyReports(): Promise<{
  data: ReportItem[] | null
  error: string | null
}> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  const { data: rows, error } = await supabase
    .from('damage_reports')
    .select('*, lahan(id, name, poktan(district))')
    .eq('user_id', user.id)
    .order('server_created_at', { ascending: false })

  if (error) {
    console.error('[listMyReports] SELECT gagal:', error.message)
    return { data: null, error: error.message }
  }

  const reports: ReportItem[] = (rows || []).map((row: any) => ({
    id: row.id,
    lahan: row.lahan ? { id: row.lahan.id, name: row.lahan.name } : null,
    district: row.lahan?.poktan?.district ?? null,
    ai_status: row.ai_status ?? null,
    ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
    ai_damage_pct: row.ai_damage_pct != null ? Number(row.ai_damage_pct) : null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    client_created_at: row.client_created_at,
    server_created_at: row.server_created_at,
    is_verified: row.is_verified,
    verification_note: row.verification_note,
    verified_at: row.verified_at,
    photo_urls: [],
  }))

  // Signed URL (expire 1 jam) untuk thumbnail — bukan public URL
  for (const report of reports) {
    const paths = (rows?.find((r: any) => r.id === report.id)?.photo_paths || []) as string[]
    const first = paths[0]
    if (first) {
      const { data: signed } = await supabase.storage
        .from('photos')
        .createSignedUrl(first, 3600)
      report.photo_urls = signed?.signedUrl ? [signed.signedUrl] : []
    }
  }

  return { data: reports, error: null }
}