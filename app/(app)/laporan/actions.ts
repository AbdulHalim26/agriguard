'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeImage } from '@/lib/ai'
import { submitEvidence } from '@/lib/reports/submit'
import { ReportError, type EvidenceSource } from '@/lib/reports/evidence'
import { registeredArea } from '@/lib/reports/area'

export type AiStatus = 'aman' | 'rusak_ringan' | 'rusak_berat'
export interface ReportItem {
  id: string
  lahan_id?: string | null
  lahan: { id: string; name: string; area_hectares?: number | null } | null
  district: string | null
  ai_status: AiStatus | null
  ai_confidence: number | null
  ai_damage_pct: number | null
  evidence_source: EvidenceSource
  latitude: number
  longitude: number
  client_created_at: string
  server_created_at: string
  is_verified: boolean
  verification_note: string | null
  verified_at: string | null
  photo_urls: string[]
  ai_analysis_id?: string | null
}

export async function submitReport(formData: FormData): Promise<{ data: { id: string } | null; error: string | null; retryable?: boolean }> {
  try {
    if (!formData.get('idempotency_key')) formData.set('idempotency_key', randomUUID())
    if (!formData.get('client_created_at')) formData.set('client_created_at', new Date().toISOString())
    const result = await submitEvidence(formData, {
      client: await createClient(), admin: createAdminClient(), analyze: analyzeImage,
    })
    revalidatePath('/laporan')
    return { data: { id: result.id }, error: null }
  } catch (error) {
    return {
      data: null, error: error instanceof ReportError ? error.message : 'Laporan belum dapat disimpan. Coba lagi.',
      retryable: !(error instanceof ReportError) || error.status >= 500,
    }
  }
}

export async function listMyReports(): Promise<{ data: ReportItem[] | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { data: null, error: 'Tidak terautentikasi' }
  const { data: rows, error } = await supabase.from('damage_reports')
    .select('*, lahan(id, name, area_hectares, poktan(district))').eq('user_id', user.id)
    .order('server_created_at', { ascending: false })
  if (error) return { data: null, error: 'Riwayat laporan belum tersedia.' }
  const reports: ReportItem[] = []
  for (const row of rows || []) {
    const first = row.photo_paths?.[0]
    const { data: signed } = first ? await supabase.storage.from('photos').createSignedUrl(first, 3600) : { data: null }
    reports.push({
      id: row.id, lahan_id: row.lahan_id ?? row.lahan?.id ?? null,
      lahan: row.lahan ? { id: row.lahan.id, name: row.lahan.name, area_hectares: registeredArea(row.lahan.area_hectares) } : null,
      district: row.lahan?.poktan?.district ?? null,
      ai_status: row.ai_status ?? null,
      ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
      ai_damage_pct: row.ai_damage_pct != null ? Number(row.ai_damage_pct) : null,
      evidence_source: row.evidence_source || 'legacy_unverified',
      latitude: Number(row.latitude), longitude: Number(row.longitude),
      client_created_at: row.client_created_at, server_created_at: row.server_created_at,
      is_verified: row.is_verified, verification_note: row.verification_note, verified_at: row.verified_at,
      photo_urls: signed?.signedUrl ? [signed.signedUrl] : [],
      ai_analysis_id: row.ai_analysis_id ?? null,
    })
  }
  return { data: reports, error: null }
}
