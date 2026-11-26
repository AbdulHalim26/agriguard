import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { emptySource, weatherContext, type Coordinates, type EwsPolicy, type SourceContext } from './data'
import { readWaterLevels } from './water-server'
import { createFloodAssessment, simulationWater, type FloodAssessment } from './assessment'
import { weatherResult, type WeatherData } from './weather'

export async function assessFlood(deps: {
  client: SupabaseClient
  admin: () => SupabaseClient
  now: () => number
  policy: () => EwsPolicy
  demoEnabled: () => boolean
  weather: (context: SourceContext, simulation: boolean) => Promise<WeatherData>
}, coords?: Coordinates, options: { simulation?: boolean; expectedUserId?: string } = {}):
  Promise<{ data: FloodAssessment | null; error: string | null }> {
  const { data: { user }, error: authError } = await deps.client.auth.getUser()
  if (authError || !user || (options.expectedUserId && options.expectedUserId !== user.id)) {
    return { data: null, error: 'Sesi atau akun berubah. Masuk kembali untuk memperbarui EWS.' }
  }
  const { data: profile } = await deps.client.from('profiles').select('poktan_id').eq('id', user.id).single()
  let district: string | null = null
  if (profile?.poktan_id) {
    const { data: group } = await deps.client.from('poktan').select('district').eq('id', profile.poktan_id).single()
    district = group?.district || null
  }
  const policy = deps.policy(), context = weatherContext(coords)
  let forecast: WeatherData
  try { forecast = await deps.weather(context, options.simulation === true) }
  catch {
    forecast = weatherResult(emptySource('FORECAST', context, deps.now(), 'MISSING',
      'Layanan cuaca belum dapat diakses. Sumber air yang valid tetap diperiksa.', 'WEATHER_UNAVAILABLE'), deps.now())
  }
  let water = emptySource('MANUAL_REPORT', { coordinates: null, location_source: 'district', district }, deps.now(),
    'MISSING', district ? 'Belum ada laporan tinggi air untuk kecamatan Poktan.' : 'Kecamatan Poktan belum tersedia.')
  if (options.simulation === true && deps.demoEnabled()) water = simulationWater(deps.now(), district)
  else if (district) {
    try {
      const result = await readWaterLevels(deps, district, true)
      water = result.data?.[0]?.source_detail ?? { ...water, reason: result.error || water.reason }
    } catch {
      water = { ...water, reason: 'Layanan tinggi air belum dapat diakses. Indikator hujan yang valid tetap diperiksa.' }
    }
  }
  return { data: createFloodAssessment({ userId: user.id, weather: forecast, water, policy,
    now: deps.now(), demoAvailable: deps.demoEnabled() }), error: null }
}
