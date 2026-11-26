import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { submitEvidence } from '../lib/reports/submit'
import { parseReportInput, aiResultSchema } from '../lib/reports/evidence'
import { calculateSha256 } from '../lib/geo'
import { requireOfficer } from '../lib/auth/authorization'
import { AiRejectedError } from '../lib/ai'
import { reportFixture, reportForm, farmerId } from './report-fixtures'

test('report authorization rejects anonymous, cross-account, unrelated field, and out-of-field reports', async () => {
  const deps = reportFixture()
  deps.setUser(null)
  await assert.rejects(submitEvidence(reportForm(), deps), { status: 401 })
  deps.setUser({ id: 'another-user' })
  await assert.rejects(submitEvidence(reportForm(), deps), { status: 403 })
  deps.setUser({ id: farmerId })
  deps.tables.lahan[0].owner_id = 'other'
  deps.tables.lahan[0].poktan_id = 'other'
  await assert.rejects(submitEvidence(reportForm(), deps), { status: 403 })
  deps.tables.lahan[0].owner_id = farmerId
  const outside = reportForm(); outside.set('latitude', '3')
  await assert.rejects(submitEvidence(outside, deps), /luar batas/)
  assert.equal(deps.tables.damage_reports.length, 0)
  assert.equal(deps.objects.size, 0)
})

test('client AI and verification metadata are ignored; only server inference is trusted', async () => {
  const deps = reportFixture()
  const form = reportForm()
  form.set('ai_status', 'rusak_berat'); form.set('ai_confidence', '1'); form.set('ai_damage_pct', '100')
  form.set('is_verified', 'true'); form.set('verified_by', farmerId); form.set('verified_at', '2026-01-01')
  const result = await submitEvidence(form, deps)
  assert.equal(result.evidence_source, 'server_ai')
  assert.equal(result.ai_damage_pct, 54)
  assert.equal(deps.aiCalls(), 1)
  assert.equal(deps.tables.damage_reports[0].is_verified, false)
  assert.equal(deps.tables.damage_reports[0].verified_by, null)
  assert.equal(deps.tables.damage_reports[0].verified_at, null)
})

test('a manual report remains distinct from AI and never imports client confidence', async () => {
  const deps = reportFixture()
  const form = reportForm()
  form.set('evidence_source', 'manual'); form.set('manual_status', 'rusak_berat')
  form.set('ai_confidence', '1'); form.set('ai_damage_pct', '100')
  const result = await submitEvidence(form, deps)
  assert.equal(result.evidence_source, 'manual')
  assert.equal(result.ai_confidence, null)
  assert.equal(result.ai_damage_pct, null)
  assert.equal(deps.aiCalls(), 0)
})

test('AI receipts must belong to the same user AND photo', async () => {
  const deps = reportFixture()
  const form = reportForm()
  const receiptId = randomUUID()
  form.set('evidence_source', 'ai'); form.set('analysis_id', receiptId)
  deps.tables.ai_analyses.push({ id: receiptId, user_id: 'other', photo_hash: 'wrong', status: 'aman', confidence: 1, damage_pct: 0 })
  await assert.rejects(submitEvidence(form, deps), { status: 403 })
  deps.tables.ai_analyses[0].user_id = farmerId
  await assert.rejects(submitEvidence(form, deps), { status: 403 })
  deps.tables.ai_analyses[0].photo_hash = await calculateSha256(form.get('photos') as File)
  const result = await submitEvidence(form, deps)
  assert.equal(result.ai_status, 'aman')
  assert.equal(result.evidence_source, 'server_ai')
  assert.equal(deps.aiCalls(), 0)
})

test('sequential and concurrent retries keep one report and immutable photos', async () => {
  const deps = reportFixture()
  const form = reportForm()
  form.set('evidence_source', 'manual'); form.set('manual_status', 'aman')
  const results = await Promise.all([submitEvidence(form, deps), submitEvidence(form, deps)])
  const retry = await submitEvidence(form, deps)
  assert.equal(results[0].id, results[1].id)
  assert.equal(retry.id, results[0].id)
  assert.equal(deps.tables.damage_reports.length, 1)
  assert.equal(deps.objects.size, 1)
  form.set('longitude', '1.5')
  await assert.rejects(submitEvidence(form, deps), { status: 409 })
  assert.equal(deps.tables.damage_reports[0].longitude, 1)
})

test('failed deferred AI preserves the durable report; retry fills it without duplication', async () => {
  const deps = reportFixture()
  const form = reportForm()
  deps.setAiUnavailable(true)
  await assert.rejects(submitEvidence(form, deps), { code: 'AI_PENDING', status: 503 })
  assert.equal(deps.tables.damage_reports.length, 1)
  assert.equal(deps.tables.damage_reports[0].evidence_source, 'pending')
  deps.setAiUnavailable(false)
  assert.equal((await submitEvidence(form, deps)).evidence_source, 'server_ai')
  assert.equal(deps.tables.damage_reports.length, 1)
  assert.equal(deps.objects.size, 1)
})

test('a finalized report is never changed by a late AI retry', async () => {
  const deps = reportFixture()
  const form = reportForm()
  deps.setAiUnavailable(true)
  await assert.rejects(submitEvidence(form, deps))
  deps.tables.damage_reports[0].is_verified = true
  deps.tables.damage_reports[0].verified_at = '2026-01-02'
  const calls = deps.aiCalls()
  await submitEvidence(form, deps)
  assert.equal(deps.aiCalls(), calls)
  assert.equal(deps.tables.damage_reports[0].ai_status, null)
})

test('quality rejection is non-retryable without losing the submitted evidence', async () => {
  const deps = reportFixture()
  await assert.rejects(submitEvidence(reportForm(), { ...deps, analyze: async () => { throw new AiRejectedError('quality gate') } }), { code: 'AI_REJECTED', status: 422 })
  assert.equal(deps.tables.damage_reports.length, 1)
  assert.equal(deps.objects.size, 1)
})

test('verification winning an inference race prevents evidence updates', async () => {
  const deps = reportFixture()
  const result = await submitEvidence(reportForm(), { ...deps, analyze: async () => {
    deps.tables.damage_reports[0].is_verified = true
    deps.tables.damage_reports[0].verified_at = '2026-01-02'
    return { status: 'rusak_berat', confidence: 1, damage_pct: 95 }
  } })
  assert.equal(result.ai_status, null)
  assert.equal(deps.tables.damage_reports[0].is_verified, true)
})

test('an already uploaded object must match its content hash; retries never overwrite it', async () => {
  const deps = reportFixture()
  const form = reportForm()
  form.set('evidence_source', 'manual'); form.set('manual_status', 'aman')
  const hash = await calculateSha256(form.get('photos') as File)
  const path = `${farmerId}/reports/${form.get('idempotency_key')}/0_${hash}.jpg`
  deps.objects.set(path, new Blob(['tampered']))
  await assert.rejects(submitEvidence(form, deps), { code: 'PHOTO_CONFLICT', status: 409 })
  assert.equal(await deps.objects.get(path)!.text(), 'tampered')
  assert.equal(deps.tables.damage_reports.length, 0)
})

test('malformed/missing coordinates and non-finite AI outputs are rejected', () => {
  const form = reportForm(); form.delete('latitude')
  assert.throws(() => parseReportInput(form))
  form.set('latitude', 'Infinity')
  assert.throws(() => parseReportInput(form))
  assert.equal(aiResultSchema.safeParse({ status: 'aman', confidence: Infinity, damage_pct: 0 }).success, false)
})

test('farmer and profile lookup failure cannot pass officer guard; PPL/Dinas retain access', async () => {
  const deps = reportFixture()
  assert.equal((await requireOfficer(deps.client)).user, null)
  for (const role of ['ppl', 'dinas']) {
    deps.tables.profiles[0].role = role
    assert.equal((await requireOfficer(deps.client)).user?.id, farmerId)
  }
  deps.tables.profiles.length = 0
  assert.equal((await requireOfficer(deps.client)).user, null)
})

test('YOLO preview fields cannot replace legacy report receipt or grant verification', async () => {
  const deps = reportFixture()
  const form = reportForm()
  form.set('detections', JSON.stringify([{ class_name: 'leaf_blast', confidence: 1, bbox_xyxy: [0, 0, 1, 1] }]))
  form.set('severity_status', 'REVIEW_REQUIRED')
  form.set('model_family', 'yolo26n')
  form.set('is_verified', 'true')
  const result = await submitEvidence(form, deps)
  assert.equal(result.ai_status, 'rusak_ringan')
  assert.equal(result.ai_damage_pct, 54)
  assert.equal(deps.aiCalls(), 1)
  assert.equal(deps.tables.damage_reports[0].is_verified, false)
  assert.equal('detections' in deps.tables.damage_reports[0], false)
})
