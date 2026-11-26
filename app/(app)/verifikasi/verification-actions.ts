'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { AiStatus } from '@/lib/recommendations'
import type { EvidenceSource } from '@/lib/reports/evidence'
import { requireOfficer as requirePplDinas } from '@/lib/auth/authorization'
import { registeredArea } from '@/lib/reports/area'
import { reportReadScope, VERIFICATION_REPORT_LIMIT, type ReportReadScope } from '@/lib/reports/reporting'
import { classifyPointInPolygon } from '@/lib/land/geometry'
import type { ServerPhotoEvidence } from '@/lib/reports/photo-evidence'

const verificationSchema = z.object({
  reportId: z.string().uuid('ID laporan tidak valid'),
  isVerified: z.boolean(),
  note: z.string().trim().max(500, 'Catatan maksimal 500 karakter').optional().nullable(),
})

export interface VerificationReport {
  id: string
  lahan_id: string | null
  lahan_name: string | null
  lahan_area_hectares: number | null
  poktan_name: string | null
  village: string | null
  district: string | null
  owner_name: string | null
  reporter_id: string | null
  ai_status: AiStatus | null
  ai_confidence: number | null
  ai_damage_pct: number | null
  evidence_source: EvidenceSource
  latitude: number
  longitude: number
  server_created_at: string
  photo_url: string | null
  watermarked_photo_url?: string | null
  photo_paths: string[]
  photo_hash: string | null
  geofence_status?: ServerPhotoEvidence['geofence_status']
  photo_evidence?: ServerPhotoEvidence | null
  ai_analysis_id: string | null
  client_created_at: string | null
  is_verified: boolean
  verified_at: string | null
  verification_note: string | null
  verifier_name: string | null
  verifier_id: string | null
}

export async function listVerificationReports(): Promise<{
  data: VerificationReport[] | null
  error: string | null
  scope?: ReportReadScope
}> {
  const supabase = await createClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) {
    return { data: null, error: guardError }
  }

  // RLS retains assigned-PPL / Dinas scope. Counts describe this read, not claims.
  const { data: rows, error, count } = await supabase
    .from('damage_reports')
    .select(
      '*, lahan(id, name, area_hectares, polygon, poktan(name, village, district)), owner:profiles!damage_reports_user_id_fkey(full_name), verifier:profiles!damage_reports_verified_by_fkey(full_name)',
      { count: 'exact' }
    )
    .order('server_created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(VERIFICATION_REPORT_LIMIT)

  if (error) {
    return { data: null, error: error.message }
  }

  const reportRows = (rows || []) as any[]
  const reportIds = reportRows.map((r) => r.id).filter(Boolean)
  const evidenceByReportId = new Map<string, ServerPhotoEvidence>()
  if (reportIds.length > 0) {
    const { data: auditRows } = await supabase
      .from('audit_logs')
      .select('entity_id, meta')
      .eq('action', 'submit_report')
      .eq('entity', 'damage_reports')
      .in('entity_id', reportIds)
    for (const auditRow of (auditRows || []) as Array<{ entity_id: string | null; meta?: { photo_evidence?: ServerPhotoEvidence } | null }>) {
      if (auditRow.entity_id && auditRow.meta?.photo_evidence) {
        evidenceByReportId.set(auditRow.entity_id, auditRow.meta.photo_evidence)
      }
    }
  }

  const reports: VerificationReport[] = []
  for (const row of reportRows) {
    const firstPath = (row.photo_paths?.[0] as string) || null
    const secondPath = (row.photo_paths?.[1] as string) || null
    let photoUrl: string | null = null
    let watermarkedPhotoUrl: string | null = null
    if (firstPath) {
      const { data: signed } = await supabase.storage
        .from('photos')
        .createSignedUrl(firstPath, 3600)
      photoUrl = signed?.signedUrl ?? null
    }
    if (secondPath) {
      const { data: signedWm } = await supabase.storage
        .from('photos')
        .createSignedUrl(secondPath, 3600)
      watermarkedPhotoUrl = signedWm?.signedUrl ?? null
    }
    const lat = Number(row.latitude)
    const lng = Number(row.longitude)
    const geofenceStatus = classifyPointInPolygon([lng, lat], row.lahan?.polygon)
    reports.push({
      id: row.id,
      lahan_id: row.lahan_id ?? row.lahan?.id ?? null,
      lahan_name: row.lahan?.name ?? null,
      lahan_area_hectares:
        registeredArea(row.lahan?.area_hectares),
      poktan_name: row.lahan?.poktan?.name ?? null,
      village: row.lahan?.poktan?.village ?? null,
      district: row.lahan?.poktan?.district ?? null,
      owner_name: row.owner?.full_name ?? null,
      reporter_id: row.user_id ?? null,
      ai_status: row.ai_status ?? null,
      ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
      ai_damage_pct: row.ai_damage_pct != null ? Number(row.ai_damage_pct) : null,
      evidence_source: row.evidence_source || 'legacy_unverified',
      latitude: lat,
      longitude: lng,
      server_created_at: row.server_created_at,
      photo_url: photoUrl,
      watermarked_photo_url: watermarkedPhotoUrl,
      photo_paths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
      photo_hash: row.photo_hash ?? null,
      geofence_status: geofenceStatus,
      photo_evidence: evidenceByReportId.get(row.id) ?? null,
      ai_analysis_id: row.ai_analysis_id ?? null,
      client_created_at: row.client_created_at ?? null,
      is_verified: row.is_verified,
      verified_at: row.verified_at,
      verification_note: row.verification_note,
      verifier_name: row.verifier?.full_name ?? null,
      verifier_id: row.verified_by ?? null,
    })
  }

  return { data: reports, error: null, scope: reportReadScope(reports.length, count, new Date().toISOString()) }
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
  try {
    const supabase = await createClient()

    const { user, error: guardError } = await requirePplDinas(supabase)
    if (!user) {
      return { data: null, error: guardError }
    }

    const parsed = verificationSchema.safeParse(input)
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0].message }
    }

    const { reportId, isVerified, note } = parsed.data

    // RPC checks officer scope, locks the pending row, derives reviewer identity,
    // and commits the decision with its audit entry in one transaction.
    const { data, error } = await supabase
      .rpc('verify_damage_report', {
        p_report_id: reportId,
        p_is_verified: isVerified,
        p_note: note?.trim() || null,
      })
      .single()

    if (error) {
      return { data: null, error: error.message }
    }

    // Status di sisi petani berubah -> revalidate halaman terkait
    revalidatePath('/verifikasi')
    revalidatePath('/laporan')
    revalidatePath('/peta')

    return {
      data: data as { id: string; is_verified: boolean },
      error: null,
    }
  } catch {
    // A lost RPC reply does not prove rollback. Do not retry a human decision
    // automatically or manufacture success; reload the authoritative report.
    return { data: null, error: 'Status verifikasi belum dapat dipastikan. Muat ulang daftar laporan sebelum mencoba kembali.' }
  }
}

export type VerificationInput = {
  reportId: string
  isVerified: boolean
  note?: string | null
}
