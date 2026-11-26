import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BMKG_CACHE_TTL_MS,
  BMKG_RATE_LIMIT_PER_MIN,
  createBmkgService,
  extractCapLinksFromRss,
  formatBmkgWib,
  isAllowedBmkgUrl,
  parseBmkgCapAlertXml,
  parseBmkgForecastPayload,
  parseCapPolygon,
  resolveLocationToAdm4,
} from '@/lib/ews/bmkg'
import FloodStatusPanel from '@/components/features/FloodStatusPanel'
import { createFloodAssessment } from '@/lib/ews/assessment'
import { emptySource, readEwsPolicy, weatherContext } from '@/lib/ews/data'
import { weatherResult } from '@/lib/ews/weather'

const LAHAN_A_POLY = [[107.31, -6.33], [107.3104, -6.33], [107.3104, -6.3304], [107.31, -6.3304]]
const LAHAN_B_POLY = [[107.312, -6.332], [107.3125, -6.332], [107.3125, -6.3325], [107.312, -6.3325]]

function sampleBmkgPayload(adm4 = '32.15.03.2001') {
  return {
    lokasi: {
      adm4,
      desa: 'Telukjambe',
      kecamatan: 'Telukjambe Timur',
      kotkab: 'Karawang',
      provinsi: 'Jawa Barat',
      timezone: 'Asia/Jakarta',
    },
    data: [
      {
        cuaca: [
          [
            {
              utc_datetime: '2026-11-26 15:00:00',
              local_datetime: '2026-11-26 22:00:00',
              analysis_date: '2026-11-26T12:00:00',
              t: 27,
              hu: 88,
              weather_desc: 'Berawan',
              ws: 4.5,
              wd: 'SE',
            },
          ],
        ],
      },
    ],
  }
}

test('TAHAP B spatial matrix: fail-closed adm4 resolution with zero radius/nearest-neighbor guessing', () => {
  // 1. Farmer A GPS strictly inside Lahan A (Telukjambe Timur) -> verified 32.15.03.2001
  const farmerAIn = resolveLocationToAdm4({
    deviceCoords: { lat: -6.3302, lon: 107.3102 },
    registeredLahan: { village: 'Desa Uji A', district: 'Telukjambe Timur', polygon: LAHAN_A_POLY },
  })
  assert.equal(farmerAIn.location_source, 'device')
  assert.equal(farmerAIn.adm4, '32.15.03.2001')

  // 2. Farmer B GPS strictly inside Lahan B (Telukjambe Barat) -> verified 32.15.27.2001
  const farmerBIn = resolveLocationToAdm4({
    deviceCoords: { lat: -6.33225, lon: 107.31225 },
    registeredLahan: { village: 'Desa Uji B', district: 'Telukjambe Barat', polygon: LAHAN_B_POLY },
  })
  assert.equal(farmerBIn.location_source, 'device')
  assert.equal(farmerBIn.adm4, '32.15.27.2001')

  // 3. Coordinate on boundary of Lahan A -> accepted (BOUNDARY)
  const onBoundary = resolveLocationToAdm4({
    deviceCoords: { lat: -6.33, lon: 107.3102 },
    registeredLahan: { village: 'Desa Uji A', district: 'Telukjambe Timur', polygon: LAHAN_A_POLY },
  })
  assert.equal(onBoundary.location_source, 'device')
  assert.equal(onBoundary.adm4, '32.15.03.2001')

  // 4. Coordinate just outside boundary (near border) -> FAIL CLOSED (no radius guessing!)
  const nearOutside = resolveLocationToAdm4({
    deviceCoords: { lat: -6.329, lon: 107.3102 },
    registeredLahan: { village: 'Desa Uji A', district: 'Telukjambe Timur', polygon: LAHAN_A_POLY },
  })
  assert.equal(nearOutside.location_source, 'unverified')
  assert.equal(nearOutside.adm4, null)

  // 5. Coordinate far outside registry (Papua) -> FAIL CLOSED
  const farOut = resolveLocationToAdm4({ deviceCoords: { lat: -2.53, lon: 140.71 }, registeredLahan: null })
  assert.equal(farOut.location_source, 'unverified')
  assert.equal(farOut.adm4, null)

  // 6. Invalid coordinates (NaN / >90) -> FAIL CLOSED
  const invalidCoords = resolveLocationToAdm4({ deviceCoords: { lat: 999, lon: NaN }, registeredLahan: null })
  assert.equal(invalidCoords.location_source, 'unverified')
  assert.equal(invalidCoords.adm4, null)

  // 7. GPS denied (null) with verified registered lahan -> registered_lahan (NEVER 'device')
  const gpsDenied = resolveLocationToAdm4({
    deviceCoords: null,
    registeredLahan: { village: 'Desa Uji A', district: 'Telukjambe Timur', polygon: LAHAN_A_POLY },
  })
  assert.equal(gpsDenied.location_source, 'registered_lahan')
  assert.equal(gpsDenied.adm4, '32.15.03.2001')

  // 8. User without lahan & no GPS -> LOKASI_BELUM_DIVERIFIKASI (NEVER Karawang!)
  const noLahan = resolveLocationToAdm4({ deviceCoords: null, registeredLahan: null })
  assert.equal(noLahan.location_source, 'unverified')
  assert.equal(noLahan.adm4, null)

  // 9. GPS mismatch with registered lahan (e.g., user in Jakarta while lahan in Karawang) -> FAIL CLOSED
  const mismatch = resolveLocationToAdm4({
    deviceCoords: { lat: -6.1647, lon: 106.8454 },
    registeredLahan: { village: 'Desa Uji A', district: 'Telukjambe Timur', polygon: LAHAN_A_POLY },
  })
  assert.equal(mismatch.location_source, 'unverified')
  assert.equal(mismatch.adm4, null)

  // 10. Invalid explicit adm4 -> FAIL CLOSED
  const badAdm4 = resolveLocationToAdm4({ explicitAdm4: '32.15.BAD' })
  assert.equal(badAdm4.adm4, null)
})

test('TAHAP C BMKG forecast validation: valid window, expired window, adm4 mismatch, missing temp, WIB', () => {
  const now = Date.parse('2026-11-26T15:30:00Z')
  const parsed = parseBmkgForecastPayload(sampleBmkgPayload(), now, '32.15.03.2001')
  assert.ok(parsed)
  assert.equal(parsed.slot.temperature_c, 27)
  assert.equal(parsed.slot.humidity_pct, 88)
  assert.equal(parsed.slot.weather_desc, 'Berawan')
  assert.match(parsed.slot.period_wib, /22:00 WIB/)
  assert.match(parsed.slot.produced_wib, /19:00 WIB/)
  assert.equal(formatBmkgWib('2026-11-26 15:00:00'), '26 Nov 2026, 22:00 WIB')
  assert.equal('rain_3h_mm' in parsed.slot, false)

  // Expired forecast timeline (>3h after slot) -> rejected
  assert.equal(parseBmkgForecastPayload(sampleBmkgPayload(), Date.parse('2026-11-26T22:00:00Z'), '32.15.03.2001'), null)
  // Mismatched adm4 -> rejected
  assert.equal(parseBmkgForecastPayload(sampleBmkgPayload('31.71.03.1001'), now, '32.15.03.2001'), null)
  // Missing temperature -> rejected
  const noTemp = sampleBmkgPayload()
  delete (noTemp.data[0].cuaca[0][0] as any).t
  assert.equal(parseBmkgForecastPayload(noTemp, now, '32.15.03.2001'), null)
})

test('TAHAP D CAP XML security, expiry, and lat,lon point-in-polygon matching', () => {
  assert.equal(isAllowedBmkgUrl('https://www.bmkg.go.id/alerts/nowcast/id/CSL123_alert.xml'), true)
  assert.equal(isAllowedBmkgUrl('https://evil.example/alert.xml'), false)
  assert.equal(isAllowedBmkgUrl('http://www.bmkg.go.id/alerts/nowcast/id/a.xml'), false)

  // XXE / DTD rejected
  const xxeXml = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><alert><info><event>&xxe;</event></info></alert>`
  assert.equal(parseBmkgCapAlertXml(xxeXml, Date.parse('2026-11-26T16:00:00Z'), { provinsi: 'Jawa Barat', kotkab: 'Karawang' }), null)

  // CAP polygon in BMKG lat,lon order around Karawang (-6.33, 107.31)
  const capXml = `<alert><info>
    <event>Hujan Lebat dan Petir</event>
    <urgency>Immediate</urgency><severity>Moderate</severity><certainty>Observed</certainty>
    <effective>2026-11-26T22:00:00+07:00</effective>
    <expires>2026-11-27T01:00:00+07:00</expires>
    <headline>Hujan Lebat di Jawa Barat</headline>
    <description>Hujan lebat di Telukjambe Timur, Karawang</description>
    <area><areaDesc>Jawa Barat</areaDesc>
    <polygon>-6.30,107.28 -6.30,107.34 -6.36,107.34 -6.36,107.28 -6.30,107.28</polygon></area>
  </info></alert>`

  const ring = parseCapPolygon('-6.30,107.28 -6.30,107.34 -6.36,107.34 -6.36,107.28 -6.30,107.28')
  assert.ok(ring && ring[0][0] === 107.28 && ring[0][1] === -6.30)

  // Positive point inside CAP polygon during valid window
  const activeHit = parseBmkgCapAlertXml(capXml, Date.parse('2026-11-26T23:00:00+07:00'), {
    point: { lat: -6.3302, lon: 107.3102 }, provinsi: 'Jawa Barat', kotkab: 'Karawang', kecamatan: 'Telukjambe Timur',
  })
  assert.ok(activeHit)
  assert.equal(activeHit.match_basis, 'cap_polygon_pip')
  assert.match(activeHit.notice, /bukan kepastian banjir/i)

  // Negative point outside CAP polygon -> null!
  const outsideMiss = parseBmkgCapAlertXml(capXml, Date.parse('2026-11-26T23:00:00+07:00'), {
    point: { lat: -6.1647, lon: 106.8454 }, provinsi: 'Jawa Barat', kotkab: 'Karawang',
  })
  assert.equal(outsideMiss, null)

  // Expired CAP alert -> MUST NEVER show as active!
  const expired = parseBmkgCapAlertXml(capXml, Date.parse('2026-11-27T01:01:00+07:00'), {
    point: { lat: -6.3302, lon: 107.3102 }, provinsi: 'Jawa Barat', kotkab: 'Karawang',
  })
  assert.equal(expired, null)

  // RSS extraction rejects non-BMKG links
  const rss = `<rss><channel><item><title>Peringatan Jawa Barat</title><link>https://evil.example/x.xml</link></item></channel></rss>`
  assert.deepEqual(extractCapLinksFromRss(rss, 'Jawa Barat'), [])
})

test('createBmkgService handles 429, 500, timeout, stale cache, CAP unavailable vs no-alerts, and 60/min guard', async () => {
  let clock = Date.parse('2026-11-26T15:30:00Z')
  let mode: 'ok' | 'timeout' | '429' | '500' = 'ok'
  let capFail = false
  const service = createBmkgService({
    now: () => clock,
    fetcher: (async (url: string | URL) => {
      if (String(url).includes('alerts/nowcast')) {
        if (capFail) return new Response('err', { status: 503 })
        return new Response('<rss><channel></channel></rss>', { status: 200 })
      }
      if (mode === 'timeout') throw new Error('TimeoutError')
      if (mode === '429') return new Response('Too Many Requests', { status: 429 })
      if (mode === '500') return new Response('Server Error', { status: 500 })
      return new Response(JSON.stringify(sampleBmkgPayload()), { status: 200 })
    }) as typeof fetch,
  })

  const loc = resolveLocationToAdm4({ explicitAdm4: '32.15.03.2001' })
  const r1 = await service(loc)
  assert.equal(r1.status, 'OK')
  assert.equal(r1.cap_status, 'NO_ACTIVE_ALERTS')

  // Past cache TTL + timeout -> STALE + CAP UNAVAILABLE
  clock += BMKG_CACHE_TTL_MS + 60_000
  mode = 'timeout'
  const rStale = await service(loc)
  assert.equal(rStale.status, 'STALE')
  assert.equal(rStale.stale, true)
  assert.equal(rStale.cap_status, 'UNAVAILABLE')

  // Uncached adm4 on 429 & 500 -> DATA_TIDAK_TERSEDIA
  mode = '429'
  const r429 = await service(resolveLocationToAdm4({ explicitAdm4: '31.71.03.1001' }))
  assert.equal(r429.status, 'DATA_TIDAK_TERSEDIA')
  mode = '500'
  const r500 = await service(resolveLocationToAdm4({ explicitAdm4: '32.15.27.2001' }))
  assert.equal(r500.status, 'DATA_TIDAK_TERSEDIA')

  // CAP failure distinguished from NO_ACTIVE_ALERTS
  clock = Date.parse('2026-11-26T15:35:00Z')
  mode = 'ok'
  capFail = true
  const s2 = createBmkgService({
    now: () => clock,
    fetcher: (async (url: string | URL) => {
      if (String(url).includes('alerts/nowcast')) return new Response('err', { status: 503 })
      return new Response(JSON.stringify(sampleBmkgPayload()), { status: 200 })
    }) as typeof fetch,
  })
  const rCapFail = await s2(loc)
  assert.equal(rCapFail.status, 'OK')
  assert.equal(rCapFail.cap_status, 'UNAVAILABLE')

  // 60 req/min sliding window
  let calls = 0
  const burstClock = Date.parse('2026-11-26T16:00:00Z')
  const burst = createBmkgService({
    now: () => burstClock,
    fetcher: (async () => { calls++; return new Response('err', { status: 500 }) }) as typeof fetch,
  })
  for (let i = 0; i < BMKG_RATE_LIMIT_PER_MIN + 2; i++) {
    await burst(resolveLocationToAdm4({ explicitAdm4: `32.15.03.${String(2000 + i).padStart(4, '0')}` }))
  }
  assert.equal(calls, BMKG_RATE_LIMIT_PER_MIN)
})

test('TAHAP E & F: FloodStatusPanel hides unsupported hydrology, API enforces auth/RLS, UI separates timestamps & CAP states', () => {
  const now = Date.parse('2026-11-26T15:30:00Z')
  const policy = readEwsPolicy({})
  const weather = weatherResult(emptySource('FORECAST', weatherContext(), now, 'MISSING', 'Belum tersedia'), now)
  const water = emptySource('MANUAL_REPORT', { coordinates: null, location_source: 'district', district: null }, now, 'MISSING', 'Belum ada laporan tinggi air')
  const assessment = createFloodAssessment({ userId: 'u1', weather, water, policy, now, demoAvailable: false })
  const farmerHtml = renderToStaticMarkup(
    React.createElement(FloodStatusPanel, { data: assessment, loading: false, error: null, refresh: () => {}, hideUnsupportedHydrology: true })
  )
  assert.match(farmerHtml, /BELUM DIKETAHUI/)
  assert.doesNotMatch(farmerHtml, /Laporan tinggi air/)

  const routeSrc = readFileSync(resolve(process.cwd(), 'app/api/weather/bmkg/route.ts'), 'utf8')
  assert.match(routeSrc, /auth\.getUser\(\)/)
  assert.match(routeSrc, /status:\s*401/)
  assert.match(routeSrc, /status:\s*403/)
  assert.doesNotMatch(routeSrc, /createAdminClient|SERVICE_ROLE/)

  const cardSrc = readFileSync(resolve(process.cwd(), 'components/features/BmkgWeatherCard.tsx'), 'utf8')
  assert.match(cardSrc, /Waktu produksi BMKG/)
  assert.match(cardSrc, /Periode prakiraan/)
  assert.match(cardSrc, /Diterima server/)
  assert.match(cardSrc, /Tidak ada peringatan dini aktif yang terverifikasi untuk lokasi ini\./)
  assert.match(cardSrc, /Status peringatan dini belum tersedia\./)
  assert.doesNotMatch(cardSrc, /Lokasi Anda/)
})
