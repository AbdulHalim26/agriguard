import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const C = require(fileURLToPath(new URL('../ai-service/training/yolo/review_dashboard/core.js', import.meta.url)))
const W = require(fileURLToPath(new URL('../ai-service/training/yolo/review_dashboard/workspace.js', import.meta.url)))
const T0 = '2026-11-14T10:00:00Z'
const T1 = '2026-11-14T10:01:00Z'
const T2 = '2026-11-14T10:02:00Z'
const U1 = '10000000-0000-4000-8000-000000000001'
const U2 = '10000000-0000-4000-8000-000000000002'
const id = (value: string) => value.repeat(24)

function record(key: string, type: string, images: string[], annotations: string[] = [], pair: string | null = null) {
  return { record_id: id(key), record_type: type, image_ids: images, annotation_ids: annotations, pair_id: pair,
    source_fingerprint: 'f'.repeat(64), reviewer_id: null, decision: 'pending', proposed_action: null,
    annotation_scope: 'unresolved', reason: '', evidence: [], reviewed_at: null, relationship: 'unresolved',
    proposed_group_id: null, negative_verified: false, training_approved: false, conversion_approved: false }
}
function fixture() {
  const samples = [
    { image_id: id('1'), source_image_id: 'synthetic-a', split: 'train', width: 100, height: 50, format: 'mixed', classes: ['Brown-Spot'], flags: ['mixed_annotations'], annotation_ids: [id('a'), id('b')], possible_duplicate_objects: [] },
    { image_id: id('2'), source_image_id: 'synthetic-empty', split: 'valid', width: 100, height: 50, format: 'empty', classes: [], flags: ['empty_labels_not_verified_negative'], annotation_ids: [], possible_duplicate_objects: [] },
    { image_id: id('3'), source_image_id: 'synthetic-healthy', split: 'test', width: 100, height: 50, format: 'bbox', classes: ['Healthy'], flags: ['healthy_not_disease_or_verified_negative'], annotation_ids: [], possible_duplicate_objects: [] },
  ]
  const annotations = [
    { annotation_id: id('a'), image_id: id('1'), line_number: 1, class_name: 'Brown-Spot', class_id: 1, kind: 'bbox', coordinates: [.5, .5, .5, .5], geometry_valid: true, issues: [] },
    { annotation_id: id('b'), image_id: id('1'), line_number: 2, class_name: 'Brown-Spot', class_id: 1, kind: 'polygon', coordinates: [.25, .25, .75, .25, .75, .75, .25, .75], geometry_valid: true, issues: [], envelope_inflation: 1 },
  ]
  const records = [record('4', 'image', [id('1')]), record('5', 'image', [id('2')]), record('6', 'image', [id('3')]),
    record('7', 'annotation', [id('1')], [id('a')]), record('8', 'annotation', [id('1')], [id('b')]), record('9', 'leakage_pair', [id('1'), id('3')], [], id('c'))]
  return { dashboard_id: 'd'.repeat(64), catalog_sha256: 'e'.repeat(64), source_fingerprint: 'f'.repeat(64), records,
    catalog: { samples, annotations, leakage_pairs: [{ pair_id: id('c'), left_image_id: id('1'), right_image_id: id('3'), relationship: 'unresolved' }] },
    pilot: { record_ids: [id('4'), id('7'), id('8'), id('9')] } }
}
function fields(decision = 'accept') {
  return { reviewer_id: 'SYNTHETIC-UNIT-REVIEWER', decision, annotation_scope: 'leaf',
    reason: 'Synthetic export/schema test only, not a real review', evidence: ['qa/samples/synthetic-unit.html'],
    relationship: 'unresolved', proposed_group_id: null, negative_verified: false }
}

test('dashboard starts entirely pending and browsing/filtering cannot fabricate decisions', () => {
  const payload = fixture(); const original = JSON.stringify(payload); const session = C.createSession(payload)
  C.filteredRecords(session, { queue: 'all', className: 'Brown-Spot' })
  C.sampleAssessment(session, id('1'))
  assert.equal(C.statistics(session).pending, 6)
  assert.equal(C.statistics(session).resolved, 0)
  assert.equal(C.changes(session).length, 0)
  assert.throws(() => C.makeExport(session, 'UNIT'), /No explicit/)
  assert.equal(JSON.stringify(payload), original)
})

test('an image decision changes only that exact record, not children or pair endpoints', () => {
  const session = C.createSession(fixture())
  C.saveDecision(session, id('4'), fields(), T0)
  assert.equal(session.working.get(id('4')).decision, 'accept')
  for (const key of ['5', '6', '7', '8', '9']) assert.equal(session.working.get(id(key)).decision, 'pending')
  assert.equal(C.statistics(session).resolved, 1)
  assert.equal(C.statistics(session).pending, 5)
  assert.equal(C.sampleAssessment(session, id('1')).conversion_authorized, false)
})

test('review fields, annotation scope, timestamps and immutable approval boundaries fail closed', () => {
  const session = C.createSession(fixture())
  for (const change of [{ reviewer_id: '' }, { reason: '' }, { evidence: [] }, { annotation_scope: 'unresolved' }]) {
    assert.throws(() => C.saveDecision(session, id('7'), { ...fields(), ...change }, T0))
  }
  assert.throws(() => C.saveDecision(session, id('7'), fields(), '2026-11-14T10:00:00'), /timestamp/)
  assert.throws(() => C.saveDecision(session, id('7'), fields(), '2026-02-30T10:00:00Z'), /calendar/)
  assert.throws(() => C.saveDecision(session, id('7'), { ...fields(), training_approved: true }, T0), /immutable/)
  assert.throws(() => C.saveDecision(session, id('7'), { ...fields(), relationship: 'same_original' }, T0), /Ancestry/)
  assert.equal(C.changes(session).length, 0)
})

test('UNRESOLVED and REVISE are touched but remain pending/needs-work, not resolved QA', () => {
  const session = C.createSession(fixture())
  C.saveDecision(session, id('4'), fields('unresolved'), T0)
  C.saveDecision(session, id('7'), fields('revise'), T0)
  const stats = C.statistics(session)
  assert.equal(stats.touched, 2)
  assert.equal(stats.resolved, 0)
  assert.equal(stats.needs_work, 6)
})

test('negative and ancestry declarations require explicit eligible record types', () => {
  const session = C.createSession(fixture())
  assert.throws(() => C.saveDecision(session, id('4'), { ...fields(), negative_verified: true }, T0), /Negative/)
  C.saveDecision(session, id('5'), fields(), T0)
  assert.equal(C.sampleAssessment(session, id('2')).explicit_negative_review_required, true)
  C.saveDecision(session, id('5'), { ...fields(), negative_verified: true }, T1)
  assert.equal(C.sampleAssessment(session, id('2')).explicit_negative_review_required, false)
  assert.throws(() => C.saveDecision(session, id('9'), fields(), T0), /relationship/)
  assert.throws(() => C.saveDecision(session, id('9'), { ...fields(), relationship: 'visually_similar_only', proposed_group_id: 'guess' }, T0), /ancestry/)
  C.saveDecision(session, id('9'), { ...fields(), relationship: 'visually_similar_only' }, T0)
  assert.equal(session.working.get(id('6')).decision, 'pending')
})

test('explicit delta export preserves IDs and before values and does not advance base on download', () => {
  const session = C.createSession(fixture())
  C.saveDecision(session, id('7'), fields(), T0)
  const exported = C.makeExport(session, 'UNIT', { now: T1, exportId: U1 })
  assert.equal(exported.revision, 1)
  assert.equal(exported.parent_export_id, null)
  assert.equal(exported.changes.length, 1)
  assert.equal(exported.changes[0].record_id, id('7'))
  assert.equal(exported.changes[0].before.decision, 'pending')
  assert.equal(exported.changes[0].after.source_fingerprint, 'f'.repeat(64))
  assert.equal(session.revision, 0)
  assert.equal(session.base.get(id('7')).decision, 'pending')
})

test('saved exact export can be explicitly imported, then revisions must form an exact chain', () => {
  const session = C.createSession(fixture())
  C.saveDecision(session, id('7'), fields(), T0)
  const v1 = C.makeExport(session, 'UNIT', { now: T1, exportId: U1 })
  assert.equal(C.importExport(session, v1), 1)
  assert.equal(session.revision, 1)
  assert.equal(C.changes(session).length, 0)
  C.saveDecision(session, id('4'), fields('exclude'), T1)
  const v2 = C.makeExport(session, 'UNIT', { now: T2, exportId: U2 })
  const fresh = C.createSession(fixture())
  assert.throws(() => C.importExport(fresh, v2), /revision\/parent/)
  C.importExport(fresh, v1); C.importExport(fresh, v2)
  assert.equal(C.statistics(fresh).resolved, 2)
  assert.equal(C.statistics(fresh).pending, 4)
  assert.throws(() => C.importExport(fresh, v1), /revision\/parent/)
})

test('conflicting/partial deltas never partially apply or overwrite unsaved edits', () => {
  const editor = C.createSession(fixture())
  C.saveDecision(editor, id('7'), fields(), T0)
  const first = C.makeExport(editor, 'UNIT', { now: T1, exportId: U1 })
  C.saveDecision(editor, id('4'), fields('exclude'), T0)
  assert.throws(() => C.importExport(editor, first), /in-memory/)
  assert.equal(editor.working.get(id('4')).decision, 'exclude')
  const two = C.makeExport(editor, 'UNIT', { now: T1, exportId: U1 })
  const invalid = structuredClone(two)
  invalid.changes[1].after.evidence = []
  const fresh = C.createSession(fixture())
  assert.throws(() => C.importExport(fresh, invalid), /evidence/)
  assert.equal(fresh.revision, 0)
  assert.equal(C.statistics(fresh).pending, 6)
  C.importExport(editor, two)
  assert.equal(editor.revision, 1)
})

test('wrong fingerprint, changed IDs and assessment-file imports are rejected', () => {
  const source = C.createSession(fixture()); C.saveDecision(source, id('7'), fields(), T0)
  const value = C.makeExport(source, 'UNIT', { now: T1, exportId: U1 })
  for (const mutate of [(doc: any) => { doc.source_fingerprint = '0'.repeat(64) }, (doc: any) => { doc.changes[0].after.image_ids = [id('2')] }, (doc: any) => { doc.changes[0].after.training_approved = true }]) {
    const altered = structuredClone(value); mutate(altered)
    assert.throws(() => C.importExport(C.createSession(fixture()), altered))
  }
  assert.throws(() => C.importExport(C.createSession(fixture()), { format: 'agriguard-readonly-review-assessment' }), /fields/)
})

test('filters and class/issue statistics preserve overlapping record contexts', () => {
  const data = fixture()
  data.catalog.samples[0].classes.push('Healthy')
  const session = C.createSession(data)
  assert.equal(C.filteredRecords(session, { queue: 'pilot', type: 'annotation' }).length, 2)
  assert.equal(C.filteredRecords(session, { queue: 'all', className: 'EMPTY / NO SOURCE LABEL' }).length, 1)
  assert.equal(C.filteredRecords(session, { queue: 'all', issue: 'cross_split_similarity_not_ancestry' }).length, 1)
  assert.equal(C.filteredRecords(session, { queue: 'all', type: 'annotation', className: 'Healthy' }).length, 0)
  assert.ok(C.statistics(session).by_class['Brown-Spot'].pending > 1)
  const polygon = session.annotations.get(id('b')); const before = structuredClone(polygon)
  assert.deepEqual(C.envelope(polygon), [.25, .25, .75, .75])
  assert.deepEqual(polygon, before)
})

test('offline interface compiles and uses explicit file export, not network or hidden persistence', () => {
  const base = new URL('../ai-service/training/yolo/review_dashboard/', import.meta.url)
  const ui = readFileSync(new URL('dashboard.js', base), 'utf8')
  const page = readFileSync(new URL('page.html', base), 'utf8')
  new Script(ui)
  assert.match(page, /connect-src 'none'/)
  assert.match(page, /Pilih secara eksplisit/)
  assert.match(page, /id="show-proposal" type="checkbox">/)
  assert.match(ui, /URL\.createObjectURL/)
  assert.match(ui, /anchor\.download/)
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|localStorage|indexedDB|showSaveFilePicker/)
})

test('workspace search is literal, combines terms and does not change review state', () => {
  const payload = fixture(); const original = JSON.stringify(payload); const session = C.createSession(payload)
  const index = W.searchIndex(session); const rows = Array.from(session.working.values())
  assert.equal(W.search(rows, id('7'), index).length, 1)
  assert.equal(W.search(rows, 'BROWN-SPOT L1', index)[0].record_id, id('7'))
  assert.equal(W.search(rows, '.*', index).length, 0)
  assert.equal(W.search(rows, '   ', index).length, rows.length)
  assert.equal(C.changes(session).length, 0)
  assert.equal(JSON.stringify(payload), original)
})

test('pagination clamps safely and locates the active record across all filtered results', () => {
  const rows = Array.from({ length: 53 }, (_, index) => ({ record_id: `record-${index}` }))
  const page = W.paginate(rows, 1, 20)
  assert.equal(page.start, 21); assert.equal(page.end, 40); assert.equal(page.totalPages, 3)
  assert.equal(W.pageFor(rows, 'record-52', 20), 2)
  assert.equal(W.paginate(rows, 99, 20).rows.length, 13)
  assert.equal(W.paginate(rows, -1, 20).page, 0)
  assert.deepEqual(W.paginate([], 0, 20).rows, [])
  assert.throws(() => W.paginate(rows, 0, 0))
  assert.throws(() => W.paginate(rows, 1.5, 20))
})

test('readable metadata uses the actual annotation class and clearly separates pending from QA decisions', () => {
  const data = fixture(); data.catalog.samples[0].classes.push('Healthy')
  const session = C.createSession(data); const record = session.working.get(id('7'))
  const view = W.describe(session, record)
  assert.deepEqual(view.classes, ['Brown-Spot'])
  assert.equal(view.type, 'Anotasi'); assert.equal(view.format, 'Bounding box')
  assert.equal(view.split, 'train'); assert.equal(view.resolution, '100 × 50')
  assert.equal(view.status.label, 'BELUM DIREVIEW')
  assert.notEqual(W.status('pending').tone, W.status('accept').tone)
  assert.match(W.status('accept').label, /QA/)
  assert.match(W.issue('scope_review_required'), /Scope/)
  assert.equal(C.changes(session).length, 0)
})

test('fit/zoom keeps image and overlay scales uniform without cropping', () => {
  assert.deepEqual(W.fitImage(1000, 500, 600, 600, 1), { width: 600, height: 300, stageWidth: 600, stageHeight: 600 })
  assert.deepEqual(W.fitImage(500, 1000, 400, 300, 1), { width: 150, height: 300, stageWidth: 400, stageHeight: 300 })
  const zoom = W.fitImage(1000, 500, 600, 600, 2)
  assert.equal(zoom.width, 1200); assert.equal(zoom.height, 600)
  assert.equal(zoom.width / 1000, zoom.height / 500)
  assert.ok(zoom.stageWidth >= zoom.width && zoom.stageHeight >= zoom.height)
  assert.throws(() => W.fitImage(0, 500, 600, 600))
  assert.throws(() => W.fitImage(100, 100, NaN, 600))
})

test('keyboard navigation is opt-in, ignores text editing/modifiers and never selects a decision', () => {
  const base = { key: 'ArrowRight', altKey: true, target: { tagName: 'DIV' } }
  assert.equal(W.keyboardDirection(base, false), 0)
  assert.equal(W.keyboardDirection(base, true), 1)
  assert.equal(W.keyboardDirection({ ...base, key: 'ArrowLeft' }, true), -1)
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }, { closest: () => ({}) }]) {
    assert.equal(W.keyboardDirection({ ...base, target }, true), 0)
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'repeat', 'defaultPrevented']) {
    assert.equal(W.keyboardDirection({ ...base, [modifier]: true }, true), 0)
  }
  assert.equal(W.keyboardDirection({ ...base, altKey: false }, true), 0)
  assert.equal(W.keyboardDirection({ ...base, key: 'Enter' }, true), 0)
})

test('three-panel UI exposes search/pagination/focus controls and keeps technical JSON collapsible', () => {
  const base = new URL('../ai-service/training/yolo/review_dashboard/', import.meta.url)
  const page = readFileSync(new URL('page.html', base), 'utf8')
  const css = readFileSync(new URL('style.css', base), 'utf8')
  const helper = readFileSync(new URL('workspace.js', base), 'utf8')
  new Script(helper)
  for (const name of ['queue-panel', 'viewer-panel', 'review-panel']) assert.match(page, new RegExp(name))
  for (const name of ['search-query', 'page-size', 'page-next', 'record-summary', 'memory-state', 'keyboard-navigation']) assert.match(page, new RegExp(`id="${name}"`))
  assert.match(page, /Metadata teknis lengkap<\/summary><pre id="metadata"/)
  assert.match(page, /id="keyboard-navigation" type="checkbox">/)
  assert.match(css, /grid-template-columns:260px minmax\(320px,1fr\) 330px/)
  assert.match(css, /focus-visible/)
  assert.match(css, /\[hidden\]\{display:none!important\}/)
  assert.doesNotMatch(css, /object-fit\s*:\s*cover/)
})
