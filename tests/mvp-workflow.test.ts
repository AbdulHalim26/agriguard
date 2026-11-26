import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { NextRequest } from 'next/server.js'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { reportFixture, reportForm, farmerId, fieldId } from './report-fixtures'
import { requirePhoneOtpSession } from '../lib/auth/session'
import { createSynchronizer } from '../lib/offline/sync-core'
import type { OfflineReport } from '../lib/offline/db'
import AutpSupportingReport from '../components/features/AutpSupportingReport'
import AnalysisFailureActions from '../components/features/AnalysisFailureActions'
import { isSameOriginRequest } from '../lib/auth/origin'

// Real active route handlers/actions; ONLY Next cache + Supabase transport factories
// are replaced. This is NOT browser E2E, GoTrue/JWT-signature verification, Storage,
// an RLS emulator or a transactional PostgreSQL verification/audit test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'next/server' || specifier === 'next/cache' ? `${specifier}.js` : specifier, context)
  },
  load(url, context, nextLoad) {
    const source = url.endsWith('/lib/supabase/server.ts')
      ? 'export const createClient = async () => globalThis.__agriguardMvp.client()'
      : url.endsWith('/lib/supabase/admin.ts')
        ? 'export const createAdminClient = () => globalThis.__agriguardMvp.admin'
        : url.endsWith('/next/cache.js')
          ? 'export const revalidatePath = (path) => globalThis.__agriguardMvp.revalidated.push(path)' : null
    return source === null ? nextLoad(url, context) : { format: 'module', source, shortCircuit: true }
  },
})
const land = await import('../app/(app)/lahan/actions')
const landRoute = await import('../app/api/lahan/route')
const parcelRoute = await import('../app/api/lahan/[id]/route')
const reports = await import('../app/(app)/laporan/actions')
const verification = await import('../app/(app)/verifikasi/verification-actions')
const audit = await import('../app/(app)/audit/audit-actions')
const syncRoute = await import('../app/api/sync/route')
const analyzeRoute = await import('../app/api/ai/analyze/route')
const sessionRoute = await import('../app/api/auth/session/route')

const origin = 'http://localhost:3200'
const officerId = '10000000-0000-4000-8000-000000000002'
const ring = [[107.285, -6.312], [107.286, -6.312], [107.286, -6.313], [107.285, -6.313]]
const prediction = { status: 'rusak_ringan', confidence: .8, damage_pct: 54 }
function fixture() {
  const base = reportFixture()
  let current: string | null = farmerId, rpcError: string | null = null
  const rpcCalls: { name: string; args: any }[] = []
  Object.assign(base.tables.profiles[0], { phone: '6280000000001', full_name: 'Synthetic Farmer' })
  base.tables.profiles.push({ id: officerId, phone: '6280000000002', full_name: 'Synthetic Officer', role: 'ppl', poktan_id: 'group-a' })
  base.tables.poktan = [{ id: 'group-a', name: 'Synthetic Group', district: 'Synthetic District', village: 'Synthetic Village' }]
  Object.assign(base.tables.lahan[0], { polygon: structuredClone(ring), area_hectares: .75, name: 'Synthetic Parcel' })
  const from = (table: string) => {
    const query = base.client.from(table)
    let selection = '', membership: { column: string; values: unknown[] } | null = null
    const enrich = (row: any) => {
      if (table !== 'damage_reports' || !selection.includes('lahan(')) return row
      const parcel = base.tables.lahan.find((p) => p.id === row.lahan_id)
      return { ...row, lahan: parcel ? { ...parcel, poktan: base.tables.poktan.find((p) => p.id === parcel.poktan_id) } : null,
        owner: base.tables.profiles.find((p) => p.id === row.user_id), verifier: base.tables.profiles.find((p) => p.id === row.verified_by) }
    }
    const transform = (result: any) => ({ ...result, count: result.data?.length ?? 0,
      data: Array.isArray(result.data) ? result.data.filter((r: any) => !membership || membership.values.includes(r[membership.column])).map(enrich)
        : result.data ? enrich(result.data) : null })
    const then = query.then, single = query.single, maybeSingle = query.maybeSingle
    query.select = (columns = '*') => { selection = columns; return query }
    query.order = () => query // Ordering/pagination SQL behavior is not emulated.
    query.in = (column: string, values: unknown[]) => { membership = { column, values }; return query }
    query.then = (resolve: any, reject: any) => then((result: any) => resolve(transform(result)), reject)
    query.single = async () => transform(await single())
    query.maybeSingle = async () => transform(await maybeSingle())
    return query
  }
  const storage = { from: () => ({ createSignedUrl: async (path: string) => ({
    data: { signedUrl: `${origin}/synthetic-photo?token=synthetic-token` }, error: null,
  }) }) }
  const revalidated: string[] = []
  const client = () => {
    let token: string | null = null
    const auth = {
      getSession: async () => {
        const profile = base.tables.profiles.find((p) => p.id === current)
        token = profile ? `header.${Buffer.from(JSON.stringify({ sub: profile.id, phone: profile.phone, role: 'authenticated',
          exp: Date.now() / 1000 + 300, amr: [{ method: 'otp' }] })).toString('base64url')}.synthetic-signature` : null
        return { data: { session: token ? { access_token: token } : null }, error: null }
      },
      getUser: async (jwt: string) => {
        assert.equal(jwt, token) // Actual OTP helper must validate the SAME token.
        const profile = base.tables.profiles.find((p) => p.id === current)
        return { data: { user: profile ? { id: profile.id, phone: profile.phone, phone_confirmed_at: '2026-01-01T00:00:00Z' } : null }, error: null }
      },
    }
    return requirePhoneOtpSession({ from, storage, auth, rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args })
      // Canned provider reply ONLY. Do NOT implement pretend SQL locking/RLS/audit.
      return { single: async () => ({ data: rpcError ? null : { id: args.p_report_id, is_verified: args.p_is_verified },
        error: rpcError ? { message: rpcError } : null }) }
    } } as any)
  }
  ;(globalThis as any).__agriguardMvp = { client, admin: { ...base.admin, from }, revalidated }
  return { ...base, as: (id: string | null) => { current = id }, rpcCalls, revalidated,
    rpcFail: (message: string) => { rpcError = message } }
}
function form() {
  const value = reportForm()
  value.set('latitude', '-6.3125'); value.set('longitude', '107.2855')
  return value
}
function request(path: string, body: FormData | object, method = 'POST', fromOrigin = origin) {
  return new NextRequest(`${origin}${path}`, { method, headers: { origin: fromOrigin,
    ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body instanceof FormData ? body : JSON.stringify(body) })
}

test('MVP integration / fake transport: active session endpoint admits checked actor and denies logout', async () => {
  const f = fixture()
  assert.deepEqual(await (await sessionRoute.GET()).json(), { userId: farmerId })
  f.as(null)
  assert.equal((await sessionRoute.GET()).status, 401)
})
test('MVP integration / fake transport: active land create/read/PATCH preserve parcel identity and WGS84 assessment', async () => {
  const f = fixture()
  const added = await land.createLahan({ name: 'Second Synthetic Parcel', area_hectares: 1.2, polygon: ring as [number, number][] })
  assert.equal(added.error, null); assert.ok(added.data?.id)
  const listed = await (await landRoute.GET()).json()
  assert.ok(listed.data.some((p: any) => p.id === added.data!.id))
  const result = await parcelRoute.PATCH(request(`/api/lahan/${fieldId}`, { name: 'Corrected Synthetic Parcel', polygon: ring }, 'PATCH'), { params: Promise.resolve({ id: fieldId }) })
  const body = await result.json()
  assert.equal(result.status, 200); assert.equal(body.data.id, fieldId)
  assert.ok(body.geometry_assessment.computed_area_square_meters > 12000)
  assert.equal(f.tables.lahan[0].area_hectares, .75)
  assert.deepEqual(f.tables.lahan[0].polygon, ring)
})
test('MVP integration / fake transport: application routes reject another farmer parcel and invalid/forged updates', async () => {
  const f = fixture()
  f.tables.lahan[0].owner_id = officerId
  const before = structuredClone(f.tables.lahan)
  const args = { params: Promise.resolve({ id: fieldId }) }
  assert.equal((await parcelRoute.PATCH(request(`/api/lahan/${fieldId}`, { name: 'Forged' }, 'PATCH'), args)).status, 403)
  assert.equal((await parcelRoute.DELETE(request(`/api/lahan/${fieldId}`, {}, 'DELETE'), args)).status, 403)
  assert.deepEqual(f.tables.lahan, before)
  f.tables.lahan[0].owner_id = farmerId
  assert.equal((await parcelRoute.PATCH(request(`/api/lahan/${fieldId}`, { owner_id: officerId }, 'PATCH'), args)).status, 400)
  assert.equal((await parcelRoute.PATCH(request(`/api/lahan/${fieldId}`, { polygon: [ring[0], ring[2], ring[1], ring[3]] }, 'PATCH'), args)).status, 422)
})
test('MVP integration / fake transport: real analyze adapter → receipt → active submit → farmer/PPL views → internal AUTP', async (t) => {
  const f = fixture()
  process.env.AI_API_URL = 'http://127.0.0.1:1'
  t.mock.method(globalThis, 'fetch', async () => Response.json(prediction))
  const submitted = form(), photo = submitted.get('photos') as File, image = new FormData()
  image.set('image', photo)
  const preview = await analyzeRoute.POST(request('/api/ai/analyze', image))
  assert.equal(preview.status, 200)
  const analysis = await preview.json()
  submitted.set('evidence_source', 'ai'); submitted.set('analysis_id', analysis.analysis_id)
  const saved = await reports.submitReport(submitted)
  assert.equal(saved.error, null); assert.ok(saved.data?.id)
  const mine = await reports.listMyReports()
  assert.equal(mine.data?.[0].id, saved.data!.id)
  assert.equal(mine.data?.[0].ai_analysis_id, analysis.analysis_id)
  assert.equal(mine.data?.[0].ai_damage_pct, 54)
  assert.equal(mine.data?.[0].verified_at, null)
  assert.equal(f.objects.size, 1)
  f.as(officerId)
  const pending = await verification.listVerificationReports()
  assert.equal(pending.data?.[0].lahan_id, fieldId)
  assert.equal(pending.data?.[0].latitude, -6.3125)
  assert.ok(pending.data?.[0].photo_url)
  const decision = await verification.setVerification({ reportId: saved.data!.id, isVerified: true, note: '  Synthetic review  ' })
  assert.equal(decision.error, null)
  assert.deepEqual(f.rpcCalls, [{ name: 'verify_damage_report', args: { p_report_id: saved.data!.id, p_is_verified: true, p_note: 'Synthetic review' } }])
  // Inject returned provider state explicitly; this is NOT a verified SQL commit.
  Object.assign(f.tables.damage_reports[0], { is_verified: true, verified_by: officerId, verified_at: '2026-11-24T03:00:00Z', verification_note: 'Synthetic review' })
  const reviewed = await verification.listVerificationReports()
  const html = renderToStaticMarkup(React.createElement(AutpSupportingReport, { reports: reviewed.data!,
    scopeLabel: 'Synthetic integration fixtures ONLY', readScope: reviewed.scope!, generatedAt: '2026-11-24T04:00:00Z' }))
  assert.ok(html.includes(saved.data!.id)); assert.ok(html.includes(fieldId)); assert.ok(html.includes('Synthetic review'))
  assert.ok(html.includes('REVIEW_REQUIRED')); assert.ok(html.includes('bukan persetujuan klaim'))
  assert.ok(!html.includes('synthetic-token'))
  f.as(farmerId)
  const visible = (await reports.listMyReports()).data![0]
  assert.equal(visible.is_verified, true); assert.equal(visible.verification_note, 'Synthetic review')
})
test('MVP integration / fake transport: AI abort maps to manual response and manual submission bypasses failed AI', async (t) => {
  const f = fixture()
  process.env.AI_API_URL = 'http://127.0.0.1:1'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new DOMException('Synthetic abort', 'AbortError') })
  const image = new FormData(); image.set('image', form().get('photos')!)
  const failed = await analyzeRoute.POST(request('/api/ai/analyze', image))
  assert.equal(failed.status, 504); assert.equal((await failed.json()).manual, true)
  const manual = form(); manual.set('evidence_source', 'manual'); manual.set('manual_status', 'rusak_ringan')
  const saved = await reports.submitReport(manual)
  assert.equal(saved.error, null); assert.equal(calls, 1)
  assert.equal(f.tables.damage_reports[0].evidence_source, 'manual')
  assert.equal(f.tables.damage_reports[0].ai_confidence, null); assert.equal(f.tables.damage_reports[0].ai_damage_pct, null)
  assert.match(renderToStaticMarkup(React.createElement(AnalysisFailureActions, { retake: false, manualMode: false,
    onRetake() {}, onRetry() {}, onManual() {} })), /Manual/)
})
test('MVP integration / fake transport: active sync route and account-safe synchronizer preserve bytes/key through lost response', async () => {
  const f = fixture(), source = form(), key = source.get('idempotency_key') as string
  const queued: OfflineReport = { id: key, idempotencyKey: key, userId: farmerId, lahanId: fieldId,
    photoPaths: [], photoHash: '', aiStatus: 'rusak_ringan', aiConfidence: null, aiDamagePct: null,
    evidenceSource: 'manual', latitude: -6.3125, longitude: 107.2855, clientCreatedAt: '2026-11-24T00:00:00Z',
    photoBlobs: [source.get('photos') as File], synced: false, retryCount: 0 }
  let online = false, loseResponse = true, acknowledged = false, sent = 0
  const synchronizer = createSynchronizer({ isOnline: () => online, getUserId: async () => farmerId,
    readPending: async () => [queued], acknowledge: async (_row, serverId) => { assert.equal(serverId, f.tables.damage_reports[0].id); acknowledged = true },
    fail: async () => { queued.retryCount++ }, send: async (body) => {
      sent++; const response = await syncRoute.POST(request('/api/sync', body))
      if (loseResponse) { loseResponse = false; throw new Error('Synthetic response loss after durable reply') }
      return response
    } })
  assert.equal((await synchronizer.sync()).success, false); assert.equal(sent, 0)
  online = true
  assert.equal((await synchronizer.sync()).success, false); assert.equal(acknowledged, false)
  assert.equal((await synchronizer.sync()).syncedCount, 1); assert.equal(acknowledged, true)
  assert.equal(f.tables.damage_reports.length, 1); assert.equal(f.objects.size, 1)
  assert.equal(queued.idempotencyKey, key); assert.equal(queued.photoBlobs[0].size, (source.get('photos') as File).size)
})
test('MVP integration / fake transport: farmer/anonymous cannot call officer verification or audit actions', async () => {
  const f = fixture()
  for (const user of [farmerId, null]) {
    f.as(user)
    assert.ok((await verification.setVerification({ reportId: fieldId, isVerified: true, note: 'forged' })).error)
    assert.ok((await verification.listVerificationReports()).error)
    assert.ok((await audit.listAuditLogs()).error)
  }
  assert.equal(f.rpcCalls.length, 0)
})
test('MVP integration / fake transport: PPL/Dinas rejection notes reach narrow RPC; provider errors remain failures', async () => {
  const f = fixture(); f.as(officerId)
  for (const role of ['ppl', 'dinas']) {
    f.tables.profiles[1].role = role
    assert.equal((await verification.setVerification({ reportId: fieldId, isVerified: false, note: '  Need field inspection  ' })).error, null)
    assert.equal(f.rpcCalls.at(-1)?.args.p_note, 'Need field inspection')
    assert.equal(f.rpcCalls.at(-1)?.args.p_is_verified, false)
  }
  f.rpcFail('Synthetic denied or already finalized')
  assert.match((await verification.setVerification({ reportId: fieldId, isVerified: true })).error!, /Synthetic denied/)
  assert.ok((await verification.setVerification({ reportId: fieldId, isVerified: true, note: 'x'.repeat(501) })).error)
})
test('MVP P0 regression: unexpected verification transport failures return uncertain status without retry or evidence mutation', async () => {
  for (const stage of ['client', 'rpc']) {
    const f = fixture(); f.as(officerId)
    const before = structuredClone(f.tables), runtime = (globalThis as any).__agriguardMvp
    const create = runtime.client
    let rpcCalls = 0
    runtime.client = () => {
      if (stage === 'client') throw new Error('Synthetic connection failure')
      const client = create()
      client.rpc = () => {
        rpcCalls++
        return { single: async () => { throw new Error('Synthetic lost RPC response') } }
      }
      return client
    }
    const result = await verification.setVerification({ reportId: fieldId, isVerified: true, note: 'Keep original review note' })
    assert.equal(result.data, null)
    assert.match(result.error!, /belum dapat dipastikan.*Muat ulang/)
    assert.equal(rpcCalls, stage === 'client' ? 0 : 1)
    assert.deepEqual(f.tables, before)
    assert.deepEqual(f.revalidated, [])
  }
})
test('MVP integration / fake transport: submit audit is readable by officer and rejected status stays farmer-visible', async () => {
  const f = fixture(), manual = form()
  manual.set('evidence_source', 'manual'); manual.set('manual_status', 'rusak_ringan')
  const saved = await reports.submitReport(manual)
  f.as(officerId)
  const logs = await audit.listAuditLogs()
  assert.equal(logs.data?.[0].action, 'submit_report'); assert.equal(logs.data?.[0].entity_id, saved.data!.id)
  // Synthetic provider fixture: actual verification RPC/audit atomicity is external.
  Object.assign(f.tables.damage_reports[0], { verified_at: '2026-11-24T03:00:00Z', is_verified: false, verification_note: 'Synthetic rejection note' })
  f.as(farmerId)
  const row = (await reports.listMyReports()).data![0]
  assert.equal(row.is_verified, false); assert.ok(row.verified_at); assert.equal(row.verification_note, 'Synthetic rejection note')
})
test('MVP integration: active AI/sync handlers reject cross-origin requests before any transport factory', async () => {
  const f = fixture()
  for (const [handler, path] of [[syncRoute.POST, '/api/sync'], [analyzeRoute.POST, '/api/ai/analyze']] as const) {
    const response = await handler(request(path, form(), 'POST', 'http://unrelated.invalid'))
    assert.equal(response.status, 403)
  }
  assert.equal(f.tables.damage_reports.length, 0); assert.equal(f.objects.size, 0)
})
test('MVP regression: real NextRequest loopback normalization must not reject a same-origin report', async () => {
  const f = fixture(), manual = form()
  manual.set('evidence_source', 'manual'); manual.set('manual_status', 'rusak_ringan')
  const request = new NextRequest('http://127.0.0.1:3200/api/sync', { method: 'POST', body: manual,
    headers: { origin: 'http://127.0.0.1:3200', host: '127.0.0.1:3200' } })
  assert.equal(request.nextUrl.origin, 'http://localhost:3200')
  const response = await syncRoute.POST(request)
  assert.equal(response.status, 200)
  assert.equal(f.tables.damage_reports.length, 1)
})
test('MVP origin regression: exact scheme/host/port required; aliases and forwarded-host spoofing do not bypass CSRF', () => {
  for (const [url, host, from, allowed] of [
    ['http://127.0.0.1:3200/api/sync', '127.0.0.1:3200', 'http://127.0.0.1:3200', true],
    ['http://localhost:3200/api/sync', 'localhost:3200', 'http://localhost:3200', true],
    ['http://[::1]:3200/api/sync', '[::1]:3200', 'http://[::1]:3200', true],
    ['http://localhost:3200/api/sync', 'localhost:3200', 'http://127.0.0.1:3200', false],
    ['http://127.0.0.1:3200/api/sync', '127.0.0.1:3200', 'http://localhost:3200', false],
    ['http://127.0.0.1:3200/api/sync', '127.0.0.1:3200', 'http://127.0.0.1:3201', false],
    ['http://127.0.0.1:3200/api/sync', '127.0.0.1:3200', 'https://127.0.0.1:3200', false],
    ['http://127.0.0.1:3200/api/sync', 'unrelated.invalid', 'http://unrelated.invalid', false],
    ['https://isolated.example/api/sync', 'isolated.example', 'https://isolated.example', true],
    ['https://isolated.example/api/sync', 'unrelated.invalid', 'https://unrelated.invalid', false],
    ['https://isolated.example/api/sync', 'isolated.example', 'null', false],
    ['https://isolated.example/api/sync', 'isolated.example', '', false],
  ] as const) {
    const request = new NextRequest(url, { headers: { host, origin: from, 'x-forwarded-host': 'unrelated.invalid' } })
    assert.equal(isSameOriginRequest(request), allowed, `${url} ← ${from}`)
  }
})
