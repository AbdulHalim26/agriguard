(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AgriGuardReview = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'agriguard-human-review-delta';
  const ACTIONS = ['accept', 'revise', 'exclude', 'unresolved'];
  const SCOPES = ['unresolved', 'lesion', 'leaf', 'other', 'not_applicable'];
  const RELATIONS = ['unresolved', 'same_original', 'same_session', 'different_original', 'visually_similar_only'];
  const CONTEXT = ['record_id', 'record_type', 'image_ids', 'annotation_ids', 'pair_id', 'source_fingerprint'];
  const FIELDS = CONTEXT.concat(['reviewer_id', 'decision', 'proposed_action', 'annotation_scope', 'reason', 'evidence', 'reviewed_at', 'relationship', 'proposed_group_id', 'negative_verified', 'training_approved', 'conversion_approved']);
  const HEADER = ['format', 'schema_version', 'dashboard_id', 'catalog_sha256', 'source_fingerprint', 'export_id', 'revision', 'parent_export_id', 'exported_at', 'exporter_id', 'changes'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => { throw new Error(message); };
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  const equal = (a, b) => canonical(a) === canonical(b);
  function exactKeys(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !equal(Object.keys(value).sort(), fields.slice().sort())) fail('Unknown or missing fields');
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Timezone-qualified ISO timestamp required');
    const [year, month, day, hour, minute, second] = value.slice(0, 19).match(/\d+/g).map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) fail('Invalid calendar timestamp');
    return Date.parse(value);
  }
  function createSession(payload) {
    const templates = new Map(payload.records.map((record) => [record.record_id, clone(record)]));
    if (templates.size !== payload.records.length) fail('Duplicate baseline record IDs');
    const catalog = payload.catalog;
    const samples = new Map(catalog.samples.map((row) => [row.image_id, row]));
    const annotations = new Map(catalog.annotations.map((row) => [row.annotation_id, row]));
    const pairs = new Map(catalog.leakage_pairs.map((row) => [row.pair_id, row]));
    const base = new Map(payload.records.map((record) => [record.record_id, clone(record)]));
    const working = new Map(payload.records.map((record) => [record.record_id, clone(record)]));
    return { payload, templates, samples, annotations, pairs, base, working, revision: 0, parentExportId: null };
  }
  function validateRecord(session, record) {
    exactKeys(record, FIELDS);
    const expected = session.templates.get(record.record_id);
    if (!expected || CONTEXT.some((field) => !equal(record[field], expected[field]))) fail('Immutable review IDs/context changed');
    if (record.training_approved !== false || record.conversion_approved !== false) fail('QA cannot authorize training/conversion');
    if (!SCOPES.includes(record.annotation_scope) || !RELATIONS.includes(record.relationship) || typeof record.negative_verified !== 'boolean') fail('Invalid scope/relationship');
    if (record.record_type !== 'leakage_pair' && (record.relationship !== 'unresolved' || record.proposed_group_id !== null)) fail('Ancestry fields apply only to pair reviews');
    if (typeof record.reason !== 'string' || !Array.isArray(record.evidence) || record.evidence.some((item) => typeof item !== 'string')) fail('Invalid reason/evidence');
    if (record.decision === 'pending') {
      if (record.reviewer_id !== null || record.proposed_action !== null || record.reviewed_at !== null || record.reason || record.evidence.length || record.annotation_scope !== 'unresolved' || record.relationship !== 'unresolved' || record.proposed_group_id !== null || record.negative_verified) fail('Pending records cannot imply approval');
      return record;
    }
    if (!ACTIONS.includes(record.decision) || record.proposed_action !== record.decision) fail('Explicit matching decision/action required');
    if (typeof record.reviewer_id !== 'string' || !record.reviewer_id.trim() || !record.reason.trim() || !record.evidence.length || record.evidence.some((item) => !item.trim())) fail('Reviewer, reason and evidence are required');
    timestamp(record.reviewed_at);
    if (record.record_type === 'annotation' && record.decision === 'accept') {
      if (!['leaf', 'lesion', 'other'].includes(record.annotation_scope)) fail('Observed annotation scope required');
      if (!session.annotations.get(record.annotation_ids[0]).geometry_valid) fail('Invalid geometry must be revised/excluded');
    }
    if (record.record_type === 'leakage_pair' && record.decision === 'accept' && record.relationship === 'unresolved') fail('Explicit pair relationship required; similarity is not ancestry');
    if (record.proposed_group_id !== null && (typeof record.proposed_group_id !== 'string' || !record.proposed_group_id.trim() || record.record_type !== 'leakage_pair' || !['same_original', 'same_session'].includes(record.relationship))) fail('Group proposal requires explicit ancestry evidence; never auto-applied');
    if (record.negative_verified) {
      const sample = session.samples.get(record.image_ids[0]);
      if (record.record_type !== 'image' || record.decision !== 'accept' || (sample.classes.length && !equal(sample.classes, ['Healthy']))) fail('Negative verdict needs explicit eligible image-level review');
    }
    return record;
  }
  function saveDecision(session, recordId, fields, now = new Date().toISOString()) {
    const current = session.working.get(recordId);
    if (!current) fail('Unknown record');
    const writable = ['reviewer_id', 'decision', 'annotation_scope', 'reason', 'evidence', 'relationship', 'proposed_group_id', 'negative_verified'];
    if (Object.keys(fields).some((key) => !writable.includes(key))) fail('Cannot edit immutable/approval fields');
    if (!ACTIONS.includes(fields.decision)) fail('Choose an explicit human decision');
    const updated = Object.assign(clone(current), clone(fields), { proposed_action: fields.decision, reviewed_at: now });
    validateRecord(session, updated);
    if (current.reviewed_at && timestamp(updated.reviewed_at) < timestamp(current.reviewed_at)) fail('Review timestamp is older than the previous decision');
    session.working.set(recordId, updated); // EXACTLY one record, never its parent/children/pair endpoints.
    return clone(updated);
  }
  function changes(session) {
    return Array.from(session.working.values()).filter((row) => !equal(row, session.base.get(row.record_id))).map((row) => ({ record_id: row.record_id, before: clone(session.base.get(row.record_id)), after: clone(row) }));
  }
  function makeExport(session, exporterId, options = {}) {
    if (typeof exporterId !== 'string' || !exporterId.trim()) fail('Exporting reviewer identity required');
    const modified = changes(session);
    if (!modified.length) fail('No explicit decisions to export');
    modified.forEach((change) => validateRecord(session, change.after));
    const exportedAt = options.now || new Date().toISOString();
    if (modified.some((change) => timestamp(change.after.reviewed_at) > timestamp(exportedAt))) fail('Export time precedes a review');
    const exportId = options.exportId || globalThis.crypto.randomUUID();
    if (!UUID.test(exportId)) fail('Valid export UUID required');
    return { format: FORMAT, schema_version: 1, dashboard_id: session.payload.dashboard_id,
      catalog_sha256: session.payload.catalog_sha256, source_fingerprint: session.payload.source_fingerprint,
      export_id: exportId, revision: session.revision + 1, parent_export_id: session.parentExportId,
      exported_at: exportedAt, exporter_id: exporterId.trim(), changes: modified };
    // Export does not advance the base. Only explicit re-import of the saved file does.
  }
  function importExport(session, document) {
    exactKeys(document, HEADER);
    if (document.format !== FORMAT || document.schema_version !== 1 || document.dashboard_id !== session.payload.dashboard_id || document.catalog_sha256 !== session.payload.catalog_sha256 || document.source_fingerprint !== session.payload.source_fingerprint) fail('Export belongs to a different dashboard/catalog/source');
    if (!UUID.test(document.export_id) || !Number.isInteger(document.revision) || document.revision !== session.revision + 1 || document.parent_export_id !== session.parentExportId) fail('Conflicting revision/parent; import the exact chain in order');
    if (typeof document.exporter_id !== 'string' || !document.exporter_id.trim()) fail('Exporter identity required');
    const exportedAt = timestamp(document.exported_at);
    if (!Array.isArray(document.changes) || !document.changes.length || document.changes.length > session.templates.size) fail('Nonempty bounded changes required');
    const next = new Map(Array.from(session.base.entries()).map(([key, value]) => [key, clone(value)]));
    const seen = new Set();
    for (const change of document.changes) {
      exactKeys(change, ['record_id', 'before', 'after']);
      if (seen.has(change.record_id) || !next.has(change.record_id)) fail('Duplicate/unknown changed record');
      validateRecord(session, change.before); validateRecord(session, change.after);
      if (change.before.record_id !== change.record_id || change.after.record_id !== change.record_id || !equal(next.get(change.record_id), change.before)) fail('Conflicting/stale previous decision');
      if (change.after.decision === 'pending' || equal(change.before, change.after)) fail('Cannot erase review into pending or export a no-op');
      if (timestamp(change.after.reviewed_at) > exportedAt || (change.before.reviewed_at && timestamp(change.after.reviewed_at) < timestamp(change.before.reviewed_at))) fail('Invalid review/export chronology');
      seen.add(change.record_id); next.set(change.record_id, clone(change.after));
    }
    if (changes(session).length && Array.from(session.working.entries()).some(([key, value]) => !equal(value, next.get(key)))) fail('Imported file does not exactly match in-memory edits; no silent overwrite');
    session.base = next; session.working = new Map(Array.from(next.entries()).map(([key, value]) => [key, clone(value)]));
    session.revision = document.revision; session.parentExportId = document.export_id;
    return document.changes.length;
  }
  function recordContext(session, record) {
    const samples = record.image_ids.map((id) => session.samples.get(id));
    let classes = Array.from(new Set(samples.flatMap((sample) => sample.classes)));
    if (!classes.length) classes.push('EMPTY / NO SOURCE LABEL');
    const issues = new Set(samples.flatMap((sample) => sample.flags));
    if (record.record_type === 'annotation') {
      const annotation = session.annotations.get(record.annotation_ids[0]);
      classes = [annotation.class_name];
      annotation.issues.forEach((value) => issues.add(value));
      if (record.annotation_scope === 'unresolved') issues.add('scope_review_required');
    }
    if (record.record_type === 'leakage_pair') issues.add('cross_split_similarity_not_ancestry');
    return { samples, classes, issues: Array.from(issues), splits: Array.from(new Set(samples.map((sample) => sample.split))) };
  }
  function filteredRecords(session, filters = {}) {
    const pilot = new Set(session.payload.pilot.record_ids);
    return Array.from(session.working.values()).filter((record) => {
      if (filters.queue !== 'all' && !pilot.has(record.record_id)) return false;
      if (filters.type && filters.type !== 'all' && filters.type !== record.record_type) return false;
      if (filters.status === 'needs_work' && ['accept', 'exclude'].includes(record.decision)) return false;
      if (filters.status && !['all', 'needs_work'].includes(filters.status) && filters.status !== record.decision) return false;
      const context = recordContext(session, record);
      return (!filters.className || context.classes.includes(filters.className)) && (!filters.split || context.splits.includes(filters.split)) && (!filters.issue || context.issues.includes(filters.issue));
    });
  }
  function statistics(session, recordIds) {
    const selected = recordIds ? new Set(recordIds) : null;
    const result = { total: 0, touched: 0, resolved: 0, pending: 0, needs_work: 0, decisions: {}, by_class: {}, by_issue: {} };
    function tally(map, key, row) {
      if (!map[key]) map[key] = { total: 0, pending: 0, needs_work: 0, resolved: 0 };
      map[key].total++; map[key].pending += Number(row.decision === 'pending');
      map[key][['accept', 'exclude'].includes(row.decision) ? 'resolved' : 'needs_work']++;
    }
    for (const row of session.working.values()) {
      if (selected && !selected.has(row.record_id)) continue;
      result.total++; result.decisions[row.decision] = (result.decisions[row.decision] || 0) + 1;
      result.touched += Number(row.decision !== 'pending'); result.pending += Number(row.decision === 'pending');
      result[['accept', 'exclude'].includes(row.decision) ? 'resolved' : 'needs_work']++;
      const context = recordContext(session, row);
      context.classes.forEach((key) => tally(result.by_class, key, row));
      context.issues.forEach((key) => tally(result.by_issue, key, row));
    }
    return result;
  }
  function envelope(annotation) {
    if (!annotation.geometry_valid) return null;
    const c = annotation.coordinates;
    if (annotation.kind === 'bbox') return [c[0] - c[2] / 2, c[1] - c[3] / 2, c[0] + c[2] / 2, c[1] + c[3] / 2];
    return [Math.min(...c.filter((_, i) => i % 2 === 0)), Math.min(...c.filter((_, i) => i % 2 === 1)), Math.max(...c.filter((_, i) => i % 2 === 0)), Math.max(...c.filter((_, i) => i % 2 === 1))];
  }
  function sampleAssessment(session, imageId) {
    const sample = session.samples.get(imageId);
    const rows = Array.from(session.working.values()).filter((record) => record.image_ids.includes(imageId));
    const imageReview = rows.find((record) => record.record_type === 'image');
    const annotations = sample.annotation_ids.map((id) => {
      const annotation = session.annotations.get(id);
      const review = rows.find((record) => record.annotation_ids.includes(id));
      return { annotation_id: id, source_line: annotation.line_number, source_class: annotation.class_name,
        existing_format: annotation.kind, decision: review.decision, scope: review.annotation_scope,
        geometry_concerns: annotation.issues.slice(), envelope_inflation: annotation.envelope_inflation || null,
        proposed_method: annotation.kind === 'polygon' ? 'axis_aligned_extrema_REVIEW_ONLY' : 'retain_existing_bbox_REVIEW_ONLY' };
    });
    return { image_id: imageId, source_image_id: sample.source_image_id, annotations,
      negative_verified: imageReview.negative_verified,
      explicit_negative_review_required: imageReview.decision === 'accept' && !imageReview.negative_verified && (!sample.classes.length || equal(sample.classes, ['Healthy'])),
      remaining_record_ids: rows.filter((row) => !['accept', 'exclude'].includes(row.decision)).map((row) => row.record_id),
      duplicate_object_concerns: clone(sample.possible_duplicate_objects),
      mapping_and_license_status: 'NOT_APPROVED', conversion_authorized: false, training_authorized: false,
      note: 'Read-only proposals and QA declarations, not converted labels. Scope consistency is also checked by the Python export assessment.' };
  }
  return { FORMAT, CONTEXT, canonical, equal, createSession, validateRecord, saveDecision, changes, makeExport, importExport,
    recordContext, filteredRecords, statistics, envelope, sampleAssessment };
});
