import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireOfficer } from '@/lib/auth/authorization'
import { assessWater, databaseLevel, iso, timestamp, type EwsPolicy, type EwsSource, type WaterRecord, type WaterAttestation } from './data'

export type WaterLevelInput = { district: string; river_level_m: number; current_reading?: boolean }
export type WaterLevelData = Omit<WaterRecord, 'river_level_m'> & { river_level_m: number | null; source_detail: EwsSource }
type Dependencies = { client: SupabaseClient; admin: () => SupabaseClient; now: () => number; policy: () => EwsPolicy }

const schema = z.object({
  district: z.string().trim().min(1, 'Kecamatan wajib diisi').max(100),
  river_level_m: z.number().finite().min(0, 'Tinggi air tidak boleh negatif').max(10, 'Tinggi air terlalu besar'),
  current_reading: z.literal(true, { errorMap: () => ({ message: 'Konfirmasi bahwa ini pengukuran terkini, bukan data contoh atau pengukuran lama.' }) }),
})

export async function saveWaterLevel(input: WaterLevelInput, deps: Dependencies) {
  const { user, error: guardError } = await requireOfficer(deps.client)
  if (!user) return { data: null, error: guardError }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { data: null, error: parsed.error.errors[0].message }
  const recordedAt = iso(deps.now())
  const { data: row, error } = await deps.client.from('water_levels').upsert({
    district: parsed.data.district, river_level_m: parsed.data.river_level_m,
    updated_by: user.id, updated_at: recordedAt,
  }, { onConflict: 'district' }).select('*').single()
  if (error || !row) return { data: null, error: 'Data tinggi air belum dapat disimpan. Coba lagi.' }

  // Audit is server-only. Its binding prevents legacy/seed/direct-REST rows from
  // being promoted to current readings by a fresh page load. Existing schema only.
  const { data: audit, error: auditError } = await deps.admin().from('audit_logs').insert({
    actor_id: user.id, action: 'update_water_level', entity: 'water_levels', entity_id: row.id,
    meta: { schema_version: 'ews-water-entry-v1', current_reading: true, district: row.district,
      river_level_m: parsed.data.river_level_m, recorded_at: recordedAt },
  }).select('id, actor_id, created_at, meta').single()
  if (auditError || !audit) return { data: null,
    error: 'Nilai tinggi air tersimpan, tetapi bukti pencatatan belum tersimpan. Data belum dipercaya EWS. Kirim ulang pengukuran terkini.' }
  const now = deps.now()
  return { data: { ...row, river_level_m: databaseLevel(row.river_level_m),
    source_detail: assessWater(row as WaterRecord, audit as WaterAttestation, row.district, now, deps.policy()) } as WaterLevelData, error: null }
}

export async function readWaterLevels(deps: Dependencies, district?: string, latest = false): Promise<{
  data: WaterLevelData[] | null; error: string | null; valid_for_ms: number
}> {
  const { data: { user }, error: authError } = await deps.client.auth.getUser()
  if (authError || !user) return { data: null, error: 'Tidak terautentikasi', valid_for_ms: 0 }
  let query = deps.client.from('water_levels').select('*').order('updated_at', { ascending: false }).limit(latest ? 1 : 200)
  if (district) query = query.eq('district', district)
  const { data: rows, error } = await query
  if (error) return { data: null, error: 'Data tinggi air belum dapat dimuat.', valid_for_ms: 0 }
  const policy = deps.policy()
  const data: WaterLevelData[] = []
  for (const row of rows || []) {
    const recorded = timestamp(row.updated_at)
    let audit: WaterAttestation | null = null
    if (recorded !== null && recorded + policy.water_max_age_ms > deps.now() && recorded <= deps.now() + policy.clock_skew_ms) {
      // Compare canonical instants: DB timestamptz may serialize +00:00, not Z.
      const { data: evidence, error: evidenceError } = await deps.admin().from('audit_logs')
        .select('id, actor_id, created_at, meta').eq('action', 'update_water_level')
        .eq('entity', 'water_levels').eq('entity_id', row.id)
        .eq('meta->>recorded_at', iso(recorded)).order('created_at', { ascending: false }).limit(1).maybeSingle()
      audit = evidenceError ? null : evidence as WaterAttestation | null
    }
    data.push({ ...row, river_level_m: databaseLevel(row.river_level_m),
      source_detail: assessWater(row as WaterRecord, audit, district || row.district, deps.now(), policy) })
  }
  const now = deps.now()
  const expiries = data.filter((r) => r.source_detail.quality === 'VALID').map((r) => Date.parse(r.source_detail.expires_at!))
  return { data, error: null, valid_for_ms: Math.max(0, Math.min(60_000, ...expiries.map((t) => t - now))) }
}
