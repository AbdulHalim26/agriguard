import GeographicLib from 'geographiclib-geodesic'

export type LngLat = [number, number]
export const GEOMETRY_POLICY = {
  version: 'land-geometry-v1', coordinate_order: 'longitude_latitude', crs: 'EPSG:4326',
  coordinate_epsilon_degrees: 1e-10, max_vertices: 500, max_span_degrees: 5,
  polar_limit_degrees: 85, min_area_m2: 0.01,
  topology_edges: 'LINEAR_LONGITUDE_LATITUDE', area_edges: 'SHORTEST_WGS84_GEODESIC',
} as const
export const AREA_METHOD = 'GEOGRAPHICLIB_2.2.0_KARNEY_WGS84_GEODESIC' as const
export type GeometryErrorCode = 'MISSING_GEOMETRY' | 'UNSUPPORTED_FORMAT' | 'TOO_MANY_VERTICES'
  | 'INVALID_POSITION' | 'NON_FINITE_COORDINATE' | 'COORDINATE_OUT_OF_RANGE'
  | 'INSUFFICIENT_DISTINCT_VERTICES' | 'CONSECUTIVE_DUPLICATE' | 'DUPLICATE_VERTEX'
  | 'UNSUPPORTED_ANTIMERIDIAN' | 'UNSUPPORTED_POLAR' | 'UNSUPPORTED_EXTENT'
  | 'SELF_INTERSECTION' | 'SELF_TOUCH' | 'OVERLAPPING_EDGES' | 'EDGE_BACKTRACK'
  | 'DEGENERATE_POLYGON' | 'AREA_CALCULATION_FAILED'
export interface GeometryIssue { code: GeometryErrorCode; message: string; vertices?: number[]; edges?: number[] }
export interface GeometryDiagnostics {
  input_vertex_count: number | null
  distinct_vertex_count: number | null
  input_closed: boolean | null
  structure_checked: boolean
  topology_checked: boolean
  duplicate_vertices: boolean | null
  self_intersection: boolean | null
  degenerate: boolean | null
}
export interface GeodesicArea {
  square_meters: number
  hectares: number
  perimeter_meters: number
  calculation_method: typeof AREA_METHOD
  verification_status: 'UNVERIFIED'
}
export type GeometryValidation = {
  valid: false; errors: GeometryIssue[]; diagnostics: GeometryDiagnostics
} | {
  valid: true; errors: []; diagnostics: GeometryDiagnostics
  // Copies only: retain vertex order/precision/winding, append closure only in
  // this derived view. Write paths persist original_ring, not normalized_ring.
  original_ring: LngLat[]; normalized_ring: LngLat[]
  normalization: 'NONE' | 'CLOSURE_IN_DERIVED_COPY_ONLY'
  area: GeodesicArea
  verification_status: 'UNVERIFIED'
}

const EPS = GEOMETRY_POLICY.coordinate_epsilon_degrees
const equal = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]
const near = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function orientation(a: LngLat, b: LngLat, c: LngLat): -1 | 0 | 1 {
  // Local differences avoid cancellation from longitudes near 107 degrees.
  const dx = b[0] - a[0], dy = b[1] - a[1], x = c[0] - a[0], y = c[1] - a[1]
  const cross = dx * y - dy * x
  const tolerance = EPS * Math.hypot(dx, dy) + 16 * Number.EPSILON * (Math.abs(dx * y) + Math.abs(dy * x))
  return Math.abs(cross) <= tolerance ? 0 : cross > 0 ? 1 : -1
}
function onSegment(p: LngLat, a: LngLat, b: LngLat): boolean {
  return orientation(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
}
function edgeIntersection(a: LngLat, b: LngLat, c: LngLat, d: LngLat): GeometryErrorCode | null {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b)
  if (o1 * o2 < 0 && o3 * o4 < 0) return 'SELF_INTERSECTION'
  if (!(onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d))) return null
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1
    const overlap = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
      Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    if (overlap > EPS) return 'OVERLAPPING_EDGES'
  }
  return 'SELF_TOUCH'
}
function geodesicArea(vertices: readonly LngLat[]): GeodesicArea {
  const polygon = GeographicLib.Geodesic.WGS84.Polygon(false)
  // GeographicLib takes latitude first; the application NEVER swaps stored axes.
  for (const [lon, lat] of vertices) polygon.AddPoint(lat, lon)
  const computed = polygon.Compute(false, true)
  const squareMeters = Math.abs(computed.area ?? NaN)
  if (!Number.isFinite(squareMeters) || !Number.isFinite(computed.perimeter)) throw new Error('Invalid geodesic result')
  return { square_meters: squareMeters, hectares: squareMeters / 10_000, perimeter_meters: computed.perimeter,
    calculation_method: AREA_METHOD, verification_status: 'UNVERIFIED' }
}

export function validatePolygon(input: unknown): GeometryValidation {
  const diagnostics: GeometryDiagnostics = { input_vertex_count: Array.isArray(input) ? input.length : null,
    distinct_vertex_count: null, input_closed: null, structure_checked: false,
    topology_checked: false, duplicate_vertices: null, self_intersection: null, degenerate: null }
  const errors: GeometryIssue[] = []
  const fail = (): GeometryValidation => ({ valid: false, errors, diagnostics })
  const issue = (code: GeometryErrorCode, message: string, extra: Partial<GeometryIssue> = {}) => {
    if (errors.length < 16) errors.push({ code, message, ...extra })
  }
  if (input === null || input === undefined) { issue('MISSING_GEOMETRY', 'Batas lahan belum tersedia.'); return fail() }
  if (!Array.isArray(input)) { issue('UNSUPPORTED_FORMAT', 'Gunakan satu ring [[bujur,lintang],…]; GeoJSON object, lubang, dan MultiPolygon belum didukung.'); return fail() }
  if (input.length > GEOMETRY_POLICY.max_vertices + 1) { issue('TOO_MANY_VERTICES', 'Batas lahan maksimal 500 vertex, di luar satu titik penutup.'); return fail() }
  for (let i = 0; i < input.length; i++) {
    const position = input[i]
    if (Array.isArray(position) && position.some((value) => Array.isArray(value))) {
      issue('UNSUPPORTED_FORMAT', 'Ring bertingkat, lubang, dan MultiPolygon tidak didukung.', { vertices: [i] }); continue
    }
    if (!Array.isArray(position) || position.length !== 2) {
      issue('INVALID_POSITION', 'Setiap titik harus tepat dua angka [bujur,lintang].', { vertices: [i] }); continue
    }
    if (!finite(position[0]) || !finite(position[1])) {
      issue('NON_FINITE_COORDINATE', 'Koordinat harus angka finite; teks, NaN, dan Infinity tidak didukung.', { vertices: [i] }); continue
    }
    if (position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) {
      issue('COORDINATE_OUT_OF_RANGE', 'Bujur harus −180…180 dan lintang −90…90. Urutan adalah [bujur,lintang]; titik tidak dipindahkan otomatis.', { vertices: [i] })
    }
  }
  if (errors.length) return fail()
  diagnostics.structure_checked = true
  const original = (input as number[][]).map(([lon, lat]) => [lon, lat] as LngLat)
  const closed = original.length > 1 && equal(original[0], original[original.length - 1])
  diagnostics.input_closed = closed
  const vertices = closed ? original.slice(0, -1) : original.slice()
  if (vertices.length > GEOMETRY_POLICY.max_vertices) { issue('TOO_MANY_VERTICES', 'Batas lahan maksimal 500 vertex unik.'); return fail() }
  const distinct: LngLat[] = []
  for (const vertex of vertices) if (!distinct.some((other) => near(vertex, other))) distinct.push(vertex)
  diagnostics.distinct_vertex_count = distinct.length
  diagnostics.duplicate_vertices = vertices.length !== distinct.length
  if (distinct.length < 3) { issue('INSUFFICIENT_DISTINCT_VERTICES', 'Minimal tiga titik batas yang berbeda; titik penutup tidak dihitung ulang.'); return fail() }
  for (let i = 0; i < vertices.length; i++) {
    if (near(vertices[i], vertices[(i + 1) % vertices.length])) {
      issue('CONSECUTIVE_DUPLICATE', 'Titik berurutan sama/terlalu dekat. Perbaiki sendiri titik tersebut; sistem tidak menghapus atau melakukan snap.', { vertices: [i, (i + 1) % vertices.length] })
    }
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue
      if (near(vertices[i], vertices[j])) issue('DUPLICATE_VERTEX', 'Vertex batas berulang di luar satu titik penutup yang sah.', { vertices: [i, j] })
    }
  }
  if (errors.length) return fail()
  const longitudes = vertices.map((v) => v[0]), latitudes = vertices.map((v) => v[1])
  const lonSpan = Math.max(...longitudes) - Math.min(...longitudes), latSpan = Math.max(...latitudes) - Math.min(...latitudes)
  if (lonSpan > 180) issue('UNSUPPORTED_ANTIMERIDIAN', 'Batas melintasi antimeridian belum didukung; jangan mengubah koordinat agar tampak lolos.')
  if (latitudes.some((lat) => Math.abs(lat) >= GEOMETRY_POLICY.polar_limit_degrees)) issue('UNSUPPORTED_POLAR', 'Geometri kutub (|lintang| ≥85°) belum didukung.')
  if (lonSpan > GEOMETRY_POLICY.max_span_degrees || latSpan > GEOMETRY_POLICY.max_span_degrees) issue('UNSUPPORTED_EXTENT', 'Rentang ring lokal maksimal 5°; geometri global/luas ekstrem perlu peninjauan terpisah.')
  if (errors.length) return fail()
  if (vertices.every((v) => orientation(vertices[0], vertices[1], v) === 0)) {
    diagnostics.degenerate = true
    issue('DEGENERATE_POLYGON', 'Titik segaris/hampir segaris tidak membentuk luas lahan yang andal.'); return fail()
  }
  diagnostics.topology_checked = true
  diagnostics.self_intersection = false
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], c = vertices[(i + 2) % vertices.length]
    if (orientation(a, b, c) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) {
      issue('EDGE_BACKTRACK', 'Sisi batas berbalik dan menumpuk sisi sebelumnya.', { edges: [i, (i + 1) % vertices.length] })
    }
    for (let j = i + 1; j < vertices.length; j++) {
      if (j === i + 1 || (i === 0 && j === vertices.length - 1)) continue
      const intersection = edgeIntersection(a, b, vertices[j], vertices[(j + 1) % vertices.length])
      if (intersection) {
        diagnostics.self_intersection = true
        issue(intersection, 'Sisi batas yang tidak bertetangga saling memotong, menyentuh, atau menumpuk. Perbaiki ring sebelum disimpan.', { edges: [i, j] })
      }
    }
  }
  if (errors.length) return fail()
  let area: GeodesicArea
  try { area = geodesicArea(vertices) }
  catch { issue('AREA_CALCULATION_FAILED', 'Luas geografis belum dapat dihitung.'); return fail() }
  diagnostics.degenerate = area.square_meters <= GEOMETRY_POLICY.min_area_m2
  if (diagnostics.degenerate) { issue('DEGENERATE_POLYGON', 'Luas ring nol atau terlalu kecil (≤0,01 m²) untuk validasi ini.'); return fail() }
  return { valid: true, errors: [], diagnostics, original_ring: original,
    normalized_ring: [...vertices.map((v) => [...v] as LngLat), [...vertices[0]] as LngLat],
    normalization: closed ? 'NONE' : 'CLOSURE_IN_DERIVED_COPY_ONLY', area, verification_status: 'UNVERIFIED' }
}

export function calculateGeodesicArea(input: unknown): GeodesicArea {
  const result = validatePolygon(input)
  if (!result.valid) throw new Error(`${result.errors[0].code}: ${result.errors[0].message}`)
  return result.area
}

export function declaredArea(value: unknown): number | null {
  const parsed = typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : value
  return finite(parsed) && parsed > 0 && parsed <= 1000 ? parsed : null
}
export function assessLandGeometry(input: unknown, declared: unknown) {
  const geometry = validatePolygon(input), declaredHa = declaredArea(declared)
  const computedHa = geometry.valid ? geometry.area.hectares : null
  const difference = declaredHa !== null && computedHa !== null ? computedHa - declaredHa : null
  const ratio = difference !== null ? Math.abs(difference) / declaredHa! : null
  return { geometry, declared_area_hectares: declaredHa,
    computed_area_square_meters: geometry.valid ? geometry.area.square_meters : null,
    computed_area_hectares: computedHa, area_difference_hectares: difference,
    relative_difference: ratio !== null && Number.isFinite(ratio) ? ratio : null,
    relative_difference_unavailable_reason: ratio === null ? 'MISSING_DECLARED_OR_COMPUTED' : !Number.isFinite(ratio) ? 'NUMERIC_RANGE' : null,
    calculation_method: AREA_METHOD, verification_status: 'UNVERIFIED' as const,
    ownership_verified: false, affected_area_measured: false }
}

export function classifyPointInPolygon(point: unknown, input: unknown): 'INSIDE' | 'BOUNDARY' | 'OUTSIDE' | 'INVALID_POINT' | 'INVALID_GEOMETRY' {
  if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1]) ||
      point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) return 'INVALID_POINT'
  const result = validatePolygon(input)
  if (!result.valid) return 'INVALID_GEOMETRY'
  const p = point as LngLat, vertices = result.normalized_ring
  let inside = false
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i + 1]
    if (onSegment(p, a, b)) return 'BOUNDARY'
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? 'INSIDE' : 'OUTSIDE'
}
