'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiStatus } from '@/lib/recommendations'

const verificationSchema = z.object({
  reportId: z.string().uuid('ID laporan tidak valid'),
  isVerified: z.boolean(),
  note: z.string().trim().max(500, 'Catatan maksimal 500 karakter').optional().nullable(),
})

export interface VerificationReport {
  id: string
  lahan_name: string | null
  lahan_area_hectares: number | null
  poktan_name: string | null
  village: string | null
  district: string | null
  owner_name: string | null
  ai_status: AiStatus | null
  ai_confidence: number | null
  ai_damage_pct: number | null
  latitude: number
  longitude: number
  server_created_at: string
  photo_url: string | null
  is_verified: boolean
  verified_at: string | null
  verification_note: string | null
  verifier_name: string | null
}

async function requirePplDinas(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { user: null, error: 'Tidak terautentikasi' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'ppl' && profile.role !== 'dinas')) {
    return { user: null, error: 'Hanya PPL/Dinas yang dapat verifikasi laporan' }
  }

  return { user, error: null }
}

export async function listVerificationReports(): Promise<{
  data: VerificationReport[] | null
  error: string | null
}> {
  const supabase = await createClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) {
    return { data: null, error: guardError }
  }

  // RLS: ppl/dinas membaca semua laporan
  const { data: rows, error } = await supabase
    .from('damage_reports')
    .select(
      '*, lahan(name, area_hectares, poktan(name, village, district)), owner:profiles!damage_reports_user_id_fkey(full_name), verifier:profiles!damage_reports_verified_by_fkey(full_name)'
    )
    .order('server_created_at', { ascending: false })
    .limit(200)

  if (error) {
    return { data: null, error: error.message }
  }

  const reports: VerificationReport[] = []
  for (const row of (rows || []) as any[]) {
    const firstPath = (row.photo_paths?.[0] as string) || null
    let photoUrl: string | null = null
    if (firstPath) {
      const { data: signed } = await supabase.storage
        .from('photos')
        .createSignedUrl(firstPath, 3600)
      photoUrl = signed?.signedUrl ?? null
    }
    reports.push({
      id: row.id,
      lahan_name: row.lahan?.name ?? null,
      lahan_area_hectares:
        row.lahan?.area_hectares != null ? Number(row.lahan.area_hectares) : null,
      poktan_name: row.lahan?.poktan?.name ?? null,
      village: row.lahan?.poktan?.village ?? null,
      district: row.lahan?.poktan?.district ?? null,
      owner_name: row.owner?.full_name ?? null,
      ai_status: row.ai_status ?? null,
      ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
      ai_damage_pct: row.ai_damage_pct != null ? Number(row.ai_damage_pct) : null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      server_created_at: row.server_created_at,
      photo_url: photoUrl,
      is_verified: row.is_verified,
      verified_at: row.verified_at,
      verification_note: row.verification_note,
      verifier_name: row.verifier?.full_name ?? null,
    })
  }

  return { data: reports, error: null }
}

export async function getPendingReportCount(): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) return { count: 0, error: guardError }

  const { count, error } = await supabase
    .from('damage_reports')
    .select('id', { count: 'exact', head: true })
    .eq('is_verified', false)
    .is('verified_at', null)

  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}

export interface ReportStats {
  total: number
  pending: number
  verified: number
}

export async function getReportStats(): Promise<{
  data: ReportStats | null
  error: string | null
}> {
  const supabase = await createClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) return { data: null, error: guardError }

  // RLS membatasi cakupan: PPL -> poktan binaan, Dinas -> semua poktan.
  const [totalRes, pendingRes, verifiedRes] = await Promise.all([
    supabase.from('damage_reports').select('id', { count: 'exact', head: true }),
    supabase
      .from('damage_reports')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified', false)
      .is('verified_at', null),
    supabase
      .from('damage_reports')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified', true),
  ])

  const firstError = totalRes.error || pendingRes.error || verifiedRes.error
  if (firstError) return { data: null, error: firstError.message }

  return {
    data: {
      total: totalRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      verified: verifiedRes.count ?? 0,
    },
    error: null,
  }
}

export async function setVerification(
  input: VerificationInput
): Promise<{ data: { id: string; is_verified: boolean } | null; error: string | null }> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) {
    return { data: null, error: guardError }
  }

  const parsed = verificationSchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.errors[0].message }
  }

  const { reportId, isVerified, note } = parsed.data

  const { data: existing } = await supabase
    .from('damage_reports')
    .select('id')
    .eq('id', reportId)
    .single()

  if (!existing) {
    return { data: null, error: 'Laporan tidak ditemukan' }
  }

  // Update kolom verifikasi (guard server-side + RLS reports_update_verification_ppl_dinas)
  const { data, error } = await supabase
    .from('damage_reports')
    .update({
      is_verified: isVerified,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      verification_note: note?.trim() || null,
    })
    .eq('id', reportId)
    .select('id, is_verified')
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  // Audit log via service role
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: user.id,
    action: isVerified ? 'verify_report' : 'reject_report',
    entity: 'damage_reports',
    entity_id: reportId,
    meta: { note: note?.trim() || null },
  })
  if (auditError) {
    console.error('[verify] audit log gagal:', auditError.message)
  }

  // Status di sisi petani berubah -> revalidate halaman terkait
  revalidatePath('/verifikasi')
  revalidatePath('/laporan')
  revalidatePath('/peta')

  return {
    data: { id: data.id, is_verified: data.is_verified },
    error: null,
  }
}

export type VerificationInput = {
  reportId: string
  isVerified: boolean
  note?: string | null
}
