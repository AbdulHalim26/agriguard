import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { advisoryAssessment, reportAdvisory, reportVerification, submissionEvidence } from '../lib/reports/advisory'
import { formatHectares, registeredArea, uniqueRegisteredArea } from '../lib/reports/area'
import { reportReadScope, verifiedReportScope } from '../lib/reports/reporting'
import { aiResultSchema } from '../lib/reports/evidence'
import { submitEvidence } from '../lib/reports/submit'
import { reportFixture, reportForm } from './report-fixtures'
import AdvisoryAssessment from '../components/features/AdvisoryAssessment'
import RegisteredAreaSummary from '../components/features/RegisteredAreaSummary'
import AnalysisFailureActions from '../components/features/AnalysisFailureActions'
import AutpSupportingReport from '../components/features/AutpSupportingReport'
import type { VerificationReport } from '../app/(app)/verifikasi/verification-actions'

const NOW = '2026-11-17T04:00:00.000Z'
const prediction = { status: 'rusak_berat' as const, confidence: .82, damage_pct: 89, analysis_id: 'synthetic-receipt' }
function report(id = 'synthetic-report-1', parcelId: string | null = 'parcel-a', area: number | null = 2,
  changes: Partial<VerificationReport> = {}): VerificationReport {
  return { id, lahan_id: parcelId, lahan_name: 'Nama Lahan Sama', lahan_area_hectares: area,
    poktan_name: 'Poktan fixture', village: 'Desa fixture', district: 'Wilayah A', owner_name: 'Pelapor fixture',
    reporter_id: 'synthetic-farmer', ai_status: prediction.status, ai_confidence: prediction.confidence,
    ai_damage_pct: prediction.damage_pct, ai_analysis_id: prediction.analysis_id, evidence_source: 'server_ai',
    latitude: -6.31, longitude: 107.29, client_created_at: NOW, server_created_at: NOW,
    photo_url: 'https://example.invalid/signed?token=must-not-be-printed',
    photo_paths: ['private/fixture-photo.jpg'], photo_hash: 'a'.repeat(64), is_verified: true,
    verified_at: NOW, verifier_name: 'PPL fixture', verifier_id: 'synthetic-officer', verification_note: 'Catatan fixture', ...changes }
}
const refs = (rows: VerificationReport[]) => rows.map((r) => ({ parcel_id: r.lahan_id, registered_area_hectares: r.lahan_area_hectares }))
const renderAssessment = (view: ReturnType<typeof advisoryAssessment>, compact = false, technical = false) =>
  renderToStaticMarkup(createElement(AdvisoryAssessment, { assessment: view, compact, technical }))
const renderDocument = (rows: VerificationReport[], count: unknown = rows.length) => renderToStaticMarkup(createElement(AutpSupportingReport, {
  reports: rows, scopeLabel: 'fixture terverifikasi, semua wilayah termuat', readScope: reportReadScope(rows.length, count, NOW), generatedAt: NOW,
}))

test('advisory: all three compatible visual statuses remain uncalibrated and REVIEW_REQUIRED', () => {
  for (const status of ['aman', 'rusak_ringan', 'rusak_berat']) {
    const view = advisoryAssessment({ ...prediction, status, evidence_source: 'server_ai' })
    assert.equal(view.predicted_visual_status, status)
    assert.equal(view.review_status, 'REVIEW_REQUIRED')
    assert.equal(view.calibration_status, 'UNCALIBRATED')
    assert.equal(view.severity_assessment_status, 'UNCALIBRATED_VISUAL_INDICATION')
    assert.equal(view.measured_field_damage_pct, null)
    assert.equal(view.measured_affected_area.hectares, null)
    assert.equal(view.insurer_decision, 'NOT_DETERMINED')
  }
})
test('advisory: confidence is labeled classification confidence, not measured crop damage or accuracy', () => {
  const html = renderAssessment(advisoryAssessment({ ...prediction, evidence_source: 'server_ai' }))
  assert.match(html, /Keyakinan model \(klasifikasi foto\): 82%/)
  assert.match(html, /Indikasi Kerusakan Berat/)
  assert.match(html, /belum menentukan luas kerusakan lahan/)
  assert.doesNotMatch(html, /Kerusakan 89%|kerusakan 82%|akurasi 82%/)
})
test('advisory: persisted legacy percentage is retained exactly and explicitly LEGACY_UNCALIBRATED', () => {
  const original = Object.freeze(report())
  const view = reportAdvisory(original)
  assert.equal(view.raw.damage_pct, original.ai_damage_pct)
  assert.equal(view.raw.confidence, original.ai_confidence)
  assert.equal(view.raw.analysis_id, original.ai_analysis_id)
  assert.equal(view.raw.report_id, original.id)
  assert.equal(view.legacy_damage_status, 'LEGACY_UNCALIBRATED')
  const html = renderAssessment(view, false, true)
  assert.match(html, /LEGACY_UNCALIBRATED/)
  assert.match(html, /damage_pct/)
  assert.match(html, /89/)
  assert.doesNotMatch(html, /89%/)
  assert.equal(original.ai_damage_pct, 89)
})
test('advisory: zero historical damage_pct remains zero, not unavailable or measured zero damage', () => {
  const view = reportAdvisory(report('zero', 'parcel-a', 2, { ai_damage_pct: 0 }))
  assert.equal(view.raw.damage_pct, 0)
  assert.equal(view.legacy_damage_status, 'LEGACY_UNCALIBRATED')
  assert.equal(view.measured_field_damage_pct, null)
  assert.equal(view.measured_affected_area.status, 'UNKNOWN_AFFECTED_AREA')
})
test('advisory: missing/invalid confidence never becomes zero, 100% or measured damage', () => {
  for (const confidence of [null, undefined, NaN, Infinity, -1, 1.01, '0.82']) {
    const view = advisoryAssessment({ ...prediction, confidence, evidence_source: 'server_ai' })
    assert.equal(view.confidence, null)
    assert.ok(Object.is(view.raw.confidence, confidence))
    assert.equal(view.measured_field_damage_pct, null)
    assert.doesNotMatch(renderAssessment(view), /Keyakinan model \(klasifikasi foto\):/)
  }
})
test('advisory: original model class/version are unknown instead of inferred from historical status', () => {
  const view = reportAdvisory(report())
  assert.equal(view.model_class, null)
  assert.equal(view.model_version, null)
  assert.equal(view.label_basis, 'COMPATIBILITY_STATUS_MAPPING')
})
test('advisory: manual reports are clearly user assessments even if legacy AI numbers exist', () => {
  const row = report('manual', 'parcel-a', 2, { evidence_source: 'manual' })
  const view = reportAdvisory(row)
  assert.equal(view.origin, 'USER_REPORTED')
  assert.equal(view.confidence, null)
  assert.equal(view.raw.confidence, .82)
  assert.equal(view.review_status, 'REVIEW_REQUIRED')
  const html = renderAssessment(view)
  assert.match(html, /Penilaian Pelapor/)
  assert.doesNotMatch(html, /Keyakinan model|82%|Hasil Analisis AI/)
})
test('advisory: legacy/unverified origin is not silently promoted to server AI', () => {
  const view = reportAdvisory(report('legacy', 'parcel-a', 2, { evidence_source: 'legacy_unverified' }))
  assert.equal(view.origin, 'LEGACY_UNVERIFIED')
  assert.match(renderAssessment(view), /asal belum terverifikasi/)
})
test('advisory: pending or malformed status has no fabricated visual class or damage measurement', () => {
  for (const input of [{ status: 'rusak_berat', evidence_source: 'pending' }, { status: 'flood-confirmed', evidence_source: 'server_ai' }, {}]) {
    const view = advisoryAssessment(input)
    assert.equal(view.predicted_visual_status, null)
    assert.equal(view.severity_assessment_status, 'NO_AI_ASSESSMENT')
    assert.equal(view.review_status, 'REVIEW_REQUIRED')
  }
})
test('advisory: PPL verification never calibrates AI or determines insurer decision', () => {
  for (const is_verified of [true, false]) {
    const row = report('state', 'parcel-a', 2, { is_verified })
    const view = reportAdvisory(row)
    assert.equal(view.review_status, 'REVIEW_REQUIRED')
    assert.equal(view.insurer_decision, 'NOT_DETERMINED')
    assert.equal(view.calibration_status, 'LEGACY_UNCALIBRATED')
    assert.equal(view.measured_affected_area.hectares, null)
  }
  assert.equal(reportVerification({ is_verified: true }).status, 'VERIFIED_REPORT')
  assert.equal(reportVerification({ is_verified: false, verified_at: NOW }).status, 'REJECTED_REPORT')
  assert.equal(reportVerification({ is_verified: false, verified_at: null }).status, 'PENDING_REPORT_REVIEW')
})
test('advisory: compact cards also retain review/calibration distinction', () => {
  const html = renderAssessment(reportAdvisory(report()), true)
  assert.match(html, /REVIEW_REQUIRED/)
  assert.match(html, /data-calibration-status="LEGACY_UNCALIBRATED"/)
  assert.doesNotMatch(html, /89%/)
})
test('advisory: healthy-compatible photo status is not presented as field SAFE or a health percentage', () => {
  const html = renderAssessment(reportAdvisory(report('healthy', 'parcel-a', 2, { ai_status: 'aman', ai_damage_pct: 5 })))
  assert.match(html, /Tidak Tampak Kerusakan \(Foto\)/)
  assert.match(html, /REVIEW_REQUIRED/)
  assert.doesNotMatch(html, /95%|5%|Lahan Aman|Tanaman tampak sehat/)
})

test('manual workflow: quality-rejected and unavailable-AI UIs both offer manual reporting', () => {
  for (const retake of [true, false]) {
    const html = renderToStaticMarkup(createElement(AnalysisFailureActions, {
      retake, manualMode: false, onRetake: () => {}, onRetry: () => {}, onManual: () => {},
    }))
    assert.match(html, /Gunakan Pelaporan Manual/)
    assert.match(html, retake ? /Ambil Ulang Foto/ : /Coba Lagi/)
  }
})
test('manual workflow: explicit manual selection overrides preview only in submitted source, never fabricates confidence', () => {
  const original = Object.freeze({ ...prediction })
  const choice = submissionEvidence({ manualMode: true, manualStatus: 'rusak_ringan', prediction: original })
  assert.equal(choice.source, 'manual')
  assert.equal(choice.status, 'rusak_ringan')
  assert.equal(choice.confidence, null)
  assert.equal(choice.damage_pct, null)
  assert.equal(choice.analysis_id, undefined)
  assert.equal(original.damage_pct, 89)
})
test('manual workflow: AI unavailable does not prevent an authorized manual server report', async () => {
  const deps = reportFixture(); deps.setAiUnavailable(true)
  const form = reportForm()
  const choice = submissionEvidence({ manualMode: true, manualStatus: 'rusak_berat', prediction: null })
  form.set('evidence_source', choice.source); form.set('manual_status', choice.status!)
  const result = await submitEvidence(form, deps)
  assert.equal(result.evidence_source, 'manual')
  assert.equal(deps.aiCalls(), 0)
  assert.equal(deps.tables.damage_reports[0].is_verified, false)
  assert.equal(reportAdvisory(deps.tables.damage_reports[0]).review_status, 'REVIEW_REQUIRED')
})
test('compatibility: AI submission/queue selection preserves status, raw numeric values and receipt identity', () => {
  const choice = submissionEvidence({ manualMode: false, manualStatus: 'aman', prediction })
  assert.equal(choice.source, 'ai')
  assert.equal(choice.analysis_id, prediction.analysis_id)
  assert.equal(choice.confidence, prediction.confidence)
  assert.equal(choice.damage_pct, prediction.damage_pct)
  assert.equal(aiResultSchema.safeParse(choice).success, true)
  const pending = submissionEvidence({ manualMode: false, manualStatus: 'aman', prediction: null })
  assert.equal(pending.source, 'pending'); assert.equal(pending.status, null)
})
test('compatibility: presentation cannot rewrite original persisted AI evidence or receipts', async () => {
  const deps = reportFixture()
  await submitEvidence(reportForm(), deps)
  const before = structuredClone({ reports: deps.tables.damage_reports, receipts: deps.tables.ai_analyses })
  reportAdvisory(deps.tables.damage_reports[0])
  assert.deepEqual({ reports: deps.tables.damage_reports, receipts: deps.tables.ai_analyses }, before)
  assert.equal(deps.tables.damage_reports[0].ai_damage_pct, 54)
})
test('compatibility: client advisory/measurement/claim fields cannot authorize or alter a server report', async () => {
  const deps = reportFixture(), form = reportForm()
  form.set('calibration_status', 'CALIBRATED'); form.set('measured_affected_area', '99')
  form.set('insurer_decision', 'CLAIM_APPROVED'); form.set('review_status', 'APPROVED')
  await submitEvidence(form, deps)
  const stored = deps.tables.damage_reports[0]
  assert.equal(stored.is_verified, false)
  assert.equal('measured_affected_area' in stored, false)
  assert.equal('insurer_decision' in stored, false)
  assert.equal(reportAdvisory(stored).insurer_decision, 'NOT_DETERMINED')
})

test('area: three reports for parcel A at 2 ha count 2 registered ha, never 6 affected ha', () => {
  const rows = [report('r1'), report('r2'), report('r3')]
  const summary = uniqueRegisteredArea(refs(rows), 'selected reports')
  assert.equal(summary.hectares, 2)
  assert.equal(summary.unique_parcel_count, 1)
  assert.equal(summary.measured_affected_area.hectares, null)
  assert.equal(summary.measured_affected_area.status, 'UNKNOWN_AFFECTED_AREA')
  assert.equal(rows.length, 3)
})
test('area: two different parcel IDs count separately even with identical names or overlap hints', () => {
  const rows = [report('r1', 'parcel-a', 2), report('r2', 'parcel-b', 3)]
  const summary = uniqueRegisteredArea(refs(rows), 'two IDs')
  assert.equal(summary.hectares, 5)
  assert.equal(summary.unique_parcel_count, 2)
  assert.equal(summary.physical_or_legal_uniqueness_verified, false)
})
test('area: unknown affected area stays unknown for accepted, rejected and pending reports', () => {
  for (const is_verified of [true, false]) {
    const row = report('r1', 'parcel-a', 2, { is_verified, ai_confidence: 1, ai_damage_pct: 100 })
    const summary = uniqueRegisteredArea(refs([row]), 'fixture')
    assert.equal(summary.measured_affected_area.hectares, null)
    assert.equal(reportAdvisory(row).measured_field_damage_pct, null)
  }
})
test('area: invalid/missing/zero/nonfinite registered area is unknown, never coerced into valid hectares', () => {
  for (const value of [null, undefined, '', '  ', false, true, -1, 0, NaN, Infinity, 1001, '0x2', '2 ha', '1,5']) {
    assert.equal(registeredArea(value), null)
    const summary = uniqueRegisteredArea([{ parcel_id: 'a', registered_area_hectares: value }], 'invalid')
    assert.equal(summary.hectares, null)
    assert.equal(summary.status, 'UNKNOWN')
  }
  assert.equal(registeredArea('2.50'), 2.5)
  assert.equal(registeredArea(1000), 1000)
  assert.equal(formatHectares(-1), 'Belum diketahui')
  assert.equal(formatHectares(Infinity), 'Belum diketahui')
})
test('area: absent parcel identifiers are not guessed from field names or report IDs', () => {
  const summary = uniqueRegisteredArea([{ parcel_id: null, registered_area_hectares: 2 },
    { parcel_id: '', registered_area_hectares: 2 }], 'unidentified')
  assert.equal(summary.unique_parcel_count, 0)
  assert.equal(summary.unidentified_report_count, 2)
  assert.equal(summary.hectares, null)
  const knownIdWithoutAccessibleArea = uniqueRegisteredArea([{ parcel_id: 'known-foreign-key', registered_area_hectares: undefined }], 'missing relation')
  assert.equal(knownIdWithoutAccessibleArea.unique_parcel_count, 1)
  assert.equal(knownIdWithoutAccessibleArea.unidentified_report_count, 0)
  assert.equal(knownIdWithoutAccessibleArea.hectares, null)
})
test('area: conflicting values for one ID fail closed and do not use first/last/max value', () => {
  const rows = [{ parcel_id: 'a', registered_area_hectares: 2 }, { parcel_id: 'a', registered_area_hectares: 3 },
    { parcel_id: 'b', registered_area_hectares: 4 }]
  for (const input of [rows, [...rows].reverse()]) {
    const summary = uniqueRegisteredArea(input, 'conflict')
    assert.equal(summary.hectares, null)
    assert.equal(summary.known_subtotal_hectares, 4)
    assert.deepEqual(summary.conflicting_parcel_ids, ['a'])
    assert.equal(summary.status, 'PARTIAL')
  }
})
test('area: a missing repeat value does not silently confirm a known parcel area', () => {
  const summary = uniqueRegisteredArea([{ parcel_id: 'a', registered_area_hectares: 2 },
    { parcel_id: 'a', registered_area_hectares: null }], 'incomplete')
  assert.equal(summary.hectares, null)
  assert.deepEqual(summary.unknown_parcel_ids, ['a'])
})
test('area: empty scope is explicitly empty registered area, not measured zero damage', () => {
  const summary = uniqueRegisteredArea([], 'empty')
  assert.equal(summary.status, 'EMPTY'); assert.equal(summary.hectares, 0)
  assert.equal(summary.measured_affected_area.hectares, null)
  assert.equal(formatHectares(null), 'Belum diketahui')
})
test('area: calculation does not mutate records or use model confidence/coverage as hectares', () => {
  const rows = Object.freeze([Object.freeze({ parcel_id: 'a', registered_area_hectares: 2, confidence: .9, damage_pct: 80, bbox_ratio: .8 })])
  const summary = uniqueRegisteredArea(rows, 'immutable')
  assert.equal(summary.hectares, 2)
  assert.equal(summary.measured_affected_area.hectares, null)
  assert.equal(rows[0].damage_pct, 80)
})
test('area UI: partial totals and unknown affected area are explicit rather than misleading complete totals', () => {
  const summary = uniqueRegisteredArea([{ parcel_id: 'a', registered_area_hectares: 2 },
    { parcel_id: 'b', registered_area_hectares: null }], 'filtered loaded reports')
  const html = renderToStaticMarkup(createElement(RegisteredAreaSummary, { summary }))
  assert.match(html, /Total belum lengkap/)
  assert.match(html, /Subtotal nilai yang konsisten: 2 ha/)
  assert.match(html, /Luas terdampak belum terverifikasi/)
  assert.doesNotMatch(html, /Luas terdampak: 2 ha/)
})

test('report scope: WIB day boundaries include milliseconds at the end and exclude the next day', () => {
  const rows = [report('before', 'a', 2, { server_created_at: '2026-11-16T16:59:59.999Z' }),
    report('start', 'a', 2, { server_created_at: '2026-11-16T17:00:00.000Z' }),
    report('last', 'a', 2, { server_created_at: '2026-11-17T16:59:59.999Z' }),
    report('after', 'a', 2, { server_created_at: '2026-11-17T17:00:00.000Z' })]
  const selected = verifiedReportScope(rows, { from: '2026-11-17', to: '2026-11-17', region: 'all' })
  assert.deepEqual(selected.rows.map((r) => r.id), ['start', 'last'])
  assert.match(selected.scope, /WIB/)
})
test('report scope: invalid/reversed dates fail closed and invalid source times are counted', () => {
  for (const filter of [{ from: '2026-02-30', to: '' }, { from: '2026-11-18', to: '2026-11-17' }]) {
    assert.ok(verifiedReportScope([report()], { ...filter, region: 'all' }).error)
  }
  const selected = verifiedReportScope([report('bad', 'a', 2, { server_created_at: 'not-a-time' })],
    { from: '2026-11-17', to: '', region: 'all' })
  assert.equal(selected.invalid_timestamp_count, 1)
  assert.equal(selected.rows.length, 0)
})
test('report scope: area is calculated after verification/region filtering, not from unfiltered history', () => {
  const selected = verifiedReportScope([report('a1'), report('a2'), report('b', 'b', 3, { district: 'Wilayah B' }),
    report('pending', 'c', 5, { is_verified: false, verified_at: null })], { from: '', to: '', region: 'Wilayah A' })
  assert.equal(uniqueRegisteredArea(refs(selected.rows), selected.scope).hectares, 2)
  assert.equal(selected.rows.length, 2)
})
test('report read metadata: truncated and missing counts are not declared complete', () => {
  assert.equal(reportReadScope(200, 250, NOW).completeness, 'TRUNCATED')
  assert.equal(reportReadScope(12, null, NOW).completeness, 'UNKNOWN')
  assert.equal(reportReadScope(12, 5, NOW).completeness, 'UNKNOWN')
  assert.equal(reportReadScope(12, 12, NOW).completeness, 'COMPLETE')
})

test('AUTP print: repeated parcel reports retain all report IDs but count registered area only once', () => {
  const html = renderDocument([report('r1'), report('r2'), report('r3')])
  for (const id of ['r1', 'r2', 'r3']) assert.ok(html.includes(id))
  assert.match(html, /1 ID lahan unik/)
  assert.match(html, /2 ha/)
  assert.doesNotMatch(html, /6 ha|Total Luas Terdampak/)
  assert.match(html, /bukan untuk dijumlahkan/)
})
test('AUTP print: AI review/calibration, registered area, unknown affected area and insurer authority remain distinct', () => {
  const html = renderDocument([report()])
  assert.match(html, /REVIEW_REQUIRED/)
  assert.match(html, /LEGACY_UNCALIBRATED/)
  assert.match(html, /Luas terdampak belum terverifikasi/)
  assert.match(html, /Verifikasi laporan bukan persetujuan klaim/)
  assert.match(html, /tidak menyatakan persetujuan atau integrasi resmi Jasindo/)
  assert.doesNotMatch(html, /89%|CLAIM_APPROVED|INSURANCE_ELIGIBLE/)
})
test('AUTP print: provenance includes receipt, original timestamps, photo references/hash and reviewer identity', () => {
  const original = Object.freeze(report())
  const html = renderDocument([original])
  for (const evidence of ['synthetic-receipt', 'synthetic-farmer', 'synthetic-officer', 'private/fixture-photo.jpg', 'a'.repeat(64), 'Catatan fixture', 'WIB']) {
    assert.ok(html.includes(evidence), evidence)
  }
  assert.doesNotMatch(html, /must-not-be-printed/)
  assert.equal(original.photo_url, 'https://example.invalid/signed?token=must-not-be-printed')
})
test('AUTP print: incomplete evidence and unknown read completeness remain explicit', () => {
  const row = report('incomplete', null, null, { photo_paths: [], photo_hash: null, verifier_name: null })
  const html = renderDocument([row], null)
  assert.match(html, /Referensi foto belum tersedia; bukti belum lengkap/)
  assert.match(html, /belum dapat dinyatakan lengkap/)
  assert.match(html, /Belum diketahui/)
})
test('AUTP print: truncation is visible and cross-region subgroups do not multiply global registered area', () => {
  const rows = [report('a1'), report('a2', 'parcel-a', 2, { district: 'Wilayah B' })]
  const html = renderDocument(rows, 250)
  assert.match(html, /maksimal 200 laporan terbaru/)
  assert.match(html, /belum dapat dinyatakan lengkap/)
  assert.match(html, /1 ID lahan unik/)
  assert.doesNotMatch(html, /4 ha/)
})
test('AUTP print: unverified records cannot be printed as verified by a direct component caller', () => {
  const html = renderDocument([report('verified-id'), report('unverified-id', 'b', 9, { is_verified: false, verified_at: null })])
  assert.ok(html.includes('verified-id'))
  assert.doesNotMatch(html, /unverified-id|9 ha/)
})
