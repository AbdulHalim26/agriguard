import { calculateFloodStatus, type FloodStatus, type FloodStatusResult } from '@/lib/thresholds'
import { emptySource, formatWib, iso, timestamp, QUALITY_LABELS, type EwsPolicy, type EwsSource } from './data'
import type { WeatherData } from './weather'

export interface FloodAssessment extends FloodStatusResult {
  user_id: string
  context_id: string
  evaluated_at: string
  recheck_at: string
  valid_for_ms: number
  policy: EwsPolicy
  sources: { weather: EwsSource; water: EwsSource }
  rain_3h_mm: number | null
  water_level_m: number | null
  last_updated: string | null
  source: WeatherData['source']
  location_source: WeatherData['location_source']
  demo_available: boolean
  simulation: { label: string; scenario_status: FloodStatus } | null
}

export function createFloodAssessment(input: {
  userId: string; weather: WeatherData; water: EwsSource; policy: EwsPolicy; now: number; demoAvailable: boolean
}): FloodAssessment {
  const { weather, water, now } = input
  // Another source lookup may have crossed a validity boundary since parsing.
  const recheck = (source: EwsSource): EwsSource => {
    if (source.quality !== 'VALID') return source
    const expires = timestamp(source.expires_at), retrieved = timestamp(source.retrieved_at)
    if (input.policy.configuration_errors.length || expires === null || retrieved === null || retrieved > now + input.policy.clock_skew_ms) {
      return { ...source, quality: 'INVALID', reason_code: 'INVALID_SOURCE_TIME', reason: 'Waktu atau kebijakan sumber tidak valid.' }
    }
    if (expires <= now) return { ...source, quality: 'STALE', reason_code: 'SOURCE_EXPIRED_DURING_ASSESSMENT',
      reason: 'Data melewati masa berlaku sebelum penilaian selesai. Perbarui sumber ini.' }
    return source
  }
  const sources = { weather: recheck(weather.source_detail), water: recheck(water) }
  const result = calculateFloodStatus(sources.weather, sources.water)
  const expiries = Object.values(sources).filter((s) => s.quality === 'VALID' && s.expires_at)
    .map((s) => Date.parse(s.expires_at!))
  const recheckAt = Math.max(now, Math.min(now + 60_000, ...expiries))
  const coords = sources.weather.context.coordinates
  const simulation = Object.values(sources).every((s) => s.quality === 'MOCK' && s.source === 'simulation')
    ? { label: 'SIMULASI — contoh indikator di bawah ambang, bukan keadaan nyata', scenario_status: 'aman' as const } : null
  return { ...result, user_id: input.userId,
    context_id: JSON.stringify([coords, sources.weather.context.location_source, water.context.district, simulation ? 'simulation' : 'live']),
    evaluated_at: iso(now), recheck_at: iso(recheckAt), valid_for_ms: recheckAt - now, policy: input.policy, sources,
    rain_3h_mm: sources.weather.value, water_level_m: water.value,
    last_updated: water.recorded_at, source: weather.source, location_source: weather.location_source,
    demo_available: input.demoAvailable, simulation }
}

export function unavailableAssessment(data: FloodAssessment | null, reason: string, stale = false): FloodAssessment | null {
  if (!data) return null
  const unavailable = (source: EwsSource): EwsSource => source.quality === 'VALID'
    ? { ...source, quality: 'STALE', reason_code: 'ASSESSMENT_NOT_CURRENT', reason } : source
  return { ...data, status: stale ? 'stale' : 'unknown', label: stale ? 'DATA KEDALUWARSA' : 'BELUM DIKETAHUI',
    color: 'gray', icon: stale ? 'clock' : 'help-circle', complete: false, description: reason, valid_for_ms: 0,
    sources: { weather: unavailable(data.sources.weather), water: unavailable(data.sources.water) } }
}

export function simulationWater(now: number, district: string | null): EwsSource {
  return { ...emptySource('MANUAL_REPORT', { coordinates: null, location_source: 'district', district }, now,
    'MOCK', 'SIMULASI — tinggi air contoh, bukan laporan petugas.', 'EXPLICIT_SIMULATION'), source: 'simulation', value: 0.5 }
}

export function sourceSummary(data: FloodAssessment): string {
  const { weather, water } = data.sources
  return `Cuaca: ${QUALITY_LABELS[weather.quality]}${weather.valid_until ? `, berlaku sampai ${formatWib(weather.valid_until)}` : ''}. ` +
    `Air ${water.context.district || '(kecamatan belum tersedia)'}: ${QUALITY_LABELS[water.quality]}` +
    `${water.recorded_at ? `, dicatat ${formatWib(water.recorded_at)}` : ''}.`
}

// Hero and notifications consume this SAME immutable server assessment/context.
export function floodNotification(data: FloodAssessment | null) {
  if (!data || (data.status === 'aman' && !data.simulation)) return null
  const warning = !data.simulation && (data.status === 'bahaya' || data.status === 'waspada')
  return { id: `flood-${data.context_id}-${data.evaluated_at}-${data.status}`,
    type: warning ? 'peringatan' as const : 'sistem' as const,
    title: data.simulation ? 'SIMULASI EWS — bukan keadaan nyata' : `Indikator banjir — ${data.label}`,
    description: `${data.description} ${sourceSummary(data)}`,
    time: data.evaluated_at, timeLabel: 'Penilaian server', href: '/dashboard',
    assessmentContext: data.context_id, riskStatus: data.status }
}
