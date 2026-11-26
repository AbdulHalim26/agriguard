import { z } from 'zod'
import { classifyPointInPolygon } from '@/lib/land/geometry'

export const BMKG_FORECAST_ENDPOINT = 'https://api.bmkg.go.id/publik/prakiraan-cuaca'
export const BMKG_CAP_RSS_ENDPOINT = 'https://www.bmkg.go.id/alerts/nowcast/id'
export const BMKG_USER_AGENT = 'AgriGuard/2.0 (SEVENT-X-Weather-EWS)'
export const BMKG_RATE_LIMIT_PER_MIN = 60
export const BMKG_CACHE_TTL_MS = 30 * 60_000
export const BMKG_MAX_STALE_MS = 3 * 60 * 60_000
export const BMKG_MAX_XML_BYTES = 512 * 1024

export const ADM4_REGEX = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/

export type BmkgLocationSource = 'device' | 'registered_lahan' | 'unverified'
export type BmkgLocationMode = 'parcel_first' | 'device_only'
export type BmkgWeatherStatus = 'OK' | 'STALE' | 'DATA_TIDAK_TERSEDIA' | 'LOKASI_BELUM_DIVERIFIKASI'
export type BmkgCapStatus = 'ACTIVE_ALERTS' | 'NO_ACTIVE_ALERTS' | 'UNAVAILABLE'

export interface VerifiedAdm4Entry {
  adm4: string
  desa: string
  kecamatan: string
  kotkab: string
  provinsi: string
  provenance: string
  verified_at: string
}

// Explicitly verified Kemendagri/BMKG adm4 entries validated directly against api.bmkg.go.id.
// No nearest-neighbor or radius-based guessing is performed on these entries.
export const VERIFIED_ADM4_REGISTRY: readonly VerifiedAdm4Entry[] = [
  {
    adm4: '32.15.03.2001',
    desa: 'Telukjambe',
    kecamatan: 'Telukjambe Timur',
    kotkab: 'Karawang',
    provinsi: 'Jawa Barat',
    provenance: 'Verified against https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.15.03.2001',
    verified_at: '2026-11-26',
  },
  {
    adm4: '32.15.27.2001',
    desa: 'Margakaya',
    kecamatan: 'Telukjambe Barat',
    kotkab: 'Karawang',
    provinsi: 'Jawa Barat',
    provenance: 'Verified against https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.15.27.2001',
    verified_at: '2026-11-26',
  },
  {
    adm4: '32.15.01.1001',
    desa: 'Karawang Kulon',
    kecamatan: 'Karawang Barat',
    kotkab: 'Karawang',
    provinsi: 'Jawa Barat',
    provenance: 'Verified against https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.15.01.1001',
    verified_at: '2026-11-26',
  },
  {
    adm4: '31.71.03.1001',
    desa: 'Kemayoran',
    kecamatan: 'Kemayoran',
    kotkab: 'Kota Adm. Jakarta Pusat',
    provinsi: 'DKI Jakarta',
    provenance: 'Verified against https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001',
    verified_at: '2026-11-26',
  },
]

function normalizeAdminName(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\[staging synthetic\]/g, '')
    .replace(/\b(desa|kelurahan|kel\.?|kecamatan|kec\.?|kabupaten|kab\.?|kota)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isAllowedBmkgUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:') return false
    if (u.hostname === 'api.bmkg.go.id' && u.pathname.startsWith('/publik/')) return true
    if (u.hostname === 'www.bmkg.go.id' && u.pathname.startsWith('/alerts/nowcast/')) return true
    if (u.hostname === 'data.bmkg.go.id') return true
    return false
  } catch {
    return false
  }
}

export interface ResolvedAdm4 {
  adm4: string | null
  location_source: BmkgLocationSource
  location_label: string
  provinsi: string | null
  kotkab: string | null
  kecamatan: string | null
  desa: string | null
  verified_point: { lat: number; lon: number } | null
  device_outside_parcel?: boolean
  parcel_id?: string | null
  parcel_name?: string | null
  reason: string
}

export function resolveVerifiedAdm4ForAdmin(village?: string | null, district?: string | null): string | null {
  return findRegistryByAdmin(village, district)?.adm4 ?? null
}

function findRegistryByAdmin(village?: string | null, district?: string | null): VerifiedAdm4Entry | null {
  const normVillage = normalizeAdminName(village)
  const normDistrict = normalizeAdminName(district)
  if (!normVillage && !normDistrict) return null
  // Unambiguous match: require exact kecamatan match (and if village also matches another entry, prefer exact village+kecamatan).
  if (normVillage && normDistrict) {
    const exactBoth = VERIFIED_ADM4_REGISTRY.find(
      (e) => normalizeAdminName(e.desa) === normVillage && normalizeAdminName(e.kecamatan) === normDistrict
    )
    if (exactBoth) return exactBoth
  }
  if (normDistrict) {
    const matches = VERIFIED_ADM4_REGISTRY.filter((e) => normalizeAdminName(e.kecamatan) === normDistrict)
    if (matches.length === 1) return matches[0]
  }
  return null
}

function polygonCentroid(polygon: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(polygon) || polygon.length < 3) return null
  let sumLon = 0
  let sumLat = 0
  let count = 0
  for (const pt of polygon) {
    if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      sumLon += Number(pt[0])
      sumLat += Number(pt[1])
      count++
    }
  }
  return count >= 3 ? { lat: sumLat / count, lon: sumLon / count } : null
}

/**
 * Fail-closed location-to-adm4 resolver.
 * Never uses nearest-neighbor, radius-based guessing, or hardcoded Karawang fallback.
 */
export function resolveLocationToAdm4(params: {
  explicitAdm4?: string | null
  deviceCoords?: { lat: number; lon: number } | null
  locationPreference?: BmkgLocationMode
  registeredLahan?: {
    id?: string | null
    name?: string | null
    village?: string | null
    district?: string | null
    polygon?: unknown
  } | null
}): ResolvedAdm4 {
  const unverified = (reason: string): ResolvedAdm4 => ({
    adm4: null,
    location_source: 'unverified',
    location_label: 'Lokasi belum dapat dipastikan',
    provinsi: null,
    kotkab: null,
    kecamatan: null,
    desa: null,
    verified_point: null,
    device_outside_parcel: false,
    parcel_id: params.registeredLahan?.id ?? null,
    parcel_name: params.registeredLahan?.name ?? null,
    reason,
  })

  // 0. Explicit adm4 code (must strictly match Kemendagri format)
  if (params.explicitAdm4 !== undefined && params.explicitAdm4 !== null && params.explicitAdm4.trim() !== '') {
    const code = params.explicitAdm4.trim()
    if (!ADM4_REGEX.test(code)) {
      return unverified('Format kode wilayah tingkat IV (adm4) tidak valid.')
    }
    const match = VERIFIED_ADM4_REGISTRY.find((e) => e.adm4 === code)
    if (match) {
      return {
        adm4: match.adm4,
        location_source: 'registered_lahan',
        location_label: `${match.desa}, ${match.kecamatan}, ${match.kotkab}`,
        provinsi: match.provinsi,
        kotkab: match.kotkab,
        kecamatan: match.kecamatan,
        desa: match.desa,
        verified_point: params.registeredLahan?.polygon ? polygonCentroid(params.registeredLahan.polygon) : null,
        device_outside_parcel: false,
        parcel_id: params.registeredLahan?.id ?? null,
        parcel_name: params.registeredLahan?.name ?? null,
        reason: 'Kode wilayah tingkat IV (adm4) terverifikasi eksplisit.',
      }
    }
    return {
      adm4: code,
      location_source: 'registered_lahan',
      location_label: `Wilayah adm4 ${code}`,
      provinsi: null,
      kotkab: null,
      kecamatan: null,
      desa: null,
      verified_point: null,
      device_outside_parcel: false,
      parcel_id: params.registeredLahan?.id ?? null,
      parcel_name: params.registeredLahan?.name ?? null,
      reason: 'Kode wilayah tingkat IV (adm4) diberikan secara eksplisit.',
    }
  }

  const lahanEntry = params.registeredLahan
    ? findRegistryByAdmin(params.registeredLahan.village, params.registeredLahan.district)
    : null
  const preferParcelFallback = params.locationPreference === 'parcel_first'

  // 1. Device GPS provided: MUST validate coordinates and prove boundary containment (no radius guessing!)
  if (params.deviceCoords !== undefined && params.deviceCoords !== null) {
    const { lat, lon } = params.deviceCoords
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return unverified('Koordinat GPS perangkat tidak valid.')
    }
    if (params.registeredLahan?.polygon && lahanEntry) {
      const pos = classifyPointInPolygon([lon, lat], params.registeredLahan.polygon)
      if (pos === 'INSIDE' || pos === 'BOUNDARY') {
        return {
          adm4: lahanEntry.adm4,
          location_source: 'device',
          location_label: `${lahanEntry.desa}, ${lahanEntry.kecamatan}, ${lahanEntry.kotkab}`,
          provinsi: lahanEntry.provinsi,
          kotkab: lahanEntry.kotkab,
          kecamatan: lahanEntry.kecamatan,
          desa: lahanEntry.desa,
          verified_point: { lat, lon },
          device_outside_parcel: false,
          parcel_id: params.registeredLahan.id ?? null,
          parcel_name: params.registeredLahan.name ?? null,
          reason: 'GPS perangkat berada di dalam batas lahan terdaftar yang terpetakan ke adm4 terverifikasi.',
        }
      }
      if (preferParcelFallback) {
        return {
          adm4: lahanEntry.adm4,
          location_source: 'registered_lahan',
          location_label: `${lahanEntry.desa}, ${lahanEntry.kecamatan}, ${lahanEntry.kotkab}`,
          provinsi: lahanEntry.provinsi,
          kotkab: lahanEntry.kotkab,
          kecamatan: lahanEntry.kecamatan,
          desa: lahanEntry.desa,
          verified_point: polygonCentroid(params.registeredLahan.polygon),
          device_outside_parcel: true,
          parcel_id: params.registeredLahan.id ?? null,
          parcel_name: params.registeredLahan.name ?? null,
          reason: 'GPS perangkat berada di luar batas lahan terdaftar; menampilkan prakiraan untuk lahan terdaftar yang terverifikasi (bukan lokasi GPS perangkat).',
        }
      }
      return unverified(
        'Koordinat GPS perangkat berada di luar batas lahan terdaftar dan belum tersedia batas poligon administrasi resmi BIG/Kemendagri untuk pemetaan adm4 otomatis.'
      )
    }
    if (preferParcelFallback && lahanEntry) {
      return {
        adm4: lahanEntry.adm4,
        location_source: 'registered_lahan',
        location_label: `${lahanEntry.desa}, ${lahanEntry.kecamatan}, ${lahanEntry.kotkab}`,
        provinsi: lahanEntry.provinsi,
        kotkab: lahanEntry.kotkab,
        kecamatan: lahanEntry.kecamatan,
        desa: lahanEntry.desa,
        verified_point: params.registeredLahan?.polygon ? polygonCentroid(params.registeredLahan.polygon) : null,
        device_outside_parcel: true,
        parcel_id: params.registeredLahan?.id ?? null,
        parcel_name: params.registeredLahan?.name ?? null,
        reason: 'GPS perangkat tidak berada pada batas lahan; menampilkan prakiraan untuk lahan terdaftar yang terverifikasi (bukan lokasi GPS perangkat).',
      }
    }
    return unverified(
      'Koordinat GPS perangkat tidak dapat dipetakan ke adm4 tanpa poligon batas administrasi resmi BIG/Kemendagri.'
    )
  }

  // 2. GPS unavailable/denied -> use registered lahan/Poktan ONLY when unambiguously verified
  if (lahanEntry) {
    return {
      adm4: lahanEntry.adm4,
      location_source: 'registered_lahan',
      location_label: `${lahanEntry.desa}, ${lahanEntry.kecamatan}, ${lahanEntry.kotkab}`,
      provinsi: lahanEntry.provinsi,
      kotkab: lahanEntry.kotkab,
      kecamatan: lahanEntry.kecamatan,
      desa: lahanEntry.desa,
      verified_point: params.registeredLahan?.polygon ? polygonCentroid(params.registeredLahan.polygon) : null,
      device_outside_parcel: false,
      parcel_id: params.registeredLahan?.id ?? null,
      parcel_name: params.registeredLahan?.name ?? null,
      reason: 'Dipetakan dari wilayah administratif lahan/Poktan terdaftar (GPS perangkat tidak digunakan).',
    }
  }

  return unverified('Lokasi belum dapat dipastikan ke kode wilayah tingkat IV (adm4) BMKG yang terverifikasi.')
}

const bmkgSlotSchema = z.object({
  t: z.number().finite().min(-20).max(60),
  hu: z.number().finite().min(0).max(100),
  weather_desc: z.string().min(1).max(120),
  ws: z.number().finite().min(0).max(300),
  wd: z.string().max(24).optional(),
  utc_datetime: z.string().min(10).max(40),
  local_datetime: z.string().min(10).max(40),
  analysis_date: z.string().min(10).max(40),
})

const bmkgPayloadSchema = z.object({
  lokasi: z.object({
    adm4: z.string().regex(ADM4_REGEX),
    desa: z.string().optional(),
    kecamatan: z.string().optional(),
    kotkab: z.string().optional(),
    provinsi: z.string().optional(),
    timezone: z.string().optional(),
  }),
  data: z.array(
    z.object({
      cuaca: z.array(z.array(bmkgSlotSchema)).min(1),
    })
  ).min(1),
})

export interface BmkgForecastSlot {
  temperature_c: number
  humidity_pct: number
  weather_desc: string
  wind_speed_kmh: number
  wind_dir: string | null
  utc_datetime: string
  local_datetime: string
  analysis_date: string
  period_wib: string
  produced_wib: string
}

export interface BmkgCapAlert {
  event: string
  headline: string
  description: string
  area_desc: string
  effective: string
  expires: string
  effective_wib: string
  expires_wib: string
  severity: string
  urgency: string
  certainty: string
  match_basis: 'cap_polygon_pip' | 'verified_admin_area'
  source: 'BMKG'
  notice: string
}

export interface BmkgParcelOption {
  id: string
  name: string
  village: string | null
  district: string | null
  adm4: string | null
}

export interface BmkgWeatherResponse {
  status: BmkgWeatherStatus
  source: 'BMKG'
  location_source: BmkgLocationSource
  location_source_label: string
  location_label: string
  adm4: string | null
  location_mode?: BmkgLocationMode
  device_outside_parcel?: boolean
  selected_parcel?: BmkgParcelOption | null
  available_parcels?: BmkgParcelOption[]
  forecast: BmkgForecastSlot | null
  cap_status: BmkgCapStatus
  cap_alerts: BmkgCapAlert[]
  retrieved_at: string
  cached: boolean
  stale: boolean
  stale_reason: string | null
  flood_risk_note: string
  disclaimer: string
}

export function locationSourceDisplay(source: BmkgLocationSource): string {
  if (source === 'device') return 'Lokasi perangkat'
  if (source === 'registered_lahan') return 'Lokasi lahan terdaftar'
  return 'Lokasi belum dapat dipastikan'
}

function parseBmkgTimestampMs(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const hasOffset = /[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)
  const normalized = trimmed.includes('T')
    ? (hasOffset ? trimmed : `${trimmed}Z`)
    : `${trimmed.replace(' ', 'T')}Z`
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

export function formatBmkgWib(utcOrIso: string | null | undefined): string {
  if (!utcOrIso) return 'Waktu tidak tersedia'
  const ms = parseBmkgTimestampMs(utcOrIso)
  if (ms === null) return 'Waktu tidak tersedia'
  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms)
  return `${formatted.replace(/\./g, ':')} WIB`
}

export function parseBmkgForecastPayload(
  payload: unknown,
  nowMs: number,
  expectedAdm4?: string,
): {
  adm4: string
  locationLabel: string
  provinsi: string | null
  kotkab: string | null
  kecamatan: string | null
  slot: BmkgForecastSlot
} | null {
  const parsed = bmkgPayloadSchema.safeParse(payload)
  if (!parsed.success) return null
  const { lokasi, data } = parsed.data
  if (expectedAdm4 && lokasi.adm4 !== expectedAdm4) return null
  const flatSlots = data.flatMap((d) => d.cuaca.flat())
  if (flatSlots.length === 0) return null

  // Strictly select slot covering current 3-hour window OR immediate next 3-hour window.
  // Reject completely expired or disconnected future timelines.
  const THREE_HOURS = 3 * 60 * 60_000
  let chosen: (typeof flatSlots)[number] | null = null
  for (const s of flatSlots) {
    const slotMs = parseBmkgTimestampMs(s.utc_datetime)
    if (slotMs === null) continue
    if (slotMs <= nowMs && nowMs < slotMs + THREE_HOURS) {
      chosen = s
      break
    }
  }
  if (!chosen) {
    let bestUpcoming = Infinity
    for (const s of flatSlots) {
      const slotMs = parseBmkgTimestampMs(s.utc_datetime)
      if (slotMs === null) continue
      const delta = slotMs - nowMs
      if (delta >= 0 && delta <= THREE_HOURS && delta < bestUpcoming) {
        bestUpcoming = delta
        chosen = s
      }
    }
  }
  if (!chosen) return null

  const parts = [lokasi.desa, lokasi.kecamatan, lokasi.kotkab].filter(Boolean)
  const locationLabel = parts.length ? parts.join(', ') : `Wilayah ${lokasi.adm4}`
  return {
    adm4: lokasi.adm4,
    locationLabel,
    provinsi: lokasi.provinsi ?? null,
    kotkab: lokasi.kotkab ?? null,
    kecamatan: lokasi.kecamatan ?? null,
    slot: {
      temperature_c: chosen.t,
      humidity_pct: chosen.hu,
      weather_desc: chosen.weather_desc,
      wind_speed_kmh: chosen.ws,
      wind_dir: chosen.wd ?? null,
      utc_datetime: chosen.utc_datetime,
      local_datetime: chosen.local_datetime,
      analysis_date: chosen.analysis_date,
      period_wib: formatBmkgWib(chosen.utc_datetime),
      produced_wib: formatBmkgWib(chosen.analysis_date),
    },
  }
}

/**
 * Safely parse BMKG CAP polygon string ("lat,lon lat,lon ...") into [lon, lat][] ring
 * for classifyPointInPolygon. Rejects malformed coordinates.
 */
export function parseCapPolygon(polygonText: string): Array<[number, number]> | null {
  const tokens = polygonText.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 3) return null
  const ring: Array<[number, number]> = []
  for (const tok of tokens) {
    const parts = tok.split(',')
    if (parts.length !== 2) return null
    const lat = Number(parts[0])
    const lon = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null
    }
    ring.push([lon, lat])
  }
  return ring
}

function isSafeXml(xml: string): boolean {
  if (!xml || xml.length > BMKG_MAX_XML_BYTES) return false
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return false
  return true
}

function extractXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

export function extractCapLinksFromRss(rssXml: string, provinsi: string | null): string[] {
  if (!isSafeXml(rssXml) || !rssXml.includes('<item>')) return []
  const items = rssXml.match(/<item>[\s\S]*?<\/item>/g) || []
  const links: string[] = []
  const normProv = normalizeAdminName(provinsi)
  for (const item of items) {
    const title = extractXmlTag(item, 'title')
    const link = extractXmlTag(item, 'link')
    if (!link || !link.endsWith('.xml') || !isAllowedBmkgUrl(link)) continue
    if (normProv && !normalizeAdminName(title).includes(normProv)) continue
    links.push(link)
  }
  return links.slice(0, 3)
}

export function parseBmkgCapAlertXml(
  capXml: string,
  nowMs: number,
  target: {
    point?: { lat: number; lon: number } | null
    provinsi?: string | null
    kotkab?: string | null
    kecamatan?: string | null
  },
): BmkgCapAlert | null {
  if (!isSafeXml(capXml)) return null
  const event = extractXmlTag(capXml, 'event')
  const headline = extractXmlTag(capXml, 'headline')
  const description = extractXmlTag(capXml, 'description')
  const effective = extractXmlTag(capXml, 'effective')
  const expires = extractXmlTag(capXml, 'expires')
  const severity = extractXmlTag(capXml, 'severity') || 'Unknown'
  const urgency = extractXmlTag(capXml, 'urgency') || 'Unknown'
  const certainty = extractXmlTag(capXml, 'certainty') || 'Unknown'
  const areaDesc = extractXmlTag(capXml, 'areaDesc')

  if (!event || !effective || !expires) return null
  const effMs = parseBmkgTimestampMs(effective)
  const expMs = parseBmkgTimestampMs(expires)
  if (effMs === null || expMs === null || expMs <= effMs) return null
  // Strictly reject expired alerts or alerts not yet effective!
  if (nowMs < effMs || nowMs >= expMs) return null

  // Match area: prefer exact geometric point-in-polygon when CAP <polygon> exists
  const polyMatches = Array.from(capXml.matchAll(/<polygon>([\s\S]*?)<\/polygon>/gi)).map((m) => m[1])
  if (polyMatches.length > 0 && target.point) {
    let inside = false
    for (const polyText of polyMatches) {
      const ring = parseCapPolygon(polyText)
      if (!ring) continue
      const pos = classifyPointInPolygon([target.point.lon, target.point.lat], ring)
      if (pos === 'INSIDE' || pos === 'BOUNDARY') {
        inside = true
        break
      }
    }
    if (!inside) return null
    return {
      event,
      headline: headline || event,
      description: description.slice(0, 260),
      area_desc: areaDesc || target.provinsi || 'Wilayah terdampak BMKG',
      effective,
      expires,
      effective_wib: formatBmkgWib(effective),
      expires_wib: formatBmkgWib(expires),
      severity,
      urgency,
      certainty,
      match_basis: 'cap_polygon_pip',
      source: 'BMKG',
      notice: 'Peringatan dini cuaca ekstrem BMKG — bukan kepastian banjir di bidang sawah.',
    }
  }

  // Fallback when no CAP polygon is available: require BOTH province AND exact kotkab/kecamatan word match
  const normProv = normalizeAdminName(target.provinsi)
  const normKotkab = normalizeAdminName(target.kotkab)
  const normKec = normalizeAdminName(target.kecamatan)
  if (!normProv || (!normKotkab && !normKec)) return null
  const areaHay = normalizeAdminName(areaDesc)
  const fullHay = normalizeAdminName(`${areaDesc} ${headline} ${description}`)
  const provMatched = areaHay.includes(normProv) || fullHay.includes(normProv)
  const subRegionMatched =
    (normKec && new RegExp(`\\b${normKec}\\b`).test(fullHay)) ||
    (normKotkab && new RegExp(`\\b${normKotkab}\\b`).test(fullHay))
  if (!provMatched || !subRegionMatched) return null

  return {
    event,
    headline: headline || event,
    description: description.slice(0, 260),
    area_desc: areaDesc || target.provinsi || 'Wilayah terdampak BMKG',
    effective,
    expires,
    effective_wib: formatBmkgWib(effective),
    expires_wib: formatBmkgWib(expires),
    severity,
    urgency,
    certainty,
    match_basis: 'verified_admin_area',
    source: 'BMKG',
    notice: 'Peringatan dini cuaca ekstrem BMKG — bukan kepastian banjir di bidang sawah.',
  }
}

export const BMKG_DISCLAIMER =
  'Prakiraan cuaca 3-jaman dari BMKG (diperbarui berkala, bukan pengukuran real-time di bidang sawah). Prakiraan cuaca terpisah dari risiko banjir lahan.'

export function createBmkgService(deps: {
  now: () => number
  fetcher: typeof fetch
}) {
  const forecastCache = new Map<string, { payload: unknown; retrievedAt: number }>()
  const inFlight = new Map<string, Promise<unknown>>()
  const requestTimestamps: number[] = []
  let capRssCache: { xml: string; retrievedAt: number } | null = null
  const capDetailCache = new Map<string, { xml: string; retrievedAt: number }>()

  function allowOutboundRequest(now: number): boolean {
    const cutoff = now - 60_000
    while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
      requestTimestamps.shift()
    }
    if (requestTimestamps.length >= BMKG_RATE_LIMIT_PER_MIN) return false
    requestTimestamps.push(now)
    return true
  }

  async function fetchSafeXml(url: string, now: number): Promise<string | null> {
    if (!isAllowedBmkgUrl(url)) return null
    if (!allowOutboundRequest(now)) return null
    const res = await deps.fetcher(url, {
      cache: 'no-store',
      redirect: 'error',
      headers: { 'User-Agent': BMKG_USER_AGENT, Accept: 'application/xml, text/xml, application/rss+xml' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const txt = await res.text()
    return isSafeXml(txt) ? txt : null
  }

  async function fetchVerifiedCapAlerts(
    target: { point?: { lat: number; lon: number } | null; provinsi: string | null; kotkab: string | null; kecamatan: string | null },
    now: number,
  ): Promise<{ cap_status: BmkgCapStatus; cap_alerts: BmkgCapAlert[] }> {
    if (!target.provinsi && !target.point) {
      return { cap_status: 'NO_ACTIVE_ALERTS', cap_alerts: [] }
    }
    try {
      let rssXml: string | null = null
      if (capRssCache && now - capRssCache.retrievedAt < 10 * 60_000) {
        rssXml = capRssCache.xml
      } else {
        rssXml = await fetchSafeXml(BMKG_CAP_RSS_ENDPOINT, now)
        if (rssXml) capRssCache = { xml: rssXml, retrievedAt: deps.now() }
      }
      if (!rssXml) return { cap_status: 'UNAVAILABLE', cap_alerts: [] }

      const links = extractCapLinksFromRss(rssXml, target.provinsi)
      if (links.length === 0) return { cap_status: 'NO_ACTIVE_ALERTS', cap_alerts: [] }

      const alerts: BmkgCapAlert[] = []
      for (const link of links) {
        let capXml: string | null = null
        const cachedCap = capDetailCache.get(link)
        if (cachedCap && now - cachedCap.retrievedAt < 10 * 60_000) {
          capXml = cachedCap.xml
        } else {
          capXml = await fetchSafeXml(link, deps.now())
          if (capXml) {
            if (capDetailCache.size >= 64) capDetailCache.delete(capDetailCache.keys().next().value!)
            capDetailCache.set(link, { xml: capXml, retrievedAt: deps.now() })
          }
        }
        if (!capXml) continue
        const parsed = parseBmkgCapAlertXml(capXml, deps.now(), target)
        if (parsed) alerts.push(parsed)
      }
      return {
        cap_status: alerts.length > 0 ? 'ACTIVE_ALERTS' : 'NO_ACTIVE_ALERTS',
        cap_alerts: alerts,
      }
    } catch {
      return { cap_status: 'UNAVAILABLE', cap_alerts: [] }
    }
  }

  return async function getBmkgWeather(resolved: ResolvedAdm4): Promise<BmkgWeatherResponse> {
    const now = deps.now()
    const base = {
      source: 'BMKG' as const,
      location_source: resolved.location_source,
      location_source_label: locationSourceDisplay(resolved.location_source),
      location_label: resolved.location_label,
      adm4: resolved.adm4,
      device_outside_parcel: resolved.device_outside_parcel ?? false,
      retrieved_at: new Date(now).toISOString(),
      flood_risk_note: 'Risiko banjir sawah dinilai terpisah; jika data hidrologi terverifikasi belum tersedia, status risiko tetap BELUM DIKETAHUI.',
      disclaimer: BMKG_DISCLAIMER,
    }

    if (!resolved.adm4) {
      return {
        ...base,
        status: 'LOKASI_BELUM_DIVERIFIKASI',
        forecast: null,
        cap_status: 'UNAVAILABLE',
        cap_alerts: [],
        cached: false,
        stale: false,
        stale_reason: resolved.reason,
      }
    }

    const adm4 = resolved.adm4
    const saved = forecastCache.get(adm4)
    if (saved && now - saved.retrievedAt < BMKG_CACHE_TTL_MS) {
      const parsed = parseBmkgForecastPayload(saved.payload, now, adm4)
      if (parsed) {
        const cap = await fetchVerifiedCapAlerts(
          { point: resolved.verified_point, provinsi: parsed.provinsi, kotkab: parsed.kotkab, kecamatan: parsed.kecamatan },
          now,
        )
        return {
          ...base,
          status: 'OK',
          location_label: parsed.locationLabel,
          forecast: parsed.slot,
          ...cap,
          retrieved_at: new Date(saved.retrievedAt).toISOString(),
          cached: true,
          stale: false,
          stale_reason: null,
        }
      }
    }

    const returnStaleOrUnavailable = (reason: string): BmkgWeatherResponse => {
      if (saved && now - saved.retrievedAt <= BMKG_MAX_STALE_MS) {
        // For stale fallback, allow reading last cached slot at its retrieval time so farmer sees clear STALE history
        const parsed = parseBmkgForecastPayload(saved.payload, saved.retrievedAt, adm4)
        if (parsed) {
          return {
            ...base,
            status: 'STALE',
            location_label: parsed.locationLabel,
            forecast: parsed.slot,
            cap_status: 'UNAVAILABLE',
            cap_alerts: [],
            retrieved_at: new Date(saved.retrievedAt).toISOString(),
            cached: true,
            stale: true,
            stale_reason: reason,
          }
        }
      }
      return {
        ...base,
        status: 'DATA_TIDAK_TERSEDIA',
        forecast: null,
        cap_status: 'UNAVAILABLE',
        cap_alerts: [],
        cached: false,
        stale: false,
        stale_reason: reason,
      }
    }

    if (!allowOutboundRequest(now)) {
      return returnStaleOrUnavailable('Batas permintaan BMKG (60/menit/instance) tercapai. Menampilkan data terakhir jika masih dalam batas riwayat.')
    }

    try {
      let flight = inFlight.get(adm4)
      if (!flight) {
        flight = (async () => {
          const url = new URL(BMKG_FORECAST_ENDPOINT)
          url.searchParams.set('adm4', adm4)
          if (!isAllowedBmkgUrl(url.toString())) throw new Error('BMKG_URL_REJECTED')
          const res = await deps.fetcher(url.toString(), {
            cache: 'no-store',
            redirect: 'error',
            headers: { 'User-Agent': BMKG_USER_AGENT, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          })
          if (res.status === 429) throw new Error('BMKG_RATE_LIMITED')
          if (!res.ok) throw new Error(`BMKG_HTTP_${res.status}`)
          return await res.json()
        })()
        inFlight.set(adm4, flight)
      }
      let payload: unknown
      try {
        payload = await flight
      } finally {
        if (inFlight.get(adm4) === flight) inFlight.delete(adm4)
      }

      const fetchedAt = deps.now()
      const parsed = parseBmkgForecastPayload(payload, fetchedAt, adm4)
      if (!parsed) {
        return returnStaleOrUnavailable('Format prakiraan cuaca BMKG tidak valid, adm4 tidak cocok, atau periode prakiraan sudah kedaluwarsa.')
      }
      if (forecastCache.size >= 128 && !forecastCache.has(adm4)) {
        forecastCache.delete(forecastCache.keys().next().value!)
      }
      forecastCache.set(adm4, { payload, retrievedAt: fetchedAt })
      const cap = await fetchVerifiedCapAlerts(
        { point: resolved.verified_point, provinsi: parsed.provinsi, kotkab: parsed.kotkab, kecamatan: parsed.kecamatan },
        fetchedAt,
      )
      return {
        ...base,
        status: 'OK',
        location_label: parsed.locationLabel,
        forecast: parsed.slot,
        ...cap,
        retrieved_at: new Date(fetchedAt).toISOString(),
        cached: false,
        stale: false,
        stale_reason: null,
      }
    } catch (err) {
      const msg = err instanceof Error && err.message === 'BMKG_RATE_LIMITED'
        ? 'Layanan BMKG sedang membatasi permintaan (429). Coba beberapa saat lagi.'
        : 'Layanan prakiraan cuaca BMKG tidak dapat diakses atau melebihi batas waktu.'
      return returnStaleOrUnavailable(msg)
    }
  }
}
