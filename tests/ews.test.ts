import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { assessWater, emptySource, formatWib, iso, readEwsPolicy, timestamp, weatherContext, type EwsSource } from '../lib/ews/data'
import { createWeatherService, normalizeForecast } from '../lib/ews/weather'
import { createFloodAssessment, floodNotification, simulationWater, unavailableAssessment } from '../lib/ews/assessment'
import { createAssessmentStore } from '../lib/ews/client-store'
import { calculateFloodStatus, getStaticRecommendation } from '../lib/thresholds'
import { readWaterLevels, saveWaterLevel } from '../lib/ews/water-server'
import { assessFlood } from '../lib/ews/assessment-server'
import FloodStatusPanel from '../components/features/FloodStatusPanel'

// Controlled provider/DB fixtures. No production access and no real observations.
const NOW = Date.parse('2026-11-17T04:00:00Z')
const END = Date.parse('2026-11-17T06:00:00Z')
const policy = readEwsPolicy()
const context = weatherContext({ lat: -6.31, lon: 107.29 })
const district = 'Telukjambe Timur'
const userId = 'synthetic-ews-account'
function payload(rain: unknown = 0, end = END) {
  return { cod: '200', list: [{ dt: end / 1000, rain: { '3h': rain },
    main: { temp: 28, humidity: 78 }, weather: [{ description: 'Fixture, bukan cuaca nyata' }] }] }
}
function waterFixture(level: unknown = .5, recorded = NOW - 300_000) {
  const row = { id: 'synthetic-water-id', district, river_level_m: level, updated_by: 'synthetic-officer', updated_at: iso(recorded) }
  const audit = { id: 'synthetic-audit', actor_id: row.updated_by, created_at: iso(recorded + 1000),
    meta: { schema_version: 'ews-water-entry-v1', current_reading: true, district, river_level_m: level, recorded_at: iso(recorded) } }
  return { row, audit }
}
function water(level: number = .5, recorded = NOW - 300_000) {
  const f = waterFixture(level, recorded)
  return assessWater(f.row, f.audit, district, NOW, policy)
}
function weather(rain = 0) { return normalizeForecast(payload(rain), context, iso(NOW), NOW, policy) }
function assessment(rain = 0, level = .5, override?: { weather?: EwsSource; water?: EwsSource; now?: number }) {
  const forecast = weather(rain)
  if (override?.weather) forecast.source_detail = override.weather
  return createFloodAssessment({ userId, weather: forecast, water: override?.water ?? water(level),
    now: override?.now ?? NOW, policy, demoAvailable: false })
}
const missingWeather = () => emptySource('FORECAST', context, NOW)
const missingWater = () => emptySource('MANUAL_REPORT', { coordinates: null, location_source: 'district', district }, NOW)

test('EWS: both required sources valid and below thresholds, including real zero, produce AMAN', () => {
  const data = assessment(0, 0)
  assert.equal(data.status, 'aman')
  assert.equal(data.complete, true)
  assert.equal(data.sources.weather.value, 0)
  assert.equal(data.sources.water.value, 0)
  assert.match(data.description, /bukan jaminan/)
})
test('EWS: warning and danger boundaries preserve 20/50 mm and 1.2 m thresholds', () => {
  assert.equal(assessment(19.999, 1.199).status, 'aman')
  assert.equal(assessment(20).status, 'waspada')
  assert.equal(assessment(49.999).status, 'waspada')
  assert.equal(assessment(50).status, 'bahaya')
  assert.equal(assessment(0, 1.2).status, 'bahaya')
})
test('EWS: unavailable weather with only a low water value produces UNKNOWN', () => {
  const data = assessment(0, .5, { weather: missingWeather() })
  assert.equal(data.status, 'unknown')
  assert.equal(data.sources.weather.quality, 'MISSING')
})
test('EWS: unavailable water with only low rainfall produces UNKNOWN', () => {
  assert.equal(assessment(0, .5, { water: missingWater() }).status, 'unknown')
})
test('EWS: both missing sources are neutral UNKNOWN, never a green check', () => {
  const data = assessment(0, .5, { weather: missingWeather(), water: missingWater() })
  assert.equal(data.status, 'unknown'); assert.equal(data.color, 'gray'); assert.equal(data.icon, 'help-circle')
})
test('EWS: either valid danger signal survives missing, invalid, stale or mock companion data', () => {
  for (const quality of ['MISSING', 'INVALID', 'STALE', 'MOCK'] as const) {
    const highWater = assessment(0, 1.2, { weather: { ...missingWeather(), quality } })
    const highRain = assessment(50, .5, { water: { ...missingWater(), quality } })
    assert.equal(highWater.status, 'bahaya'); assert.equal(highWater.complete, false)
    assert.equal(highRain.status, 'bahaya'); assert.equal(highRain.complete, false)
  }
})
test('EWS: valid warning signal remains visible with missing water', () => {
  assert.equal(assessment(20, .5, { water: missingWater() }).status, 'waspada')
})
test('EWS: missing/invalid/mock take precedence over stale; individual qualities remain visible', () => {
  const old = { ...water(), quality: 'STALE' as const }
  for (const quality of ['MISSING', 'INVALID', 'MOCK'] as const) {
    const data = assessment(0, .5, { weather: { ...missingWeather(), quality }, water: old })
    assert.equal(data.status, 'unknown')
    assert.equal(data.sources.weather.quality, quality)
    assert.equal(data.sources.water.quality, 'STALE')
  }
  assert.equal(assessment(0, .5, { water: old }).status, 'stale')
})
test('EWS: even falsely VALID nonfinite, negative or impossible values cannot reassure', () => {
  for (const value of [NaN, Infinity, -1, 1001, null]) {
    assert.equal(calculateFloodStatus({ quality: 'VALID', value }, water()).status, 'unknown')
  }
  for (const value of [NaN, Infinity, -1, 10.01, null]) {
    assert.equal(calculateFloodStatus(weather().source_detail, { quality: 'VALID', value }).status, 'unknown')
  }
})
test('EWS: mock-only numeric values cannot yield any operational warning or SAFE', () => {
  const data = assessment(0, .5, { weather: { ...missingWeather(), source: 'simulation', quality: 'MOCK', value: 100 },
    water: { ...simulationWater(NOW, district), value: 5 } })
  assert.equal(data.status, 'unknown')
  assert.ok(data.simulation)
  assert.equal(floodNotification(data)?.type, 'sistem')
})

test('weather: selected 3h forecast slot has explicit UTC validity and no invented observation/issuance', () => {
  const result = weather()
  assert.equal(result.quality, 'VALID')
  assert.equal(result.source_detail.valid_from, '2026-11-17T03:00:00.000Z')
  assert.equal(result.source_detail.valid_until, '2026-11-17T06:00:00.000Z')
  assert.equal(result.source_detail.observed_at, null)
  assert.equal(result.source_detail.issued_at, null)
})
test('weather: expired timeline remains STALE instead of arbitrary first-slot zero', () => {
  const result = normalizeForecast(payload(0, NOW - 1000), context, iso(NOW), NOW, policy)
  assert.equal(result.quality, 'STALE')
  assert.equal(result.source_detail.reason_code, 'FORECAST_EXPIRED')
})
test('weather: a future-only window is INVALID and empty timeline is not dry weather', () => {
  assert.equal(normalizeForecast(payload(0, NOW + 4 * 3600_000), context, iso(NOW), NOW, policy).quality, 'INVALID')
  assert.equal(normalizeForecast({ cod: '200', list: [] }, context, iso(NOW), NOW, policy).quality, 'INVALID')
})
test('weather: a boundary selects the next valid slot, never double counts periods', () => {
  const body = payload(50)
  body.list.push({ ...body.list[0], dt: (END + 3 * 3600_000) / 1000, rain: { '3h': 0 } })
  const atEnd = normalizeForecast(body, context, iso(END), END, policy)
  assert.equal(atEnd.quality, 'VALID'); assert.equal(atEnd.rain_3h_mm, 0)
  assert.equal(atEnd.source_detail.valid_from, iso(END))
})
test('weather: omitted rain is zero only within a valid documented OpenWeather slot', () => {
  const body: any = payload()
  delete body.list[0].rain
  assert.equal(normalizeForecast(body, context, iso(NOW), NOW, policy).rain_3h_mm, 0)
  for (const rain of [{}, null, { '3h': -1 }, { '3h': NaN }, { '3h': Infinity }, { '3h': '0' }]) {
    body.list[0].rain = rain
    assert.equal(normalizeForecast(body, context, iso(NOW), NOW, policy).quality, 'INVALID')
  }
})
test('weather: invalid, duplicate or reversed forecast timestamps fail closed', () => {
  for (const dt of [NaN, Infinity, '2026-11-17', -1]) {
    const body: any = payload(); body.list[0].dt = dt
    assert.equal(normalizeForecast(body, context, iso(NOW), NOW, policy).quality, 'INVALID')
  }
  const body = payload(); body.list.push({ ...body.list[0] })
  assert.equal(normalizeForecast(body, context, iso(NOW), NOW, policy).quality, 'INVALID')
  body.list[1].dt += 60 // distinct but overlapping 3h intervals must also fail
  assert.equal(normalizeForecast(body, context, iso(NOW), NOW, policy).quality, 'INVALID')
})
test('freshness: old retrieval stays stale and future/invalid retrieval timestamps are invalid', () => {
  assert.equal(normalizeForecast(payload(), context, iso(NOW - policy.weather_max_age_ms), NOW, policy).quality, 'STALE')
  for (const time of ['bad', '2026-11-17T04:00:00', iso(NOW + policy.clock_skew_ms + 1)]) {
    assert.equal(normalizeForecast(payload(), context, time, NOW, policy).quality, 'INVALID')
  }
})
test('freshness: explicit offsets normalize identically and Karawang formatting always uses WIB', () => {
  assert.equal(timestamp('2026-11-17T11:00:00+07:00'), NOW)
  assert.equal(timestamp('2026-02-30T04:00:00Z'), null)
  assert.equal(timestamp('2026-11-17'), null)
  assert.equal(normalizeForecast(payload(), context, '2026-11-17T11:00:00+07:00', NOW, policy).quality, 'VALID')
  assert.match(formatWib(iso(NOW)), /11[.:]00.*WIB/)
  assert.equal(formatWib('invalid'), 'Waktu tidak tersedia')
})
test('freshness: policy is configurable within bounds, malformed configuration fails closed', () => {
  const configured = readEwsPolicy({ EWS_WATER_MAX_AGE_MINUTES: '30', EWS_WEATHER_MAX_AGE_MINUTES: '15', EWS_CLOCK_SKEW_SECONDS: '60' })
  assert.equal(configured.water_max_age_ms, 30 * 60_000)
  for (const settings of [{ EWS_WATER_MAX_AGE_MINUTES: '-1' }, { EWS_WEATHER_MAX_AGE_MINUTES: '' }, { EWS_CLOCK_SKEW_SECONDS: '999999' }]) {
    const bad = readEwsPolicy(settings)
    assert.ok(bad.configuration_errors.length)
    assert.equal(normalizeForecast(payload(), context, iso(NOW), NOW, bad).quality, 'INVALID')
  }
})
test('assessment rechecks expiry after slow source lookups rather than emitting an expired AMAN', () => {
  const data = assessment(0, .5, { now: NOW + 2 * 3600_000 })
  assert.equal(data.status, 'stale')
  assert.equal(data.sources.weather.quality, 'STALE')
  assert.equal(data.sources.water.quality, 'STALE')
})

test('water: server-recorded current entry is explicit, not an invented sensor timestamp', () => {
  const result = water()
  assert.equal(result.quality, 'VALID'); assert.equal(result.observed_at, null)
  assert.equal(result.timestamp_basis, 'confirmed_current_entry')
  assert.equal(result.recorded_at, iso(NOW - 300_000))
})
test('water: fetching an old record now cannot make it fresh', () => {
  const result = water(.5, NOW - policy.water_max_age_ms)
  assert.equal(result.quality, 'STALE')
  assert.equal(result.retrieved_at, iso(NOW))
  assert.equal(result.recorded_at, iso(NOW - policy.water_max_age_ms))
})
test('water: fresh legacy/seed values without attestation are INVALID, never real readings', () => {
  const f = waterFixture()
  assert.equal(assessWater(f.row, null, district, NOW, policy).quality, 'INVALID')
  assert.equal(assessWater(f.row, null, district, NOW, policy).reason_code, 'UNVERIFIED_WATER_TIME')
})
test('water: wrong actor, district, value, confirmation or recorded time cannot attest a reading', () => {
  for (const change of [{ actor_id: 'other' }, { meta: { ...waterFixture().audit.meta, district: 'Other district' } },
    { meta: { ...waterFixture().audit.meta, river_level_m: 9 } },
    { meta: { ...waterFixture().audit.meta, current_reading: false } },
    { meta: { ...waterFixture().audit.meta, recorded_at: iso(NOW) } }]) {
    const f = waterFixture()
    assert.equal(assessWater(f.row, { ...f.audit, ...change }, district, NOW, policy).quality, 'INVALID')
  }
})
test('water: future readings beyond skew, wrong district and malformed records are INVALID', () => {
  const future = waterFixture(.5, NOW + policy.clock_skew_ms + 1)
  assert.equal(assessWater(future.row, future.audit, district, NOW, policy).quality, 'INVALID')
  for (const change of [{ updated_at: 'invalid' }, { river_level_m: NaN }, { river_level_m: '' }, { district: 'Other' }]) {
    const f = waterFixture()
    assert.equal(assessWater({ ...f.row, ...change }, f.audit, district, NOW, policy).quality, 'INVALID')
  }
})
test('freshness: small server clock skew is tolerated without changing the original timestamps', () => {
  const f = waterFixture(.5, NOW + policy.clock_skew_ms)
  f.audit.created_at = iso(NOW)
  const result = assessWater(f.row, f.audit, district, NOW, policy)
  assert.equal(result.quality, 'VALID')
  assert.equal(result.recorded_at, iso(NOW + policy.clock_skew_ms))
  assert.equal(normalizeForecast(payload(), context, iso(NOW + policy.clock_skew_ms), NOW, policy).quality, 'VALID')
})

function weatherService(options: { key?: string; enabled?: boolean; failed?: boolean } = {}) {
  let now = NOW, calls = 0, failed = options.failed ?? false
  const service = createWeatherService({ now: () => now, policy: () => policy, demoEnabled: () => options.enabled ?? false,
    apiKey: () => options.key,
    fetcher: (async () => { calls++; if (failed) throw new Error('secret-url?appid=synthetic-canary'); return new Response(JSON.stringify(payload())) }) as typeof fetch })
  return { service, calls: () => calls, advance: (ms: number) => { now += ms }, fail: () => { failed = true } }
}
test('weather service: no configuration or failed live provider returns MISSING, not mock', async () => {
  const absent = weatherService()
  assert.equal((await absent.service(context)).quality, 'MISSING'); assert.equal(absent.calls(), 0)
  const failed = weatherService({ key: 'synthetic-canary', failed: true })
  const result = await failed.service(context)
  assert.equal(result.quality, 'MISSING'); assert.equal(result.rain_3h_mm, null)
  assert.doesNotMatch(JSON.stringify(result), /synthetic-canary|appid=/)
})
test('weather service: production-disabled demo never fetches or returns simulated risk data', async () => {
  const prod = weatherService({ key: 'fixture', enabled: false })
  assert.equal((await prod.service(context, true)).quality, 'INVALID')
  assert.equal(prod.calls(), 0)
})
test('weather service: explicit demo is MOCK, segregated from live cache', async () => {
  const dev = weatherService({ key: 'fixture', enabled: true })
  assert.equal((await dev.service(context, true)).quality, 'MOCK')
  assert.equal(dev.calls(), 0)
  assert.equal((await dev.service(context)).quality, 'VALID'); assert.equal(dev.calls(), 1)
})
test('weather service: cache preserves retrieval timestamp and exact caller coordinates', async () => {
  const live = weatherService({ key: 'fixture' })
  const first = await live.service(context)
  live.advance(60_000)
  const cached = await live.service(context)
  assert.equal(cached.cached, true); assert.equal(live.calls(), 1)
  assert.equal(cached.source_detail.retrieved_at, first.source_detail.retrieved_at)
  const nextContext = weatherContext({ lat: -6.311, lon: 107.291 })
  const next = await live.service(nextContext)
  assert.deepEqual(next.location, nextContext.coordinates); assert.equal(live.calls(), 2)
})
test('weather service: failed refresh shows only STALE historical data with original retrieval time', async () => {
  const live = weatherService({ key: 'fixture' })
  const first = await live.service(context)
  live.advance(10 * 60_000); live.fail()
  const failed = await live.service(context)
  assert.equal(failed.quality, 'STALE')
  assert.equal(failed.source_detail.retrieved_at, first.source_detail.retrieved_at)
  assert.equal(failed.source_detail.reason_code, 'WEATHER_REFRESH_FAILED')
})
test('weather service: malformed coordinates are invalid instead of silently falling back', async () => {
  assert.deepEqual(weatherContext().coordinates, { lat: -6.31, lon: 107.29 })
  const live = weatherService({ key: 'fixture' })
  for (const coords of [{ lat: 999, lon: 1 }, { lat: 1 }, { lat: NaN, lon: 1 }]) {
    assert.equal((await live.service(weatherContext(coords))).quality, 'INVALID')
  }
  assert.equal(live.calls(), 0)
})
test('weather service: concurrent requests share one provider flight', async () => {
  let calls = 0
  let respond!: (value: Response) => void
  const service = createWeatherService({ now: () => NOW, policy: () => policy, apiKey: () => 'fixture', demoEnabled: () => false,
    fetcher: (() => { calls++; return new Promise<Response>((resolve) => { respond = resolve }) }) as typeof fetch })
  const first = service(context), second = service(context)
  assert.equal(calls, 1)
  respond(new Response(JSON.stringify(payload())))
  assert.equal((await first).quality, 'VALID'); assert.equal((await second).quality, 'VALID')
})

function render(data: ReturnType<typeof assessment> | null, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(FloodStatusPanel, { data, loading: false, error: null, refresh: () => {}, ...extra }))
}
test('UI: UNKNOWN/STALE/error/offline use neutral styling, explanations and retry, never green SAFE', () => {
  for (const data of [assessment(0, .5, { water: missingWater() }), assessment(0, .5, { water: { ...water(), quality: 'STALE' } }), null]) {
    const html = render(data)
    assert.doesNotMatch(html, /banner-aman|bg-green-|text-green-|lucide-circle-check/)
    assert.match(html, /Perbarui Data|Coba Lagi/)
    assert.match(html, /BELUM DIKETAHUI|DATA KEDALUWARSA/)
  }
  assert.doesNotMatch(render(assessment(), { offline: true }), /banner-aman/)
  assert.doesNotMatch(render(assessment(), { error: 'Provider belum tersedia' }), /banner-aman/)
})
test('UI: loading, danger and simulation clearly distinguish current indicators from examples', () => {
  assert.match(render(null, { loading: true }), /role="status"/)
  assert.match(render(assessment(50)), /banner-bahaya/)
  const data = assessment(0, .5, { weather: { ...missingWeather(), source: 'simulation', quality: 'MOCK', value: 15 }, water: simulationWater(NOW, district) })
  const html = render(data)
  assert.match(html, /<h2[^>]*>SIMULASI<\/h2>/)
  assert.doesNotMatch(html, /banner-aman/)
  const realDanger = assessment(0, 1.2, { weather: { ...missingWeather(), quality: 'MOCK', source: 'simulation', value: 15 } })
  assert.equal(realDanger.simulation, null)
  assert.match(render(realDanger), /banner-bahaya/)
  assert.match(floodNotification(realDanger)!.title, /BAHAYA/)
})
test('UI/notifications: derive identical status/context/time from the same assessment, not a second location fetch', () => {
  const data = assessment(50, .5, { water: missingWater() })
  const notice = floodNotification(data)!
  const html = render(data)
  assert.equal(notice.assessmentContext, data.context_id)
  assert.equal(notice.riskStatus, data.status)
  assert.equal(notice.time, data.evaluated_at)
  assert.equal(notice.timeLabel, 'Penilaian server')
  assert.match(html, new RegExp(`data-risk-status="${notice.riskStatus}"`))
  assert.ok(html.includes(data.context_id.replaceAll('"', '&quot;')))
  assert.match(html, /WIB/); assert.match(html, /bukan pengukuran sawah/)
  assert.match(notice.description, /Belum tersedia/)
  assert.equal(floodNotification(assessment()), null)
})
test('UI/notifications: expired assessments become neutral notices with their original server time', () => {
  const old = assessment(50)
  const expired = unavailableAssessment(old, 'Perlu diperbarui', true)!
  assert.equal(floodNotification(expired)?.type, 'sistem')
  assert.equal(floodNotification(expired)?.time, old.evaluated_at)
  assert.match(render(expired), /DATA KEDALUWARSA/)
  assert.doesNotMatch(getStaticRecommendation('unknown').join(' '), /lanjutkan aktivitas/)
})
test('UI: displayed precision does not round safe inputs across the warning/danger boundaries', () => {
  const html = render(assessment(19.999, 1.199))
  assert.match(html, /banner-aman/)
  assert.match(html, /19,999/)
  assert.match(html, /1,199/)
})

function timerFixture() {
  let now = 0, id = 0
  const tasks = new Map<number, { at: number; run: () => void }>()
  return {
    elapsed: () => now,
    schedule: ((run: () => void, delay: number) => { const key = ++id; tasks.set(key, { at: now + delay, run }); return key }) as unknown as typeof setTimeout,
    clear: ((key: number) => { tasks.delete(key) }) as unknown as typeof clearTimeout,
    advance: (ms: number, run = true) => { now += ms; if (run) for (const [key, task] of [...tasks]) if (task.at <= now) { tasks.delete(key); task.run() } },
  }
}
test('shared controller: simultaneous hero/notification refreshes coalesce into one load/context', async () => {
  let calls = 0
  const timers = timerFixture()
  const store = createAssessmentStore({ ...timers, userId, load: async () => { calls++; return { data: assessment(20), error: null } } })
  const first = store.refresh(), second = store.refresh()
  assert.equal(first, second)
  await first
  assert.equal(calls, 1)
  const shared = store.getSnapshot().data!
  assert.equal(floodNotification(shared)?.riskStatus, 'waspada')
  store.cancel()
})
test('shared controller: server lease expires without relying on device wall clock or active timers', async () => {
  const timers = timerFixture()
  const store = createAssessmentStore({ ...timers, userId, load: async () => ({ data: assessment(), error: null }) })
  await store.refresh()
  timers.advance(60_000, false)
  assert.equal(store.getSnapshot().data?.status, 'stale')
  store.cancel()
})
test('shared controller: offline/failure never leaves a previous AMAN current', async () => {
  const timers = timerFixture()
  let failed = false
  const store = createAssessmentStore({ ...timers, userId, load: async () => {
    if (failed) throw new Error('fixture connection error')
    return { data: assessment(), error: null }
  } })
  await store.refresh(); store.disconnect()
  assert.equal(store.getSnapshot().offline, true)
  assert.equal(store.getSnapshot().data?.status, 'unknown')
  failed = true; await store.refresh()
  assert.equal(store.getSnapshot().data?.status, 'unknown')
  store.cancel()
})
test('shared controller: wrong-account and expired-in-transit results fail closed', async () => {
  for (const wrong of [true, false]) {
    const timers = timerFixture()
    const store = createAssessmentStore({ ...timers, userId, load: async () => {
      timers.advance(61_000, false)
      return { data: { ...assessment(), user_id: wrong ? 'another-account' : userId }, error: null }
    } })
    await store.refresh()
    assert.notEqual(store.getSnapshot().data?.status, 'aman')
    store.cancel()
  }
})
test('shared controller: pause/account teardown ignores late responses', async () => {
  const timers = timerFixture()
  let complete!: (value: { data: ReturnType<typeof assessment>; error: null }) => void
  const store = createAssessmentStore({ ...timers, userId, load: () => new Promise((resolve) => { complete = resolve }) })
  const pending = store.refresh()
  await Promise.resolve()
  store.pause()
  complete({ data: assessment(), error: null })
  await pending
  assert.equal(store.getSnapshot().data, null)
  assert.equal(store.getSnapshot().loading, false)
})
test('shared controller: timeout shows unavailable and late completion cannot restore SAFE', async () => {
  const timers = timerFixture()
  let complete!: (value: { data: ReturnType<typeof assessment>; error: null }) => void
  const store = createAssessmentStore({ ...timers, userId, load: () => new Promise((resolve) => { complete = resolve }) })
  const pending = store.refresh()
  await Promise.resolve(); timers.advance(20_000)
  await pending
  complete({ data: assessment(), error: null }); await Promise.resolve()
  assert.equal(store.getSnapshot().data, null)
  assert.ok(store.getSnapshot().error)
  store.cancel()
})
test('shared controller: explicit simulation switch ignores an older live response', async () => {
  const timers = timerFixture()
  const pending: ((value: { data: ReturnType<typeof assessment>; error: null }) => void)[] = []
  const store = createAssessmentStore({ ...timers, userId, load: () => new Promise((resolve) => { pending.push(resolve) }) })
  const live = store.refresh(false); await Promise.resolve()
  const demo = store.refresh(true); await Promise.resolve()
  const simulated = assessment(0, .5, { weather: { ...missingWeather(), source: 'simulation', quality: 'MOCK', value: 15 }, water: simulationWater(NOW, district) })
  pending[1]({ data: simulated, error: null }); await demo
  pending[0]({ data: assessment(), error: null }); await live
  assert.equal(store.getSnapshot().data?.simulation?.label, simulated.simulation?.label)
  assert.equal(store.getSnapshot().data?.status, 'unknown')
  store.cancel()
})

function waterDependencies(role: string | null = 'ppl') {
  let row: any = null, audit: any = null, failAudit = false, writes = 0, adminCalls = 0
  const client: any = {
    auth: { getUser: async () => ({ data: { user: role === null ? null : { id: 'synthetic-officer' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: async () => ({ data: { role, poktan_id: 'synthetic-group' }, error: null }) }) }) }
      if (table === 'poktan') return { select: () => ({ eq: () => ({ single: async () => ({ data: { district }, error: null }) }) }) }
      const query: any = { select: () => query, order: () => query, limit: () => query, eq: () => query,
        then: (resolve: any) => Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve),
        upsert: (value: unknown) => { writes++; row = { id: 'synthetic-water-id', ...value as any }; return query },
        single: async () => ({ data: row, error: null }) }
      return query
    },
  }
  const admin = () => {
    adminCalls++
    return { from: () => {
      const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        insert: (value: any) => { if (!failAudit) audit = { id: 'synthetic-audit', ...value, created_at: iso(NOW) }; return query },
        single: async () => ({ data: audit, error: failAudit ? {} : null }),
        maybeSingle: async () => ({ data: audit, error: failAudit ? {} : null }) }
      return query
    } } as any
  }
  return { client, admin, now: () => NOW, policy: () => policy,
    counts: () => ({ writes, adminCalls }), row: () => row,
    seed: () => { row = waterFixture().row; audit = null }, failAudit: () => { failAudit = true } }
}
test('water writes: anonymous/farmers cannot mutate or acquire privileged audit access', async () => {
  for (const role of [null, 'petani']) {
    const deps = waterDependencies(role)
    assert.ok((await saveWaterLevel({ district, river_level_m: .5, current_reading: true }, deps)).error)
    assert.deepEqual(deps.counts(), { writes: 0, adminCalls: 0 })
  }
})
test('water writes: PPL/Dinas stamp actual server update time and ignore supplied timestamp/actor', async () => {
  for (const role of ['ppl', 'dinas']) {
    const deps = waterDependencies(role)
    const result = await saveWaterLevel({ district, river_level_m: .5, current_reading: true,
      updated_at: '2099-01-01T00:00:00Z', updated_by: 'attacker' } as any, deps)
    assert.equal(result.error, null)
    assert.equal(deps.row().updated_at, iso(NOW))
    assert.equal(deps.row().updated_by, 'synthetic-officer')
    assert.equal(result.data?.source_detail.quality, 'VALID')
  }
})
test('water writes: missing current-reading confirmation or invalid values cannot stamp freshness', async () => {
  const deps = waterDependencies()
  for (const value of [NaN, Infinity, -1, 11]) {
    assert.ok((await saveWaterLevel({ district, river_level_m: value, current_reading: true }, deps)).error)
  }
  assert.ok((await saveWaterLevel({ district, river_level_m: .5 }, deps)).error)
  assert.equal(deps.counts().writes, 0)
})
test('water writes: audit failure is explicit and a persisted value cannot become VALID without evidence', async () => {
  const deps = waterDependencies(); deps.failAudit()
  const result = await saveWaterLevel({ district, river_level_m: .5, current_reading: true }, deps)
  assert.match(result.error!, /Nilai tinggi air tersimpan/)
  const read = await readWaterLevels(deps, district, true)
  assert.equal(read.data?.[0].source_detail.quality, 'INVALID')
})
test('water reads: page refresh never stamps seed/legacy rows, and anonymous reads are denied', async () => {
  const deps = waterDependencies(); deps.seed()
  const before = structuredClone(deps.row())
  const read = await readWaterLevels(deps, district, true)
  assert.equal(read.data?.[0].source_detail.quality, 'INVALID')
  assert.deepEqual(deps.row(), before); assert.equal(deps.counts().writes, 0)
  const anonymous = waterDependencies(null)
  assert.ok((await readWaterLevels(anonymous)).error)
  assert.equal(anonymous.counts().adminCalls, 0)
})

test('server assessment: authentication/account mismatch fails before any weather or privileged evidence query', async () => {
  for (const role of [null, 'ppl']) {
    const deps = waterDependencies(role)
    let calls = 0
    const result = await assessFlood({ ...deps, demoEnabled: () => false, weather: async () => { calls++; return weather() } },
      undefined, { expectedUserId: 'wrong-account' })
    assert.equal(result.data, null)
    assert.equal(calls, 0); assert.equal(deps.counts().adminCalls, 0)
  }
})
test('server assessment: weather failure cannot suppress a verified high-water warning', async () => {
  const deps = waterDependencies()
  await saveWaterLevel({ district, river_level_m: 1.2, current_reading: true }, deps)
  const result = await assessFlood({ ...deps, demoEnabled: () => false, weather: async () => { throw new Error('fixture offline') } })
  assert.equal(result.data?.status, 'bahaya')
  assert.equal(result.data?.sources.weather.quality, 'MISSING')
  assert.equal(result.data?.sources.water.quality, 'VALID')
})
test('server assessment: water lookup failure cannot suppress a valid high-rain warning', async () => {
  const deps = waterDependencies()
  const from = deps.client.from
  deps.client.from = (table: string) => { if (table === 'water_levels') throw new Error('fixture DB unavailable'); return from(table) }
  const result = await assessFlood({ ...deps, demoEnabled: () => false, weather: async () => weather(50) })
  assert.equal(result.data?.status, 'bahaya')
  assert.equal(result.data?.sources.water.quality, 'MISSING')
})
test('server assessment: successful orchestration shares queried location/district, server time and safe-input requirements', async () => {
  const deps = waterDependencies()
  await saveWaterLevel({ district, river_level_m: .5, current_reading: true }, deps)
  let receivedContext: unknown
  const coords = { lat: -6.3, lon: 107.5 }
  const result = await assessFlood({ ...deps, demoEnabled: () => false, weather: async (ctx) => {
    receivedContext = ctx
    return normalizeForecast(payload(), ctx, iso(NOW), NOW, policy)
  } }, coords)
  assert.deepEqual(receivedContext, weatherContext(coords))
  assert.equal(result.data?.sources.water.context.district, district)
  assert.equal(result.data?.status, 'aman')
  assert.equal(result.data?.evaluated_at, iso(NOW))
  assert.equal(result.data?.user_id, 'synthetic-officer')
})
