import { z } from 'zod'

export type DataQuality = 'VALID' | 'MISSING' | 'INVALID' | 'STALE' | 'MOCK'
export type Coordinates = { lat: number; lon: number }
export type LocationSource = 'device' | 'default' | 'invalid'
export interface SourceContext {
  coordinates: Coordinates | null
  location_source: LocationSource | 'district'
  district: string | null
}

export interface EwsSource {
  source: 'openweathermap' | 'water_levels' | 'simulation'
  kind: 'FORECAST' | 'MANUAL_REPORT'
  quality: DataQuality
  reason_code: string
  reason: string
  value: number | null
  unit: 'mm/3h' | 'm'
  record_id: string | null
  observed_at: string | null
  issued_at: string | null
  recorded_at: string | null
  valid_from: string | null
  valid_until: string | null
  retrieved_at: string
  expires_at: string | null
  timestamp_basis: 'forecast_interval' | 'confirmed_current_entry' | 'unverified'
  context: SourceContext
}

export interface EwsPolicy {
  version: 'ews-truthful-v1'
  weather_max_age_ms: number
  water_max_age_ms: number
  clock_skew_ms: number
  configuration_errors: string[]
}

// Provisional engineering limits, NOT official weather/insurance policy.
export function readEwsPolicy(env: Record<string, string | undefined> = {}): EwsPolicy {
  const errors: string[] = []
  const read = (key: string, fallback: number, min: number, max: number) => {
    if (env[key] === undefined) return fallback
    const n = env[key]?.trim() ? Number(env[key]) : NaN
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(key); return fallback }
    return n
  }
  return {
    version: 'ews-truthful-v1',
    weather_max_age_ms: read('EWS_WEATHER_MAX_AGE_MINUTES', 20, 1, 60) * 60_000,
    water_max_age_ms: read('EWS_WATER_MAX_AGE_MINUTES', 60, 1, 1440) * 60_000,
    clock_skew_ms: read('EWS_CLOCK_SKEW_SECONDS', 120, 0, 300) * 1000,
    configuration_errors: errors,
  }
}

const timestampSchema = z.string().datetime({ offset: true })
export function timestamp(value: unknown): number | null {
  if (!timestampSchema.safeParse(value).success) return null
  const ms = Date.parse(value as string)
  return Number.isFinite(ms) ? ms : null
}
export const iso = (ms: number) => new Date(ms).toISOString()
export function finiteValue(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export const DEFAULT_WEATHER_COORDS: Coordinates = { lat: -6.31, lon: 107.29 }
export function weatherContext(input?: unknown): SourceContext {
  if (input === undefined) return { coordinates: { ...DEFAULT_WEATHER_COORDS }, location_source: 'default', district: null }
  const coords = input as Partial<Coordinates> | null
  if (!coords || !finiteValue(coords.lat, -90, 90) || !finiteValue(coords.lon, -180, 180)) {
    return { coordinates: null, location_source: 'invalid', district: null }
  }
  return { coordinates: { lat: coords.lat, lon: coords.lon }, location_source: 'device', district: null }
}

export function emptySource(kind: EwsSource['kind'], context: SourceContext, now: number,
  quality: DataQuality = 'MISSING', reason = 'Data belum tersedia.', code = 'MISSING'): EwsSource {
  return {
    source: kind === 'FORECAST' ? 'openweathermap' : 'water_levels', kind, quality,
    reason_code: code, reason, value: null, unit: kind === 'FORECAST' ? 'mm/3h' : 'm',
    record_id: null, observed_at: null, issued_at: null, recorded_at: null,
    valid_from: null, valid_until: null, retrieved_at: iso(now), expires_at: null,
    timestamp_basis: 'unverified', context,
  }
}

// DB numeric may be a decimal string; unlike Number(''), missing is never zero.
export function databaseLevel(value: unknown): number | null {
  const n = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value
  return finiteValue(n, 0, 10) ? n : null
}

export interface WaterRecord {
  id: string
  district: string
  river_level_m: unknown
  updated_at: string
  updated_by: string | null
}
export interface WaterAttestation {
  id: string
  actor_id: string | null
  created_at: string
  meta: unknown
}

export function assessWater(record: WaterRecord | null, attestation: WaterAttestation | null,
  district: string | null, now: number, policy: EwsPolicy): EwsSource {
  const source = emptySource('MANUAL_REPORT', { coordinates: null, location_source: 'district', district }, now,
    'MISSING', district ? 'Belum ada laporan tinggi air untuk kecamatan ini.' : 'Kecamatan Poktan belum tersedia.')
  if (!record) return source
  source.record_id = record.id
  source.value = databaseLevel(record.river_level_m)
  const recorded = timestamp(record.updated_at)
  source.recorded_at = recorded === null ? null : iso(recorded)
  const fail = (quality: DataQuality, code: string, reason: string) => ({ ...source, quality, reason_code: code, reason })
  if (policy.configuration_errors.length) return fail('INVALID', 'POLICY_INVALID', 'Konfigurasi kesegaran data perlu diperiksa pengelola.')
  if (record.district !== district || source.value === null || recorded === null || recorded > now + policy.clock_skew_ms) {
    return fail('INVALID', 'INVALID_WATER_RECORD', 'Nilai, kecamatan, atau waktu pencatatan tinggi air tidak valid.')
  }
  source.expires_at = iso(recorded + policy.water_max_age_ms)
  if (recorded + policy.water_max_age_ms <= now) return fail('STALE', 'WATER_EXPIRED', 'Laporan tinggi air sudah melewati batas umur data. Minta pengukuran terkini.')
  const meta = attestation?.meta as Record<string, unknown> | null
  const auditTime = timestamp(attestation?.created_at)
  // Only a server-written attestation of an explicitly current reading qualifies.
  // Legacy/seed/direct-REST rows never become trusted just because fetched now.
  if (!meta || meta.schema_version !== 'ews-water-entry-v1' || meta.current_reading !== true ||
      meta.district !== district || meta.river_level_m !== source.value ||
      timestamp(meta.recorded_at) !== recorded || !record.updated_by || attestation?.actor_id !== record.updated_by ||
      auditTime === null || auditTime < recorded - policy.clock_skew_ms || auditTime > now + policy.clock_skew_ms) {
    return fail('INVALID', 'UNVERIFIED_WATER_TIME', 'Waktu pengukuran data lama/demo belum dapat dipastikan. Petugas perlu mengirim pengukuran terkini.')
  }
  return { ...source, quality: 'VALID', reason_code: 'CURRENT_MANUAL_ENTRY', timestamp_basis: 'confirmed_current_entry',
    reason: 'Pengukuran terkini dikonfirmasi petugas saat dikirim; waktu yang tersedia adalah waktu pencatatan server, bukan waktu sensor.' }
}

export function formatWib(value: string | null | undefined): string {
  const ms = timestamp(value)
  if (ms === null) return 'Waktu tidak tersedia'
  return `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)} WIB`
}

// Do not round 19.999 mm to 20.0 or 1.199 m to 1.20 beside an AMAN label.
export function formatEwsValue(value: number | null, unit: EwsSource['unit']): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: unit === 'm' ? 2 : 0, maximumFractionDigits: 20 }).format(value)
}

export const QUALITY_LABELS: Record<DataQuality, string> = {
  VALID: 'Layak digunakan', MISSING: 'Belum tersedia', INVALID: 'Belum dapat dipercaya',
  STALE: 'Data kedaluwarsa', MOCK: 'SIMULASI',
}
