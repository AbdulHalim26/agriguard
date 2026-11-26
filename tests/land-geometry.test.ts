import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { assessLandGeometry, calculateGeodesicArea, classifyPointInPolygon, GEOMETRY_POLICY, validatePolygon, type GeometryErrorCode } from '../lib/land/geometry'
import { inventoryParcels, parcelsFromRepositorySeed, polygonFormat } from '../lib/land/inventory'
import { writeLahan } from '../lib/land/server'
import { pointInPolygon, validateGeofence } from '../lib/geo'
import { submitEvidence } from '../lib/reports/submit'
import { reportFixture, reportForm } from './report-fixtures'
import LandGeometrySummary from '../components/features/LandGeometrySummary'

const ring = [[107.285, -6.312], [107.286, -6.312], [107.286, -6.313], [107.285, -6.313]]
const box: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]]
const bowTie = [[107.285, -6.312], [107.286, -6.313], [107.286, -6.312], [107.285, -6.313]]
function codes(value: unknown) { return validatePolygon(value).errors.map((error) => error.code) }
function hasCode(value: unknown, code: GeometryErrorCode) { assert.ok(codes(value).includes(code), `Expected ${code}, got ${codes(value).join(',')}`) }

test('geometry: valid simple Karawang polygon uses longitude/latitude and keeps original input', () => {
  const input = Object.freeze(ring.map((p) => Object.freeze([...p])))
  const before = JSON.stringify(input)
  const result = validatePolygon(input)
  assert.equal(result.valid, true)
  if (!result.valid) return
  assert.deepEqual(result.original_ring, ring)
  assert.equal(result.verification_status, 'UNVERIFIED')
  assert.equal(result.diagnostics.distinct_vertex_count, 4)
  assert.equal(JSON.stringify(input), before)
  assert.equal(validatePolygon(ring.slice(0, 3)).valid, true)
})
test('geometry: explicit closing coordinate counts once and is never duplicated', () => {
  const closed = [...ring, [...ring[0]]]
  const result = validatePolygon(closed)
  assert.equal(result.valid, true)
  if (!result.valid) return
  assert.equal(result.diagnostics.input_closed, true)
  assert.equal(result.diagnostics.input_vertex_count, 5)
  assert.equal(result.diagnostics.distinct_vertex_count, 4)
  assert.equal(result.normalization, 'NONE')
  assert.deepEqual(result.normalized_ring, closed)
})
test('geometry: open-ring compatibility appends closure only in derived copy, not original data', () => {
  const result = validatePolygon(ring)
  assert.equal(result.valid, true)
  if (!result.valid) return
  assert.equal(result.normalization, 'CLOSURE_IN_DERIVED_COPY_ONLY')
  assert.equal(result.original_ring.length, 4)
  assert.equal(result.normalized_ring.length, 5)
  result.normalized_ring[0][0] = 1
  assert.equal(result.original_ring[0][0], 107.285)
  assert.equal(ring[0][0], 107.285)
})
test('geometry: reversed winding preserves absolute area without reordering submitted vertices', () => {
  const reverse = [...ring].reverse()
  const result = validatePolygon(reverse)
  assert.equal(result.valid, true)
  if (result.valid) assert.deepEqual(result.original_ring, reverse)
  assert.ok(Math.abs(calculateGeodesicArea(reverse).square_meters - calculateGeodesicArea(ring).square_meters) < .000001)
})
test('geometry: missing, nested rings, GeoJSON, holes and strings are rejected rather than guessed', () => {
  hasCode(null, 'MISSING_GEOMETRY')
  hasCode(undefined, 'MISSING_GEOMETRY')
  hasCode({ type: 'Polygon', coordinates: [ring] }, 'UNSUPPORTED_FORMAT')
  hasCode([ring], 'UNSUPPORTED_FORMAT')
  hasCode(JSON.stringify(ring), 'UNSUPPORTED_FORMAT')
  hasCode([ring, ring], 'UNSUPPORTED_FORMAT')
})
test('geometry: positions require exactly two finite numeric coordinates', () => {
  for (const position of [[1], [1, 2, 3], null, '1,2']) hasCode([position, ...ring.slice(1)], 'INVALID_POSITION')
  for (const position of [[NaN, 0], [Infinity, 0], [0, -Infinity], ['107.285', -6.312], [null, 0]]) {
    hasCode([position, ...ring.slice(1)], 'NON_FINITE_COORDINATE')
  }
})
test('geometry: out-of-range or swapped coordinates are not clamped or auto-swapped', () => {
  for (const position of [[181, 0], [-181, 0], [0, 91], [0, -91], [-6.312, 107.285]]) {
    const input = [position, ...ring.slice(1)], before = JSON.stringify(input)
    hasCode(input, 'COORDINATE_OUT_OF_RANGE')
    assert.equal(JSON.stringify(input), before)
  }
})
test('geometry: insufficient distinct vertices and repeated closers cannot form a valid ring', () => {
  for (const input of [[], [[0, 0]], [[0, 0], [1, 1]], [[0, 0], [1, 1], [0, 0]]]) hasCode(input, 'INSUFFICIENT_DISTINCT_VERTICES')
  hasCode([...ring, ring[0], ring[0]], 'CONSECUTIVE_DUPLICATE')
})
test('geometry: consecutive and non-adjacent duplicate vertices fail without automatic deletion', () => {
  hasCode([ring[0], ring[0], ...ring.slice(1)], 'CONSECUTIVE_DUPLICATE')
  hasCode([ring[0], ring[1], ring[2], ring[0], ring[3]], 'DUPLICATE_VERTEX')
})
test('geometry: near-coincident closure is rejected, never snapped to the first point', () => {
  const close = [ring[0][0] + 5e-11, ring[0][1]]
  const input = [...ring, close]
  hasCode(input, 'CONSECUTIVE_DUPLICATE')
  assert.equal(input[input.length - 1][0], close[0])
})
test('geometry: bow-tie is self-intersection, not merely algebraic area cancellation', () => {
  hasCode(bowTie, 'SELF_INTERSECTION')
  assert.equal(validatePolygon(bowTie).diagnostics.self_intersection, true)
})
test('geometry: non-adjacent crossing, touching and overlapping edges are invalid', () => {
  hasCode([[0, 0], [3, 0], [1, 2], [1, -1], [0, 2]], 'SELF_INTERSECTION')
  hasCode([[0, 0], [2, 0], [2, 2], [1, 0], [0, 2]], 'SELF_TOUCH')
  hasCode([[0, 0], [2, 0], [2, 2], [0, 2], [0, 1], [1, 1], [1, 0], [.5, 0]], 'OVERLAPPING_EDGES')
  hasCode([[0, 0], [2, 0], [1, 0], [2, 2], [0, 2]], 'EDGE_BACKTRACK')
})
test('geometry: collinear, near-collinear and tiny-area rings are degenerate', () => {
  hasCode([[0, 0], [1, 0], [2, 0]], 'DEGENERATE_POLYGON')
  hasCode([[0, 0], [.001, 1e-11], [.002, 0]], 'DEGENERATE_POLYGON')
  hasCode([[0, 0], [.001, 0], [.0005, 1e-9]], 'DEGENERATE_POLYGON')
})
test('geometry: straight continuation/near-collinear intermediate points remain valid without snapping', () => {
  const input = [[0, 0], [.001, 1e-11], [.002, 0], [.002, .001], [0, .001]]
  const result = validatePolygon(input)
  assert.equal(result.valid, true)
  if (result.valid) assert.equal(result.original_ring[1][1], 1e-11)
})
test('geometry: non-self-intersecting concave L-shaped parcel is valid', () => {
  const input = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]
  assert.equal(validatePolygon(input).valid, true)
  assert.equal(validatePolygon([...input, [...input[0]]]).valid, true)
  assert.equal(classifyPointInPolygon([.5, 1.5], input), 'INSIDE')
  assert.equal(classifyPointInPolygon([1.5, 1.5], input), 'OUTSIDE')
})
test('geometry: antimeridian, polar and excessive extent are explicitly unsupported', () => {
  hasCode([[179, 0], [-179, 0], [-179, 1], [179, 1]], 'UNSUPPORTED_ANTIMERIDIAN')
  hasCode([[0, 85], [1, 85], [1, 86], [0, 86]], 'UNSUPPORTED_POLAR')
  hasCode([[0, 0], [6, 0], [6, 1], [0, 1]], 'UNSUPPORTED_EXTENT')
})
test('geometry: 500 vertices are bounded and accepted; excessive input is rejected early', () => {
  const input = Array.from({ length: 500 }, (_, i) => [107.285 + .001 * Math.cos(i * Math.PI / 250), -6.312 + .001 * Math.sin(i * Math.PI / 250)])
  assert.equal(validatePolygon(input).valid, true)
  assert.equal(validatePolygon([...input, [...input[0]]]).valid, true)
  hasCode([...input, [107.285, -6.312]], 'TOO_MANY_VERTICES')
})

const references = JSON.parse(readFileSync(new URL('./fixtures/land-area-reference.json', import.meta.url), 'utf8'))
for (const reference of references.cases) test(`area: independent analytic WGS84 reference ${reference.id}`, () => {
  const [west, south, east, north] = reference.bounds
  const result = calculateGeodesicArea([[west, south], [east, south], [east, north], [west, north]])
  assert.ok(Math.abs(result.square_meters - reference.area_m2) < reference.tolerance_m2)
  assert.ok(Math.abs(result.hectares - reference.area_m2 / 10_000) < reference.tolerance_m2 / 10_000)
  assert.equal(result.verification_status, 'UNVERIFIED')
})
test('area: published GeographicLib non-polar diamond reference checks geodesic edges and units', () => {
  const reference = references.published_geodesic_vector
  const result = calculateGeodesicArea(reference.polygon)
  assert.ok(Math.abs(result.square_meters - reference.area_m2) < reference.tolerance_m2)
  assert.ok(Math.abs(result.perimeter_meters - reference.perimeter_m) < reference.perimeter_tolerance_m)
})
test('area: invalid input cannot reach a successful area result', () => {
  for (const input of [null, bowTie, [[0, 0], [1, 0], [2, 0]], [[999, 0], [0, 0], [0, 1]]]) {
    assert.throws(() => calculateGeodesicArea(input))
    assert.equal(assessLandGeometry(input, 2).computed_area_hectares, null)
  }
})
test('area: computed and declared values are separate, signed difference is not a measurement approval', () => {
  const result = assessLandGeometry(ring, .75)
  assert.equal(result.declared_area_hectares, .75)
  assert.ok(result.computed_area_hectares! > 1.22)
  assert.ok(result.area_difference_hectares! > .47)
  assert.equal(result.ownership_verified, false)
  assert.equal(result.affected_area_measured, false)
  assert.equal(result.verification_status, 'UNVERIFIED')
})
test('geofence: inside/outside valid legacy behavior is retained with consistent boundary coverage', () => {
  assert.equal(validateGeofence(1, 1, box), true)
  assert.equal(validateGeofence(3, 1, box), false)
  for (const point of [[0, 0], [2, 0], [0, 2], [2, 2], [0, 1], [2, 1], [1, 0], [1, 2]]) {
    assert.equal(classifyPointInPolygon(point, box), 'BOUNDARY')
    assert.equal(pointInPolygon(point as [number, number], box as [number, number][]), true)
  }
})
test('geofence: tolerance is numerical only, not a GPS buffer or ownership evidence', () => {
  const eps = GEOMETRY_POLICY.coordinate_epsilon_degrees
  assert.equal(classifyPointInPolygon([2 + eps / 2, 1], box), 'BOUNDARY')
  assert.equal(classifyPointInPolygon([2 + eps * 20, 1], box), 'OUTSIDE')
  assert.equal(classifyPointInPolygon([NaN, 1], box), 'INVALID_POINT')
  assert.equal(classifyPointInPolygon([1, 1], bowTie), 'INVALID_GEOMETRY')
  assert.equal(validateGeofence(1, 1, null as any), false)
})

const ownerId = '10000000-0000-4000-8000-000000000001'
const parcelId = '20000000-0000-4000-8000-000000000001'
function landFixture() {
  const tables: Record<string, any[]> = {
    profiles: [{ id: ownerId, role: 'petani', poktan_id: 'group-a' }],
    lahan: [{ id: parcelId, owner_id: ownerId, poktan_id: 'group-a', name: 'Fixture', polygon: structuredClone(ring), area_hectares: .75, created_at: '2026-01-01T00:00:00Z' }],
    damage_reports: [{ id: 'original-report', lahan_id: parcelId, latitude: -6.3125, longitude: 107.2855, idempotency_key: 'original-key', photo_hash: 'original-photo', ai_damage_pct: 89 }],
  }
  let activeUser: any = { id: ownerId }, writes = 0, onUpdate = () => {}
  const client: any = { auth: { getUser: async () => ({ data: { user: activeUser }, error: null }) }, from: (table: string) => {
    let op = 'select', payload: any
    const filters: ((row: any) => boolean)[] = []
    const execute = () => {
      if (op === 'update') onUpdate()
      const rows = tables[table].filter((row) => filters.every((filter) => filter(row)))
      if (op === 'insert') { writes++; const row = { id: '30000000-0000-4000-8000-000000000001', ...payload }; tables[table].push(row); return { data: row, error: null } }
      if (op === 'update' && rows.length) { writes++; rows.forEach((row) => Object.assign(row, payload)) }
      return { data: rows[0] ?? null, error: null }
    }
    const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query },
      insert: (value: unknown) => { op = 'insert'; payload = value; return query }, update: (value: unknown) => { op = 'update'; payload = value; return query },
      single: async () => execute(), maybeSingle: async () => execute() }
    return query
  } }
  return { client, tables, writes: () => writes, user: (user: any) => { activeUser = user }, beforeUpdate: (fn: () => void) => { onUpdate = fn } }
}
const validInput = () => ({ name: 'Fixture baru', area_hectares: .75, polygon: structuredClone(ring) })
test('registration: anonymous requests cannot create or update land', async () => {
  const deps = landFixture(); deps.user(null)
  assert.equal((await writeLahan(validInput(), deps.client)).status, 401)
  assert.equal((await writeLahan(validInput(), deps.client, { id: parcelId })).status, 401)
  assert.equal(deps.writes(), 0)
})
test('registration: valid creation stores original open ring and declared area, not computed area/closure', async () => {
  const deps = landFixture(), input = validInput(), before = structuredClone(input)
  const result = await writeLahan(input, deps.client)
  assert.equal(result.error, null)
  assert.equal(result.data?.owner_id, ownerId)
  assert.equal(result.data?.poktan_id, 'group-a')
  assert.deepEqual(result.data?.polygon, input.polygon)
  assert.equal(result.data?.polygon.length, 4)
  assert.equal(result.data?.area_hectares, .75)
  assert.ok(result.geometry_assessment!.computed_area_hectares! > 1.22)
  assert.deepEqual(input, before)
})
test('registration: explicit closed input also remains byte-equivalent JSON after creation', async () => {
  const deps = landFixture(), input = validInput(); input.polygon.push([...input.polygon[0]])
  const result = await writeLahan(input, deps.client)
  assert.equal(JSON.stringify(result.data?.polygon), JSON.stringify(input.polygon))
})
test('registration: invalid geometry and other-field values cannot be partially persisted', async () => {
  for (const polygon of [bowTie, null, [[181, 0], [0, 0], [0, 1]], [ring]]) {
    const deps = landFixture(), before = structuredClone(deps.tables)
    const result = await writeLahan({ ...validInput(), polygon, name: 'Must not persist' }, deps.client)
    assert.ok(result.error); assert.equal(deps.writes(), 0)
    assert.deepEqual(deps.tables, before)
  }
})
test('registration: owner/Poktan/verification/computed-area payload tampering is rejected', async () => {
  for (const extra of [{ owner_id: 'other' }, { poktan_id: 'other' }, { verification_status: 'VERIFIED' }, { computed_area_hectares: 1 }]) {
    const deps = landFixture()
    assert.equal((await writeLahan({ ...validInput(), ...extra }, deps.client)).code, 'INVALID_LAND_INPUT')
    assert.equal(deps.writes(), 0)
  }
})
test('registration: missing polygon, invalid declared area or blank name is not persisted', async () => {
  const deps = landFixture()
  for (const input of [{ name: 'X', area_hectares: 1 }, { ...validInput(), area_hectares: Infinity },
    { ...validInput(), area_hectares: true }, { ...validInput(), name: '   ' }]) {
    assert.ok((await writeLahan(input, deps.client)).error)
  }
  assert.equal(deps.writes(), 0)
})
test('registration: same-Poktan reader or officer cannot modify another user parcel', async () => {
  for (const role of ['petani', 'ppl', 'dinas']) {
    const deps = landFixture(); deps.tables.profiles[0].role = role; deps.tables.lahan[0].owner_id = 'other-owner'
    assert.equal((await writeLahan(validInput(), deps.client, { id: parcelId })).status, 403)
    assert.equal(deps.writes(), 0)
  }
})
test('registration: Poktan mismatch/missing profile cannot move a parcel silently', async () => {
  const deps = landFixture(); deps.tables.profiles[0].poktan_id = 'different-group'
  assert.equal((await writeLahan({ name: 'No move' }, deps.client, { id: parcelId })).code, 'POKTAN_MISMATCH')
  deps.tables.profiles = []
  assert.equal((await writeLahan(validInput(), deps.client)).code, 'PROFILE_REQUIRED')
  assert.equal(deps.writes(), 0)
})
test('registration: invalid/missing update ID cannot accidentally become a create operation', async () => {
  const deps = landFixture()
  for (const id of [undefined, null, '', 'invalid']) assert.equal((await writeLahan(validInput(), deps.client, { id })).code, 'INVALID_LAND_ID')
  assert.equal(deps.writes(), 0)
})
test('registration: valid geometry update preserves report parcel FK, coordinates, receipts and history values', async () => {
  const deps = landFixture(), reports = structuredClone(deps.tables.damage_reports)
  const replacement = ring.map(([lon, lat]) => [lon + .0001, lat])
  const result = await writeLahan({ polygon: replacement }, deps.client, { id: parcelId })
  assert.equal(result.error, null)
  assert.equal(result.data?.id, parcelId)
  assert.equal(result.data?.area_hectares, .75)
  assert.deepEqual(result.data?.polygon, replacement)
  assert.deepEqual(deps.tables.damage_reports, reports)
})
test('registration: invalid update is atomic at application validation boundary', async () => {
  const deps = landFixture(), before = structuredClone(deps.tables)
  const result = await writeLahan({ name: 'Not saved', area_hectares: 2, polygon: bowTie }, deps.client, { id: parcelId })
  assert.equal(result.code, 'SELF_INTERSECTION')
  assert.equal(deps.writes(), 0); assert.deepEqual(deps.tables, before)
})
test('registration: metadata-only legacy correction does not repair or rewrite an invalid stored polygon', async () => {
  const deps = landFixture(); deps.tables.lahan[0].polygon = structuredClone(bowTie)
  const original = deps.tables.lahan[0].polygon
  const result = await writeLahan({ name: 'Corrected name' }, deps.client, { id: parcelId })
  assert.equal(result.error, null)
  assert.equal(result.geometry_assessment?.geometry.valid, false)
  assert.equal(deps.tables.lahan[0].polygon, original)
  assert.equal(deps.tables.lahan[0].area_hectares, .75)
})
test('registration: conditional owner filters stop an ownership race without modifying the new owner data', async () => {
  const deps = landFixture(), original = structuredClone(deps.tables.lahan[0].polygon)
  deps.beforeUpdate(() => { deps.tables.lahan[0].owner_id = 'changed-owner' })
  const result = await writeLahan({ polygon: ring.map(([x, y]) => [x + .0001, y]) }, deps.client, { id: parcelId })
  assert.equal(result.code, 'LAND_CHANGED')
  assert.equal(deps.writes(), 0)
  assert.deepEqual(deps.tables.lahan[0].polygon, original)
})
test('report compatibility: invalid stored geometry rejects new intake before uploads, without a false insurance verdict', async () => {
  const deps = reportFixture(); deps.tables.lahan[0].polygon = bowTie
  await assert.rejects(submitEvidence(reportForm(), deps), { code: 'INVALID_FIELD_GEOMETRY', status: 422 })
  assert.equal(deps.tables.damage_reports.length, 0); assert.equal(deps.objects.size, 0)
})
test('report compatibility: already durable reports keep references after a later invalid boundary, without rewriting coordinates', async () => {
  const deps = reportFixture(), form = reportForm()
  form.set('evidence_source', 'manual'); form.set('manual_status', 'rusak_ringan')
  const saved = await submitEvidence(form, deps)
  const before = structuredClone(deps.tables.damage_reports)
  deps.tables.lahan[0].polygon = bowTie
  const retry = await submitEvidence(form, deps)
  assert.equal(retry.id, saved.id)
  assert.deepEqual(deps.tables.damage_reports, before)
})

const parcel = (id: string, polygon: unknown, area: unknown = 1.2) => ({ id, owner_id: 'private-owner-ref', poktan_id: 'private-group-ref', polygon, area_hectares: area })
test('inventory: distinguishes valid, invalid, discrepancy-review and insufficient data', () => {
  const result = inventoryParcels([parcel('valid', ring), parcel('difference', ring, .5), parcel('crossing', bowTie), parcel('missing', null)])
  assert.deepEqual(result.summary.counts, { VALID_GEOMETRY: 1, INVALID_GEOMETRY: 1, AREA_DISCREPANCY_REVIEW: 1, INSUFFICIENT_DATA: 1 })
  assert.ok(result.parcels.every((r) => r.verification_status === 'UNVERIFIED' && !r.ownership_verified && !r.claim_authorized))
})
test('inventory: records stay unchanged and diagnoses do not manufacture a geometry repair', () => {
  const records = Object.freeze([Object.freeze(parcel('closed', Object.freeze([...ring, [...ring[0]]]))), Object.freeze(parcel('invalid', bowTie))])
  const before = structuredClone(records)
  inventoryParcels(records)
  assert.deepEqual(records, before)
})
test('inventory: unavailable declared area/reference is insufficient, not a fraud or zero-area verdict', () => {
  const result = inventoryParcels([{ ...parcel('no-area', ring), area_hectares: null }, { polygon: ring, area_hectares: 1.2 }])
  assert.ok(result.parcels.every((r) => r.inventory_status === 'INSUFFICIENT_DATA'))
  assert.equal(result.parcels[0].declared_area_hectares, null)
  assert.ok(result.parcels[0].computed_area_hectares! > 1.22)
})
test('inventory: relative-difference overflow cannot silently suppress a discrepancy or emit Infinity', () => {
  const result = inventoryParcels([parcel('tiny-declared', ring, 1e-310)]).parcels[0]
  assert.equal(result.inventory_status, 'AREA_DISCREPANCY_REVIEW')
  assert.equal(result.relative_difference, null)
  assert.equal(result.relative_difference_unavailable_reason, 'NUMERIC_RANGE')
  assert.ok(result.concerns.includes('RELATIVE_DIFFERENCE_NOT_REPRESENTABLE'))
})
test('inventory: format and diagnostics explicitly distinguish unsupported/missing and unchecked topology', () => {
  assert.equal(polygonFormat(null), 'MISSING')
  assert.equal(polygonFormat([]), 'LNG_LAT_RING')
  assert.match(polygonFormat({ type: 'Polygon', coordinates: [ring] }), /UNSUPPORTED/)
  const result = inventoryParcels([parcel('bad', [['bad', 0], [1, 0], [1, 1]])]).parcels[0]
  assert.equal(result.diagnostics.topology_checked, false)
  assert.equal(result.diagnostics.self_intersection, null)
})
test('inventory: actual repository demo seed yields five valid rings and review hints, without SQL execution', () => {
  const bytes = readFileSync(new URL('../supabase/migrations/0002_seed.sql', import.meta.url))
  const before = createHash('sha256').update(bytes).digest('hex')
  const rows = parcelsFromRepositorySeed(bytes.toString('utf8'))
  const result = inventoryParcels(rows)
  assert.equal(result.summary.total_parcels, 5)
  assert.equal(result.summary.counts.INVALID_GEOMETRY, 0)
  assert.equal(result.summary.counts.AREA_DISCREPANCY_REVIEW, 4)
  assert.equal(result.summary.counts.VALID_GEOMETRY, 1)
  assert.equal(createHash('sha256').update(readFileSync(new URL('../supabase/migrations/0002_seed.sql', import.meta.url))).digest('hex'), before)
})
test('inventory seed parser: unsupported lahan INSERT layouts fail rather than skipping records or evaluating SQL', () => {
  assert.throws(() => parcelsFromRepositorySeed('insert into lahan (polygon) values (evil_function());'), /SEED_FORMAT_UNSUPPORTED/)
})
test('geometry presentation: computed/declared/unknown values are separate and never ownership or loss approval', () => {
  const html = renderToStaticMarkup(createElement(LandGeometrySummary, { assessment: assessLandGeometry(ring, .75) }))
  assert.match(html, /Luas deklarasi/); assert.match(html, /Luas hitung geografis/)
  assert.match(html, /UNVERIFIED/); assert.match(html, /bukan hasil survei/)
  assert.doesNotMatch(html, /CLAIM_APPROVED|kepemilikan terverifikasi/)
  const small = assessLandGeometry([[0, 0], [.000001, 0], [.000001, .000001], [0, .000001]], .000001)
  assert.equal(small.geometry.valid, true)
  const smallHtml = renderToStaticMarkup(createElement(LandGeometrySummary, { assessment: small }))
  assert.doesNotMatch(smallHtml, /Luas hitung geografis: 0(?:[ <])|Luas hitung geografis: 0,0000 ha/)
})

test('inventory CLI: stdout is redacted, private exclusive output is read-only and cannot overwrite input/user work', () => {
  const temp = mkdtempSync(join(tmpdir(), 'agriguard-land-'))
  try {
    const input = join(temp, 'fixture.json'), output = join(temp, 'private.json')
    const records = [{ ...parcel('private-parcel-ref', ring), name: 'Sensitive canary name', phone: 'private-canary-phone' }]
    writeFileSync(input, JSON.stringify(records))
    const before = readFileSync(input)
    const args = ['--import', './tests/register.mjs', 'scripts/land-geometry-inventory.ts', '--input', input, '--output', output]
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.doesNotMatch(result.stdout, /private-parcel|private-owner|private-group|Sensitive canary|private-canary|107\.285/)
    assert.equal(JSON.parse(result.stdout).total_parcels, 1)
    const exported = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(exported.parcels[0].parcel_id, 'private-parcel-ref')
    if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600)
    assert.deepEqual(readFileSync(input), before)
    const oldOutput = readFileSync(output)
    assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 2)
    assert.deepEqual(readFileSync(output), oldOutput)
    const same = spawnSync(process.execPath, [...args.slice(0, -1), input], { encoding: 'utf8' })
    assert.equal(same.status, 2); assert.deepEqual(readFileSync(input), before)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
test('inventory CLI: malformed/private input and remote sources never leak contents into errors', () => {
  const temp = mkdtempSync(join(tmpdir(), 'agriguard-land-'))
  try {
    const input = join(temp, 'private.json'), output = join(temp, 'not-written.json')
    writeFileSync(input, '{"private-canary":"sensitive"')
    const result = spawnSync(process.execPath, ['--import', './tests/register.mjs', 'scripts/land-geometry-inventory.ts', '--input', input, '--output', output], { encoding: 'utf8' })
    assert.equal(result.status, 2); assert.equal(existsSync(output), false)
    assert.doesNotMatch(result.stderr, /private-canary|sensitive|SyntaxError|at runLand/)
    const remote = spawnSync(process.execPath, ['--import', './tests/register.mjs', 'scripts/land-geometry-inventory.ts', '--input', 'https://example.invalid/private'], { encoding: 'utf8' })
    assert.equal(remote.status, 2); assert.match(remote.stderr, /LOCAL_FILES_ONLY/)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
