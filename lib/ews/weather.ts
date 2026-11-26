import { z } from 'zod'
import { emptySource, finiteValue, iso, timestamp, type EwsPolicy, type EwsSource, type SourceContext } from './data'

const THREE_HOURS = 3 * 60 * 60_000
const CACHE_MS = 10 * 60_000
const slotSchema = z.object({
  dt: z.number().int().min(946684800).max(4102444800),
  // OWM explicitly omits rain when the phenomenon is absent. A present malformed
  // rain object is NOT dry weather, and an empty timeline is NEVER zero rain.
  rain: z.object({ '3h': z.number().finite().min(0).max(1000) }).optional(),
  main: z.unknown().optional(), weather: z.unknown().optional(),
})
const forecastSchema = z.object({ cod: z.union([z.literal('200'), z.literal(200)]), list: z.array(slotSchema).min(1).max(48) })

export interface WeatherData {
  rain_3h_mm: number | null
  temperature: number | null
  humidity: number | null
  description: string
  source: 'openweathermap' | 'mock' | 'unavailable'
  location: { lat: number; lon: number } | null
  location_source: SourceContext['location_source']
  quality: EwsSource['quality']
  source_detail: EwsSource
  evaluated_at: string
  cached: boolean
  cache_age_ms: number | null
}

export function weatherResult(source: EwsSource, now: number,
  extra: Partial<Pick<WeatherData, 'temperature' | 'humidity' | 'description' | 'cached' | 'cache_age_ms'>> = {}): WeatherData {
  return { rain_3h_mm: source.value, temperature: null, humidity: null, description: source.reason,
    source: source.quality === 'MOCK' ? 'mock' : source.value === null ? 'unavailable' : 'openweathermap',
    location: source.context.coordinates, location_source: source.context.location_source,
    quality: source.quality, source_detail: source, evaluated_at: iso(now), cached: false, cache_age_ms: null, ...extra }
}

export function normalizeForecast(payload: unknown, context: SourceContext, retrievedAt: string,
  now: number, policy: EwsPolicy): WeatherData {
  const source = emptySource('FORECAST', context, now)
  source.retrieved_at = retrievedAt
  const fail = (quality: EwsSource['quality'], code: string, reason: string) => weatherResult({ ...source, quality, reason_code: code, reason }, now)
  if (policy.configuration_errors.length) return fail('INVALID', 'POLICY_INVALID', 'Konfigurasi kesegaran data perlu diperiksa pengelola.')
  if (!context.coordinates) return fail('INVALID', 'INVALID_LOCATION', 'Koordinat cuaca tidak valid; tidak dialihkan diam-diam ke lokasi lain.')
  const retrieved = timestamp(retrievedAt)
  if (retrieved === null || retrieved > now + policy.clock_skew_ms) return fail('INVALID', 'INVALID_RETRIEVAL_TIME', 'Waktu penerimaan prakiraan tidak valid.')
  const parsed = forecastSchema.safeParse(payload)
  if (!parsed.success) return fail('INVALID', 'INVALID_FORECAST', 'Format, angka, atau waktu prakiraan cuaca tidak valid.')
  const slots = parsed.data.list
  if (slots.some((s, i) => i > 0 && s.dt - slots[i - 1].dt < THREE_HOURS / 1000)) {
    return fail('INVALID', 'INVALID_TIMELINE', 'Urutan atau periode prakiraan tumpang tindih dan tidak valid.')
  }
  // rain.3h belongs to the 3-hour slot ending at list.dt, NOT an observation at
  // the phone or an arbitrary rolling next-three-hour sum. Exact end is expired.
  const slot = slots.find((s) => s.dt * 1000 - THREE_HOURS <= now && now < s.dt * 1000)
  const chosen = slot ?? slots[slots.length - 1]
  source.record_id = String(chosen.dt)
  source.valid_from = iso(chosen.dt * 1000 - THREE_HOURS)
  source.valid_until = iso(chosen.dt * 1000)
  source.value = chosen.rain === undefined ? 0 : chosen.rain['3h']
  source.timestamp_basis = 'forecast_interval'
  source.expires_at = iso(Math.min(chosen.dt * 1000, retrieved + policy.weather_max_age_ms))
  if (!slot) {
    if (chosen.dt * 1000 <= now) return fail('STALE', 'FORECAST_EXPIRED', 'Seluruh periode prakiraan sudah berakhir. Data ini bukan kondisi saat ini.')
    return fail('INVALID', 'FORECAST_WINDOW_MISSING', 'Tidak ada periode prakiraan yang mencakup waktu penilaian saat ini.')
  }
  if (retrieved + policy.weather_max_age_ms <= now) return fail('STALE', 'WEATHER_RETRIEVAL_EXPIRED', 'Prakiraan belum diperbarui dalam batas umur penerimaan data.')
  const main = slot.main as { temp?: unknown; humidity?: unknown } | null
  const conditions = slot.weather as { description?: unknown }[] | null
  const description = Array.isArray(conditions) && typeof conditions[0]?.description === 'string'
    ? conditions[0].description.slice(0, 160) : 'Prakiraan cuaca'
  return weatherResult({ ...source, quality: 'VALID', reason_code: 'CURRENT_FORECAST_SLOT',
    reason: 'Prakiraan OpenWeather pada periode 3 jam ini; bukan pengukuran sawah. Waktu produksi prakiraan tidak disediakan.' }, now, {
    temperature: finiteValue(main?.temp, -100, 70) ? main.temp : null,
    humidity: finiteValue(main?.humidity, 0, 100) ? main.humidity : null,
    description,
  })
}

export function createWeatherService(deps: {
  now: () => number
  fetcher: typeof fetch
  apiKey: () => string | undefined
  policy: () => EwsPolicy
  demoEnabled: () => boolean
}) {
  const cache = new Map<string, { payload: unknown; retrievedAt: string }>()
  const flights = new Map<string, Promise<{ payload: unknown; retrievedAt: string }>>()
  return async (context: SourceContext, simulation = false): Promise<WeatherData> => {
    const now = deps.now(), policy = deps.policy()
    const unavailable = (quality: EwsSource['quality'], reason: string, code: string) =>
      weatherResult(emptySource('FORECAST', context, now, quality, reason, code), now)
    if (!context.coordinates) return unavailable('INVALID', 'Koordinat cuaca tidak valid.', 'INVALID_LOCATION')
    if (simulation) {
      if (!deps.demoEnabled()) return unavailable('INVALID', 'Simulasi EWS tidak diaktifkan pada lingkungan ini.', 'DEMO_DISABLED')
      const source = emptySource('FORECAST', context, now, 'MOCK', 'SIMULASI — angka contoh, bukan prakiraan nyata.', 'EXPLICIT_SIMULATION')
      return weatherResult({ ...source, source: 'simulation', value: 15 }, now, { temperature: 28, humidity: 78, description: 'SIMULASI — hujan ringan' })
    }
    if (policy.configuration_errors.length) return unavailable('INVALID', 'Konfigurasi kesegaran data perlu diperiksa pengelola.', 'POLICY_INVALID')
    const apiKey = deps.apiKey()?.trim()
    if (!apiKey) return unavailable('MISSING', 'Layanan cuaca belum dikonfigurasi. Tidak menggunakan angka simulasi sebagai pengganti.', 'WEATHER_NOT_CONFIGURED')
    const { lat, lon } = context.coordinates
    // Exact query context. No reuse of another caller's rounded coordinates.
    const key = JSON.stringify([lat, lon])
    const saved = cache.get(key)
    const age = saved ? now - Date.parse(saved.retrievedAt) : Infinity
    const fromSaved = () => ({ ...normalizeForecast(saved!.payload, context, saved!.retrievedAt, deps.now(), deps.policy()),
      cached: true, cache_age_ms: Math.max(0, deps.now() - Date.parse(saved!.retrievedAt)) })
    if (saved && age >= 0 && age < Math.min(CACHE_MS, policy.weather_max_age_ms)) {
      const result = fromSaved()
      if (result.quality === 'VALID') return result
    }
    try {
      let flight = flights.get(key)
      if (!flight) {
        flight = (async () => {
          const url = new URL('https://api.openweathermap.org/data/2.5/forecast')
          url.search = new URLSearchParams({ lat: String(lat), lon: String(lon), appid: apiKey, units: 'metric', lang: 'id' }).toString()
          const response = await deps.fetcher(url.toString(), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) })
          if (!response.ok) throw new Error('WEATHER_UNAVAILABLE')
          return { payload: await response.json(), retrievedAt: iso(deps.now()) }
        })()
        flights.set(key, flight)
      }
      let received
      try { received = await flight } finally { if (flights.get(key) === flight) flights.delete(key) }
      const result = normalizeForecast(received.payload, context, received.retrievedAt, deps.now(), deps.policy())
      if (result.quality === 'VALID') {
        if (cache.size >= 128 && !cache.has(key)) cache.delete(cache.keys().next().value!)
        cache.set(key, received)
      }
      return result
    } catch {
      // Never expose upstream errors/URLs containing the API key.
      if (saved) {
        const old = fromSaved()
        const source = { ...old.source_detail, quality: 'STALE' as const, reason_code: 'WEATHER_REFRESH_FAILED',
          reason: 'Layanan cuaca gagal diperbarui. Data terakhir hanya ditampilkan sebagai riwayat.' }
        return { ...old, quality: source.quality, source_detail: source }
      }
      return weatherResult(emptySource('FORECAST', context, deps.now(), 'MISSING',
        'Layanan cuaca belum dapat diakses. Coba lagi; kondisi aman belum dapat disimpulkan.', 'WEATHER_UNAVAILABLE'), deps.now())
    }
  }
}
