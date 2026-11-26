(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.AgriGuardWorkspace = factory(root.AgriGuardReview);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const TYPE = { image: 'Gambar', annotation: 'Anotasi', leakage_pair: 'Pasangan kemiripan' };
  const FORMAT = { bbox: 'Bounding box', polygon: 'Polygon', mixed: 'Campuran bbox + polygon', empty: 'Label kosong — belum negatif' };
  const STATES = {
    pending: { label: 'BELUM DIREVIEW', tone: 'pending' },
    accept: { label: 'ACCEPT · QA', tone: 'accepted' },
    revise: { label: 'REVISE · perlu tindakan', tone: 'revision' },
    exclude: { label: 'EXCLUDE · rekomendasi', tone: 'excluded' },
    unresolved: { label: 'UNRESOLVED', tone: 'unresolved' },
  };
  const ISSUES = {
    mixed_annotations: 'Anotasi campuran', unsupported_diagnosis: 'Diagnosis di luar taxonomy',
    empty_labels_not_verified_negative: 'Label kosong belum diverifikasi negatif',
    healthy_not_disease_or_verified_negative: 'Healthy bukan approval negatif',
    large_envelope_inflation_review_hint: 'Inflasi envelope tinggi',
    scope_review_required: 'Scope lesi/daun belum diputuskan',
    cross_split_similarity_not_ancestry: 'Kemiripan lintas split, bukan bukti ancestry',
    aug_filename_lineage_unverified: 'Parentage aug_ belum diverifikasi',
    possible_duplicate_object: 'Kemungkinan objek ganda',
    invalid_geometry: 'Geometri perlu perbaikan', orientation_scope_unverified: 'Orientasi belum diverifikasi',
  };
  function status(value) { return STATES[value] || { label: String(value), tone: 'unresolved' }; }
  function issue(value) { return ISSUES[value] || String(value).replaceAll('_', ' '); }
  function describe(session, record) {
    const context = C.recordContext(session, record);
    const annotation = record.record_type === 'annotation' ? session.annotations.get(record.annotation_ids[0]) : null;
    const formats = annotation ? [annotation.kind] : Array.from(new Set(context.samples.map((row) => row.format)));
    return { type: TYPE[record.record_type], classes: context.classes,
      format: formats.map((value) => FORMAT[value] || value).join(' / '),
      split: context.splits.join(' / '),
      resolution: Array.from(new Set(context.samples.map((row) => `${row.width} × ${row.height}`))).join(' / '),
      status: status(record.decision), issues: context.issues.map(issue),
      source: context.samples.map((row) => row.source_image_id).join(' ↔ '),
      title: annotation ? `${annotation.class_name} · L${annotation.line_number}` : record.record_type === 'leakage_pair' ? 'Bandingkan dua sumber' : context.samples[0].source_image_id,
      reference: annotation ? `L${annotation.line_number}` : record.record_type === 'leakage_pair' ? record.pair_id : record.image_ids[0] };
  }
  function searchIndex(session) {
    return new Map(Array.from(session.working.values()).map((record) => {
      const view = describe(session, record);
      return [record.record_id, [record.record_id, record.record_type, view.type, view.classes.join(' '), view.source, view.reference,
        ...record.image_ids, ...record.annotation_ids].join(' ').toLocaleLowerCase()];
    }));
  }
  function search(records, query, index) {
    const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? records.filter((row) => terms.every((term) => (index.get(row.record_id) || '').includes(term))) : records;
  }
  function pageFor(records, recordId, pageSize) {
    if (![20, 50, 100].includes(pageSize)) throw new Error('Unsupported page size');
    const index = records.findIndex((row) => row.record_id === recordId);
    return index < 0 ? 0 : Math.floor(index / pageSize);
  }
  function paginate(records, requestedPage, pageSize) {
    if (![20, 50, 100].includes(pageSize) || !Number.isInteger(requestedPage)) throw new Error('Invalid pagination');
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const page = Math.max(0, Math.min(requestedPage, totalPages - 1));
    const start = page * pageSize;
    return { page, totalPages, total: records.length, start: records.length ? start + 1 : 0,
      end: Math.min(start + pageSize, records.length), rows: records.slice(start, start + pageSize) };
  }
  function fitImage(width, height, portWidth, portHeight, zoom = 1) {
    if (![width, height, portWidth, portHeight, zoom].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Positive finite image/viewport dimensions required');
    const scale = Math.min(portWidth / width, portHeight / height) * zoom;
    return { width: width * scale, height: height * scale,
      stageWidth: Math.max(portWidth, width * scale), stageHeight: Math.max(portHeight, height * scale) };
  }
  function keyboardDirection(event, enabled) {
    if (!enabled || event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return 0;
    const target = event.target;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        (typeof target.closest === 'function' && target.closest('[contenteditable="true"], [role="textbox"]')))) return 0;
    return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  }
  return { status, issue, describe, searchIndex, search, pageFor, paginate, fitImage, keyboardDirection };
});
