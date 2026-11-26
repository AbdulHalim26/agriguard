import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AiRejectedError, type AiAnalysisResult } from '@/lib/ai'
import { calculateSha256 } from '@/lib/geo'
import { classifyPointInPolygon } from '@/lib/land/geometry'
import { aiResultSchema, parseReportInput, ReportError } from './evidence'
import { PHOTO_EVIDENCE_DISCLAIMER, PHOTO_EVIDENCE_VERSION, type ServerPhotoEvidence } from './photo-evidence'

type Dependencies = {
  client: SupabaseClient
  admin: SupabaseClient
  analyze: (image: Blob) => Promise<AiAnalysisResult>
}

export async function submitEvidence(form: FormData, { client, admin, analyze }: Dependencies) {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) throw new ReportError('Sesi berakhir. Silakan masuk kembali.', 401, 'AUTH_REQUIRED')
  const claimedUser = form.get('user_id')
  if (claimedUser !== null && claimedUser !== user.id) throw new ReportError('Akun laporan tidak cocok dengan sesi aktif.', 403, 'ACCOUNT_MISMATCH')
  const input = parseReportInput(form)
  const photos = form.getAll('photos')
  if (photos.length < 1 || photos.length > 3) throw new ReportError('Laporan memerlukan 1–3 foto.')
  for (const photo of photos) {
    if (!(photo instanceof File) || !['image/jpeg', 'image/png'].includes(photo.type) ||
        photo.size === 0 || photo.size > 5 * 1024 * 1024) throw new ReportError('Foto harus JPG/PNG dan maksimal 5MB.')
  }
  const files = photos as File[]
  const hashes = await Promise.all(files.map(calculateSha256))
  // First accepted payload owns the key; retries cannot overwrite its evidence.
  const submissionHash = createHash('sha256').update(JSON.stringify({
    lahan: input.lahan_id, latitude: input.latitude, longitude: input.longitude,
    photos: hashes, manual: input.evidence_source === 'manual' ? input.manual_status : null,
  })).digest('hex')

  const findExisting = async () => {
    const { data, error } = await client.from('damage_reports').select('*')
      .eq('user_id', user.id).eq('idempotency_key', input.idempotency_key).maybeSingle()
    if (error) throw new ReportError('Status laporan belum dapat diperiksa.', 503, 'LOOKUP_FAILED')
    return data
  }
  let row = await findExisting()
  if (row) {
    const matches = row.submission_hash ? row.submission_hash === submissionHash :
      row.lahan_id === input.lahan_id && row.photo_hash === hashes[0] &&
      Number(row.latitude) === input.latitude && Number(row.longitude) === input.longitude &&
      row.photo_paths.length === files.length
    if (!matches) throw new ReportError('ID laporan sudah digunakan untuk data berbeda. Data lokal tetap disimpan.', 409, 'IDEMPOTENCY_CONFLICT')
  }

  let receipt: { id: string; status: string; confidence: number; damage_pct: number } | null = null
  if (!row && input.analysis_id && input.evidence_source !== 'manual') {
    const { data, error } = await client.from('ai_analyses').select('id, user_id, photo_hash, status, confidence, damage_pct')
      .eq('id', input.analysis_id).eq('user_id', user.id).eq('photo_hash', hashes[0]).maybeSingle()
    if (error || !data) throw new ReportError('Bukti analisis tidak sesuai dengan foto atau akun.', 403, 'INVALID_ANALYSIS')
    receipt = { ...data, confidence: Number(data.confidence), damage_pct: Number(data.damage_pct) }
    if (!aiResultSchema.safeParse(receipt).success) throw new ReportError('Hasil analisis server tidak valid.', 503)
  }

  if (!row) {
    const { data: lahan, error: lahanError } = await client.from('lahan').select('id, owner_id, poktan_id, polygon')
      .eq('id', input.lahan_id).maybeSingle()
    if (lahanError || !lahan) throw new ReportError('Lahan tidak tersedia untuk akun ini.', 403, 'FIELD_ACCESS')
    const { data: profile, error: profileError } = await client.from('profiles').select('poktan_id').eq('id', user.id).single()
    if (profileError || !profile || (lahan.owner_id !== user.id &&
        (!profile.poktan_id || profile.poktan_id !== lahan.poktan_id))) {
      throw new ReportError('Tidak memiliki akses ke lahan ini.', 403, 'FIELD_ACCESS')
    }
    const position = classifyPointInPolygon([input.longitude, input.latitude], lahan.polygon)
    if (position === 'INVALID_GEOMETRY') throw new ReportError('Batas lahan belum valid untuk pemeriksaan lokasi. Minta pendaftar/pengelola memperbaiki batas; ini bukan keputusan klaim.', 422, 'INVALID_FIELD_GEOMETRY')
    if (position !== 'INSIDE' && position !== 'BOUNDARY') throw new ReportError('Lokasi laporan berada di luar batas lahan.')

    const { data: duplicate, error: dedupeError } = await client.from('damage_reports').select('id')
      .eq('user_id', user.id).eq('photo_hash', hashes[0]).neq('idempotency_key', input.idempotency_key)
      .gte('server_created_at', new Date(Date.now() - 86_400_000).toISOString()).limit(1)
    if (dedupeError) throw new ReportError('Pemeriksaan foto belum tersedia.', 503)
    if (duplicate?.length) throw new ReportError('Foto serupa sudah dilaporkan dalam 24 jam terakhir. Data lokal tetap disimpan.', 409, 'DUPLICATE_PHOTO')

    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `${user.id}/reports/${input.idempotency_key}/${i}_${hashes[i]}.${file.type === 'image/png' ? 'png' : 'jpg'}`
      const { error } = await admin.storage.from('photos').upload(path, file, { contentType: file.type, upsert: false })
      // A content-addressed object can already exist after an interrupted retry.
      if (error && String((error as { statusCode?: string }).statusCode) !== '409') {
        throw new ReportError('Foto belum dapat diunggah. Coba lagi.', 503, 'UPLOAD_FAILED')
      }
      if (error) {
        const { data: stored, error: downloadError } = await admin.storage.from('photos').download(path)
        if (downloadError || !stored || createHash('sha256').update(new Uint8Array(await stored.arrayBuffer())).digest('hex') !== hashes[i]) {
          throw new ReportError('Foto tersimpan tidak cocok. Data lokal tetap disimpan.', 409, 'PHOTO_CONFLICT')
        }
      }
      paths.push(path)
    }

    const manual = input.evidence_source === 'manual' ? input.manual_status! : null
    const record = {
      id: randomUUID(), user_id: user.id, lahan_id: input.lahan_id,
      idempotency_key: input.idempotency_key, photo_paths: paths, photo_hash: hashes[0],
      latitude: input.latitude, longitude: input.longitude, client_created_at: input.client_created_at,
      submission_hash: submissionHash,
      evidence_source: manual ? 'manual' : receipt ? 'server_ai' : 'pending',
      manual_status: manual, ai_analysis_id: receipt?.id ?? null,
      ai_status: manual ?? receipt?.status ?? null,
      ai_confidence: receipt?.confidence ?? null, ai_damage_pct: receipt?.damage_pct ?? null,
      is_verified: false, verified_by: null, verified_at: null, verification_note: null,
    }
    const { data, error } = await admin.from('damage_reports').insert(record).select('*').single()
    if (error?.code === '23505') {
      row = await findExisting()
      if (!row || row.submission_hash !== submissionHash) throw new ReportError('ID laporan sudah digunakan. Data lokal tetap disimpan.', 409, 'IDEMPOTENCY_CONFLICT')
    } else if (error || !data) {
      throw new ReportError('Laporan belum dapat disimpan. Coba lagi.', 503, 'SAVE_FAILED')
    } else {
      row = data
      const photoEvidence: ServerPhotoEvidence | null = input.capture_metadata
        ? {
            version: PHOTO_EVIDENCE_VERSION,
            report_id: row.id as string,
            user_id: user.id,
            lahan_id: input.lahan_id,
            geometry_version_id: input.capture_metadata.geometry_version_id ?? null,
            capture_source: input.capture_metadata.capture_source,
            location_status: input.capture_metadata.location_status,
            gps_snapshot: input.capture_metadata.gps_snapshot,
            device_captured_at: input.capture_metadata.device_captured_at,
            server_received_at: (row.server_created_at as string) || new Date().toISOString(),
            submitted_offline: input.capture_metadata.submitted_offline,
            geofence_status: position,
            region_label: input.capture_metadata.region_label ?? null,
            original_photo_sha256: hashes[0],
            watermarked_photo_sha256: hashes[1] ?? null,
            watermark_applied: Boolean(hashes[1]) && input.capture_metadata.watermark_applied,
            watermark_lines: input.capture_metadata.watermark_lines ?? [],
            authenticity_note: PHOTO_EVIDENCE_DISCLAIMER,
          }
        : null
      const { error: auditError } = await admin.from('audit_logs').insert({
        actor_id: user.id, action: 'submit_report', entity: 'damage_reports', entity_id: row.id,
        meta: {
          lahan_id: input.lahan_id,
          evidence_source: record.evidence_source,
          ...(photoEvidence ? { photo_evidence: photoEvidence } : {}),
        },
      })
      if (auditError) console.error('[reports] audit submit belum tersimpan')
    }
  }

  if (row.evidence_source === 'pending' && !row.is_verified && !row.verified_at) {
    try {
      const result = aiResultSchema.parse(await analyze(files[0]))
      const { data: analysis, error: analysisError } = await admin.from('ai_analyses').insert({
        user_id: user.id, photo_hash: hashes[0], ...result,
      }).select('id').single()
      if (analysisError || !analysis) throw new Error('analysis persistence')
      const { data: updated, error: updateError } = await admin.from('damage_reports').update({
        ai_status: result.status, ai_confidence: result.confidence, ai_damage_pct: result.damage_pct,
        evidence_source: 'server_ai', ai_analysis_id: analysis.id,
      }).eq('id', row.id).eq('user_id', user.id).eq('evidence_source', 'pending')
        .eq('is_verified', false).is('verified_at', null).select('*').maybeSingle()
      if (updateError) throw new Error('analysis update')
      row = updated || await findExisting()
      if (!row || (row.evidence_source === 'pending' && !row.is_verified && !row.verified_at)) throw new Error('analysis pending')
    } catch (error) {
      if (error instanceof AiRejectedError) {
        throw new ReportError('Foto perlu ditinjau atau diambil ulang. Laporan tersimpan dan foto lokal tetap dipertahankan.', 422, 'AI_REJECTED')
      }
      // Keep queued evidence and retry the same durable report. Finalized rows
      // are excluded from updates even when verification races with inference.
      throw new ReportError('Laporan tersimpan; analisis AI belum selesai. Foto lokal tetap aman dan akan dicoba kembali.', 503, 'AI_PENDING')
    }
  }

  return {
    success: true as const, id: row.id as string, user_id: user.id,
    idempotency_key: input.idempotency_key, evidence_source: row.evidence_source as string,
    ai_status: row.ai_status, ai_confidence: row.ai_confidence, ai_damage_pct: row.ai_damage_pct,
    original_photo_sha256: hashes[0],
    watermarked_photo_sha256: hashes[1] ?? null,
  }
}
