import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createGeometryVersioningReference, type ModelFaultStage, type PocReport } from '../lib/land/versioning/reference-model'
import { loadVersioningActor } from '../lib/land/versioning/actor'
import { queuedGeometryRecovery, reportGeometryContext } from '../lib/land/versioning/contracts'
import { calculateGeodesicArea } from '../lib/land/geometry'
import { reportAdvisory } from '../lib/reports/advisory'

// ALL cases here are UNIT_TESTED reference transitions, NOT PostgreSQL/RLS proof.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actorA = { user_id: id(1), poktan_id: id(101) }
const actorB = { user_id: id(2), poktan_id: id(101) }
const actorC = { user_id: id(3), poktan_id: id(102) }
const parcelA = id(201), parcelB = id(202), photoA = id(301), analysisA = id(401)
const polygon = [[107.285,-6.312],[107.286,-6.312],[107.286,-6.313],[107.285,-6.313]]
const moved = (delta = .002) => polygon.map(([x,y]) => [x+delta,y])
const bytes = new TextEncoder().encode('synthetic local proof, not a real crop photograph')
const photoHash = createHash('sha256').update(bytes).digest('hex')
const initialTime = '2026-11-18T04:00:00.000Z'
function fixture(legacyReports: PocReport[] = []) {
  let active: typeof actorA | null = actorA, counter = 1000, now = initialTime
  let fault: ((stage: ModelFaultStage) => void | Promise<void>) | null = null
  const model = createGeometryVersioningReference({ fixture_only: true,
    parcels: [{ id: parcelA, owner_id: actorA.user_id, poktan_id: actorA.poktan_id, polygon, area_hectares: .75 },
      { id: parcelB, owner_id: actorB.user_id, poktan_id: actorB.poktan_id, polygon: moved(.01), area_hectares: 1.2 }],
    legacyReports, photos: [{ id: photoA, user_id: actorA.user_id, bytes, mime: 'image/jpeg' }],
    analyses: [{ id: analysisA, user_id: actorA.user_id, photo_hash: photoHash, status: 'rusak_berat', confidence: .82, damage_pct: 89 }],
    authenticate: async () => active, id: () => id(counter++), now: () => now, fault: async (stage) => { await fault?.(stage) } })
  return { model, as: (identity: typeof actorA | null) => { active = identity }, time: (value: string) => { now = value },
    fault: (fn: typeof fault) => { fault = fn } }
}
const baseline = (command = 501, parcel = parcelA) => ({ operation: 'BASELINE', command_id: id(command), parcel_id: parcel, expected_version_id: null, reason: 'Capture current fixture, not historical proof' })
const change = (head: string, command = 502, geometry = moved()) => ({ operation: 'CHANGE', command_id: id(command), parcel_id: parcelA,
  expected_version_id: head, polygon: geometry, reason: 'Explicit synthetic boundary correction' })
async function establish(f: ReturnType<typeof fixture>) {
  return (await f.model.advanceGeometry(await f.model.stageGeometry(baseline()))).version
}
const reportCommand = (version: string | null, command = 601, key = 701) => ({ command_id: id(command), parcel_id: parcelA,
  captured_geometry_version_id: version, idempotency_key: id(key), latitude: -6.3125, longitude: 107.2855,
  client_created_at: '2026-11-17T03:00:00Z', photo_refs: [photoA], evidence: { mode: 'manual', status: 'rusak_ringan' } })

test('versioning UNIT: baseline is observed now, immutable and not ownership/historical verification', async () => {
  const f = fixture(), before = structuredClone(polygon), v1 = await establish(f)
  assert.equal(v1.version_number, 1); assert.equal(v1.previous_version_id, null)
  assert.equal(v1.provenance, 'BASELINE_CAPTURED_NOT_HISTORICAL')
  assert.equal(v1.created_at, initialTime); assert.equal(v1.review_status, 'UNVERIFIED'); assert.equal(v1.ownership_verified, false)
  assert.deepEqual(v1.original_polygon, before)
  assert.equal(f.model.inspect().parcels[0].current_geometry_version_id, v1.id)
  assert.deepEqual(polygon, before)
})
test('versioning UNIT: authorized change advances one head and retains the previous snapshot/area/actor', async () => {
  const f = fixture(), v1 = await establish(f), original = structuredClone(v1)
  const v2 = (await f.model.advanceGeometry(await f.model.stageGeometry(change(v1.id)))).version
  assert.equal(v2.version_number, 2); assert.equal(v2.previous_version_id, v1.id)
  assert.equal(v2.provenance, 'EXPLICIT_BOUNDARY_CHANGE')
  assert.equal(f.model.inspect().parcels[0].current_geometry_version_id, v2.id)
  assert.deepEqual(f.model.version(v1.id), original)
  assert.equal(v2.actor_id, actorA.user_id)
})
test('versioning UNIT: readonly view copies cannot mutate committed history', async () => {
  const f = fixture(), v1 = await establish(f)
  const copy = f.model.version(v1.id)
  ;(copy.original_polygon as number[][])[0][0] = 1
  copy.reason = 'caller mutation'; copy.computed_area_m2 = 0
  assert.deepEqual(f.model.version(v1.id).original_polygon, polygon)
  assert.notEqual(f.model.version(v1.id).reason, copy.reason)
  assert.ok(f.model.version(v1.id).computed_area_m2 > 12000)
})
test('versioning UNIT: stale expected head is explicit VERSION_CONFLICT with no orphan version', async () => {
  const f = fixture(), v1 = await establish(f)
  await f.model.advanceGeometry(await f.model.stageGeometry(change(v1.id)))
  const stale = await f.model.stageGeometry(change(v1.id, 503, moved(.003)))
  const before = f.model.inspect()
  await assert.rejects(f.model.advanceGeometry(stale), { code: 'VERSION_CONFLICT' })
  assert.deepEqual(f.model.inspect(), before)
})
test('versioning UNIT: exact command/receipt replay is idempotent and never rewinds a later head', async () => {
  const f = fixture(), v1 = await establish(f)
  const command = change(v1.id), receipt = await f.model.stageGeometry(command)
  const v2 = (await f.model.advanceGeometry(receipt)).version
  const v3 = (await f.model.advanceGeometry(await f.model.stageGeometry(change(v2.id, 504, moved(.003))))).version
  assert.equal(await f.model.stageGeometry(command), receipt)
  const retry = await f.model.advanceGeometry(receipt)
  assert.equal(retry.replayed, true); assert.equal(retry.version.id, v2.id)
  assert.equal(f.model.inspect().parcels[0].current_geometry_version_id, v3.id)
})
test('versioning UNIT: same command identity with changed geometry/reason conflicts', async () => {
  const f = fixture(), v1 = await establish(f)
  await f.model.stageGeometry(change(v1.id))
  await assert.rejects(f.model.stageGeometry({ ...change(v1.id), reason: 'Changed proposal' }), { code: 'COMMAND_REPLAY_CONFLICT' })
})
test('versioning UNIT: a foreign parcel head cannot become the expected predecessor', async () => {
  const f = fixture()
  f.as(actorB)
  const other = (await f.model.advanceGeometry(await f.model.stageGeometry(baseline(531, parcelB)))).version
  f.as(actorA)
  await establish(f)
  const before = f.model.inspect()
  await assert.rejects(f.model.stageGeometry(change(other.id)), { code: 'VERSION_PARCEL_MISMATCH' })
  assert.deepEqual(f.model.inspect(), before)
})
test('versioning UNIT: overlapping Promise writers demonstrate reference FIFO only, NOT PostgreSQL concurrency', async () => {
  const f = fixture(), v1 = await establish(f)
  const a = await f.model.stageGeometry(change(v1.id, 510)), b = await f.model.stageGeometry(change(v1.id, 511, moved(.003)))
  const results = await Promise.allSettled([f.model.advanceGeometry(a), f.model.advanceGeometry(b)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code, 'VERSION_CONFLICT')
  assert.equal(f.model.inspect().versions.length, 2)
  assert.equal(f.model.purpose, 'UNIT_REFERENCE_NOT_DATABASE_PROOF')
})
for (const stage of ['after_version_insert','after_head_advance'] as const) test(`versioning UNIT: injected ${stage} rolls back reference version/head/audit`, async () => {
  const f = fixture(), v1 = await establish(f), receipt = await f.model.stageGeometry(change(v1.id))
  const before = f.model.inspect()
  f.fault((point) => { if (point === stage) throw new Error('unit fault') })
  await assert.rejects(f.model.advanceGeometry(receipt), /unit fault/)
  assert.deepEqual(f.model.inspect(), before)
  f.fault(null)
  assert.equal((await f.model.advanceGeometry(receipt)).version.version_number, 2)
})
test('versioning UNIT: failed baseline commit leaves no current head/version/audit', async () => {
  const f = fixture(), receipt = await f.model.stageGeometry(baseline()), before = f.model.inspect()
  f.fault((stage) => { if (stage === 'after_version_insert') throw new Error('baseline fault') })
  await assert.rejects(f.model.advanceGeometry(receipt), /baseline fault/)
  assert.deepEqual(f.model.inspect(), before)
  assert.equal(f.model.inspect().parcels[0].current_geometry_version_id, undefined)
})
test('versioning UNIT: native actor scope excludes anonymous, other owner and cross-Poktan changes', async () => {
  const f = fixture()
  for (const identity of [null, actorB, actorC, { ...actorA, poktan_id: actorC.poktan_id }]) {
    f.as(identity)
    await assert.rejects(f.model.stageGeometry(baseline()), { code: identity ? 'PARCEL_ACCESS_DENIED' : 'AUTH_REQUIRED' })
  }
  assert.equal(f.model.inspect().artifacts.length, 0)
})
test('versioning UNIT: forged actor/owner/role/timestamp/provenance fields are rejected', async () => {
  const f = fixture()
  for (const extra of [{ actor_id: actorB.user_id }, { owner_id: actorB.user_id }, { role: 'dinas' },
    { created_at: '2000-01-01T00:00:00Z' }, { provenance: 'VERIFIED_OWNERSHIP' }]) {
    await assert.rejects(f.model.stageGeometry({ ...baseline(), ...extra }), { code: 'INVALID_COMMAND' })
  }
  assert.equal(f.model.inspect().audit.length, 0)
})
test('versioning UNIT: invalid polygon cannot create even a server validation artifact', async () => {
  const f = fixture(), v1 = await establish(f), before = f.model.inspect()
  await assert.rejects(f.model.stageGeometry(change(v1.id, 520, [polygon[0],polygon[2],polygon[1],polygon[3]])), { code: 'SELF_INTERSECTION' })
  assert.deepEqual(f.model.inspect(), before)
})
test('versioning UNIT: area/method/declared snapshot come from actual D1 WGS84 validation', async () => {
  const f = fixture(), v1 = await establish(f)
  assert.equal(v1.computed_area_m2, calculateGeodesicArea(polygon).square_meters)
  assert.equal(v1.declared_area_hectares, .75)
  assert.equal(v1.validation_metadata.policy.version, 'land-geometry-v1')
  assert.match(v1.validation_metadata.method, /KARNEY_WGS84/)
  assert.equal(f.model.inspect().parcels[0].area_hectares, .75)
})
test('versioning UNIT: expired unconsumed validation artifacts cannot advance a head', async () => {
  const f = fixture(), receipt = await f.model.stageGeometry(baseline())
  f.time('2026-11-18T04:05:00Z')
  await assert.rejects(f.model.advanceGeometry(receipt), { code: 'VALIDATION_RECEIPT_EXPIRED' })
  assert.equal(f.model.inspect().versions.length, 0)
})
test('report binding UNIT: new report binds exactly to the locked current snapshot', async () => {
  const f = fixture(), v1 = await establish(f)
  const result = await f.model.commitReport(await f.model.stageReport(reportCommand(v1.id)))
  assert.equal(result.context.boundary_status, 'VERSION_BOUND')
  assert.equal(result.report.geometry_version_id, v1.id)
  assert.equal(result.report.lahan_id, parcelA); assert.equal(result.report.user_id, actorA.user_id)
  assert.equal(result.report.is_verified, false)
})
test('report binding UNIT: foreign parcel version is rejected without persisting report/audit', async () => {
  const f = fixture()
  f.as(actorB)
  const otherVersion = (await f.model.advanceGeometry(await f.model.stageGeometry(baseline(530, parcelB)))).version
  f.as(actorA)
  const before = f.model.inspect()
  await assert.rejects(f.model.stageReport(reportCommand(otherVersion.id)), { code: 'VERSION_PARCEL_MISMATCH' })
  assert.deepEqual(f.model.inspect(), before)
})
test('report binding UNIT: command replay compares capture time and evidence mode beyond the legacy submission hash', async () => {
  const f = fixture(), v1 = await establish(f)
  const command = { ...reportCommand(v1.id), evidence: { mode: 'pending' } }
  const intent = await f.model.stageReport(command), before = f.model.inspect()
  assert.equal(await f.model.stageReport(command), intent)
  await assert.rejects(f.model.stageReport({ ...command, client_created_at: '2026-11-17T03:01:00Z' }), { code: 'COMMAND_REPLAY_CONFLICT' })
  await assert.rejects(f.model.stageReport({ ...command, evidence: { mode: 'server_ai', analysis_id: analysisA } }), { code: 'COMMAND_REPLAY_CONFLICT' })
  assert.deepEqual(f.model.inspect(), before)
})
test('report binding UNIT: expired uncommitted intent fails, while an accepted durable retry still succeeds', async () => {
  const f = fixture(), v1 = await establish(f), accepted = await f.model.stageReport(reportCommand(v1.id))
  const saved = await f.model.commitReport(accepted)
  const uncommitted = await f.model.stageReport(reportCommand(v1.id, 605, 705))
  f.time('2026-11-18T04:05:00Z')
  await assert.rejects(f.model.commitReport(uncommitted), { code: 'REPORT_INTENT_EXPIRED' })
  const retry = await f.model.commitReport(accepted)
  assert.equal(retry.replayed, true); assert.equal(retry.report.id, saved.report.id)
  assert.equal(f.model.inspect().reports.length, 1)
})
test('report binding UNIT: geofence uses the bound version, not an unverified caller polygon', async () => {
  const f = fixture(), v1 = await establish(f)
  const intent = await f.model.stageReport({ ...reportCommand(v1.id), longitude: 107.9 })
  await assert.rejects(f.model.commitReport(intent), { code: 'REPORT_OUTSIDE_VERSION' })
  assert.equal(f.model.inspect().reports.length, 0)
  await assert.rejects(f.model.stageReport({ ...reportCommand(v1.id), polygon: moved() }), { code: 'INVALID_COMMAND' })
})
test('report binding UNIT: boundary change before commit yields explicit stale-reference recovery', async () => {
  const f = fixture(), v1 = await establish(f)
  const intent = await f.model.stageReport(reportCommand(v1.id))
  await f.model.advanceGeometry(await f.model.stageGeometry(change(v1.id)))
  const before = f.model.inspect()
  await assert.rejects(f.model.commitReport(intent), { code: 'GEOMETRY_VERSION_STALE' })
  assert.deepEqual(f.model.inspect(), before)
})
test('report binding UNIT: report-first reference ordering preserves old binding when a later boundary commits', async () => {
  const f = fixture(), v1 = await establish(f), intent = await f.model.stageReport(reportCommand(v1.id))
  const next = await f.model.stageGeometry(change(v1.id))
  let reached!: () => void, resume!: () => void
  const entered = new Promise<void>((resolve) => { reached = resolve }), release = new Promise<void>((resolve) => { resume = resolve })
  f.fault(async (stage) => { if (stage === 'after_report_insert') { reached(); await release } })
  const committing = f.model.commitReport(intent)
  await entered
  const advancing = f.model.advanceGeometry(next)
  resume(); await committing; const v2 = (await advancing).version
  assert.equal(f.model.inspect().reports[0].geometry_version_id, v1.id)
  assert.equal(f.model.inspect().parcels[0].current_geometry_version_id, v2.id)
})
test('report binding UNIT: missing offline version is retained for human review, never silently current-bound', async () => {
  const f = fixture(); await establish(f)
  const input = reportCommand(null), before = structuredClone(input)
  await assert.rejects(f.model.commitReport(await f.model.stageReport(input)), { code: 'GEOMETRY_REFERENCE_REQUIRED' })
  assert.deepEqual(input, before)
  assert.equal(f.model.inspect().reports.length, 0)
  const queue = { id: id(900), latitude: -6.3125, photoBlobs: ['original-local-evidence'] }
  const recovery = queuedGeometryRecovery(queue)
  assert.equal(recovery.action, 'HUMAN_REVIEW_REQUIRED'); assert.equal(recovery.automatically_rebind, false)
  assert.deepEqual(queue.photoBlobs, ['original-local-evidence'])
})
test('report binding UNIT: duplicate report retries return the same ID/version/hash after head changed', async () => {
  const f = fixture(), v1 = await establish(f), command = reportCommand(v1.id)
  const saved = await f.model.commitReport(await f.model.stageReport(command))
  await f.model.advanceGeometry(await f.model.stageGeometry(change(v1.id)))
  const retry = await f.model.commitReport(await f.model.stageReport({ ...command, command_id: id(602) }))
  assert.equal(retry.replayed, true); assert.equal(retry.report.id, saved.report.id)
  assert.equal(retry.report.submission_hash, saved.report.submission_hash)
  assert.equal(retry.context.geometry_version_id, v1.id)
  assert.equal(f.model.inspect().reports.length, 1)
})
test('report binding UNIT: reused accepted key cannot change evidence, coordinate or geometry association', async () => {
  const f = fixture(), v1 = await establish(f)
  await f.model.commitReport(await f.model.stageReport(reportCommand(v1.id)))
  const changed = await f.model.stageReport({ ...reportCommand(v1.id, 603), longitude: 107.2856 })
  await assert.rejects(f.model.commitReport(changed), { code: 'IDEMPOTENCY_CONFLICT' })
  const v2 = (await f.model.advanceGeometry(await f.model.stageGeometry(change(v1.id)))).version
  const rebind = await f.model.stageReport(reportCommand(v2.id, 604))
  await assert.rejects(f.model.commitReport(rebind), { code: 'IDEMPOTENCY_GEOMETRY_CONFLICT' })
})
test('report binding UNIT: staged report failure rolls back report and audit together in the reference model', async () => {
  const f = fixture(), v1 = await establish(f), intent = await f.model.stageReport(reportCommand(v1.id)), before = f.model.inspect()
  f.fault((stage) => { if (stage === 'after_report_insert') throw new Error('report fault') })
  await assert.rejects(f.model.commitReport(intent), /report fault/)
  assert.deepEqual(f.model.inspect(), before)
})
test('report binding UNIT: receipt identity/hash/raw AI values are preserved, never claim approval', async () => {
  const f = fixture(), v1 = await establish(f)
  const saved = await f.model.commitReport(await f.model.stageReport({ ...reportCommand(v1.id), evidence: { mode: 'server_ai', analysis_id: analysisA } }))
  assert.equal(saved.report.ai_analysis_id, analysisA); assert.equal(saved.report.photo_hash, photoHash)
  assert.equal(saved.report.ai_confidence, .82); assert.equal(saved.report.ai_damage_pct, 89)
  assert.equal(reportAdvisory(saved.report).review_status, 'REVIEW_REQUIRED')
  assert.equal(reportAdvisory(saved.report).insurer_decision, 'NOT_DETERMINED')
})
test('report binding UNIT: forged actor/verification/AI values or cross-user photos cannot enter trusted intent', async () => {
  const f = fixture(), v1 = await establish(f)
  for (const extra of [{ user_id: actorB.user_id }, { actor_id: actorB.user_id }, { is_verified: true }, { ai_damage_pct: 100 }]) {
    await assert.rejects(f.model.stageReport({ ...reportCommand(v1.id), ...extra }), { code: 'INVALID_COMMAND' })
  }
  f.as(actorB)
  await assert.rejects(f.model.stageReport(reportCommand(v1.id)), { code: 'PHOTO_EVIDENCE_MISMATCH' })
  f.as(actorC)
  await assert.rejects(f.model.stageReport(reportCommand(v1.id)), { code: 'PARCEL_ACCESS_DENIED' })
})
test('report binding UNIT: AI receipt must belong to actor and exact first photo', async () => {
  const f = fixture(), v1 = await establish(f)
  await assert.rejects(f.model.stageReport({ ...reportCommand(v1.id), evidence: { mode: 'server_ai', analysis_id: id(999) } }), { code: 'AI_RECEIPT_MISMATCH' })
})
test('legacy UNIT: baseline does not mutate or backfill old report coordinates/receipts/version', async () => {
  const legacy: PocReport = { id: id(800), user_id: actorA.user_id, lahan_id: parcelA, idempotency_key: id(701),
    submission_hash: null, latitude: -6.3125, longitude: 107.2855, client_created_at: '2020-01-01T00:00:00Z', server_created_at: '2020-01-02T00:00:00Z',
    photo_paths: ['original/private/photo.jpg'], photo_hash: photoHash, evidence_source: 'legacy_unverified', manual_status: null,
    ai_status: 'rusak_berat', ai_confidence: .7, ai_damage_pct: 84, ai_analysis_id: id(850), is_verified: true }
  const original = structuredClone(legacy), f = fixture([legacy])
  await establish(f)
  assert.deepEqual(f.model.inspect().reports[0], original)
  assert.equal(f.model.reportContext(legacy.id).boundary_status, 'LEGACY_BOUNDARY_UNKNOWN')
  assert.equal(f.model.reportContext(legacy.id).geometry_version_id, null)
  const ack = await f.model.commitReport(await f.model.stageReport(reportCommand(null)))
  assert.equal(ack.report.id, legacy.id); assert.equal(ack.context.boundary_status, 'LEGACY_BOUNDARY_UNKNOWN')
  assert.deepEqual(f.model.inspect().reports[0], original)
})
test('legacy UNIT: interpretation and stale queue guidance never infer historical boundary from current land', () => {
  assert.equal(reportGeometryContext({ id: id(800), lahan_id: parcelA }).boundary_status, 'LEGACY_BOUNDARY_UNKNOWN')
  const recovery = queuedGeometryRecovery({ id: id(900), geometryVersionId: id(901) }, 'GEOMETRY_VERSION_STALE')
  assert.equal(recovery.action, 'HUMAN_REVIEW_REQUIRED'); assert.equal(recovery.preserve_original_key, true)
})

function nativeClient(method = 'otp', pinned = true) {
  const user = { id: actorA.user_id, phone: '6280000000001', phone_confirmed_at: initialTime }
  const token = `header.${Buffer.from(JSON.stringify({ sub: user.id, phone: user.phone, role: 'authenticated',
    exp: Date.now()/1000+300, amr: [{ method }] })).toString('base64url')}.signature`
  let validated = 0
  const client: any = { auth: { getSession: async () => ({ data: { session: { access_token: token } }, error: null }),
    getUser: async (jwt: string) => { assert.equal(jwt,token); validated++; return { data: { user }, error: null } } },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { phone: pinned ? user.phone : 'other-phone', poktan_id: actorA.poktan_id }, error: null }) }) }) }) }
  return { client, validated: () => validated }
}
test('candidate actor adapter UNIT: actual existing OTP token validator and pinned profile are reused', async () => {
  const fixture = nativeClient()
  assert.deepEqual(await loadVersioningActor(fixture.client), actorA)
  assert.equal(fixture.validated(), 1)
})
test('candidate actor adapter UNIT: password sessions and pinned-phone mismatch fail closed', async () => {
  await assert.rejects(loadVersioningActor(nativeClient('password').client), { code: 'AUTH_REQUIRED' })
  await assert.rejects(loadVersioningActor(nativeClient('otp', false).client), { code: 'PINNED_PROFILE_REQUIRED' })
})
