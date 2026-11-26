(function () {
  'use strict';
  const C = window.AgriGuardReview;
  const W = window.AgriGuardWorkspace;
  const payload = JSON.parse(document.getElementById('qa-payload').textContent);
  const session = C.createSession(payload);
  const index = W.searchIndex(session);
  const $ = (id) => document.getElementById(id);
  let visible = [];
  let activeId = null;
  let queuePage = 0;
  let formDirty = false;
  let memoryEdits = 0;
  let lastExport = null;
  let appliedFilters = null;
  let viewerLayouts = [];
  let viewerObservers = [];
  const annotationsByImage = new Map(payload.catalog.samples.map((sample) => [sample.image_id, []]));
  payload.catalog.annotations.forEach((row) => annotationsByImage.get(row.image_id).push(row));
  const imageRecordIds = new Map(payload.records.filter((row) => row.record_type === 'image').map((row) => [row.image_ids[0], row.record_id]));
  const annotationRecordIds = new Map(payload.records.filter((row) => row.record_type === 'annotation').map((row) => [row.annotation_ids[0], row.record_id]));
  const format = (value) => JSON.stringify(value, null, 2);
  const filterIds = ['queue', 'type', 'class-filter', 'split', 'issue', 'status', 'search-query'];
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : 'success'; }
  function option(value, text) { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; }
  function abandonForm() { return !formDirty || window.confirm('Perubahan formulir ini belum disimpan ke memori. Abaikan perubahan formulir?'); }
  function filters() { return { queue: $('queue').value, type: $('type').value, className: $('class-filter').value, split: $('split').value, issue: $('issue').value, status: $('status').value }; }
  function metadataList(target, entries) {
    target.replaceChildren();
    entries.forEach(([label, value, wide]) => {
      const group = document.createElement('div'); if (wide) group.className = 'wide';
      const name = document.createElement('dt'); name.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = String(value); detail.title = String(value);
      if (wide) detail.className = 'clip'; group.append(name, detail); target.appendChild(group);
    });
  }
  function table(title, values) {
    const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = title; section.appendChild(heading);
    const grid = document.createElement('table'); const header = document.createElement('tr');
    ['Kategori', 'Total', 'Pending', 'Tindak lanjut', 'Resolved QA'].forEach((text) => { const th = document.createElement('th'); th.textContent = text; header.appendChild(th); }); grid.appendChild(header);
    Object.keys(values).sort().forEach((key) => { const tr = document.createElement('tr'); [key, values[key].total, values[key].pending, values[key].needs_work, values[key].resolved].forEach((text) => { const td = document.createElement('td'); td.textContent = String(text); tr.appendChild(td); }); grid.appendChild(tr); });
    section.appendChild(grid); return section;
  }
  function renderMemoryWarning() {
    const text = formDirty ? 'Formulir belum disimpan. Navigasi akan meminta konfirmasi; ekspor tidak melakukan auto-save formulir.' : memoryEdits
      ? `${memoryEdits} record berubah di memori. ${lastExport ? 'Unduhan diminta; pastikan file tersimpan dan impor ulang untuk melanjutkan versi.' : 'Ekspor secara eksplisit sebelum menutup halaman.'}`
      : 'Belum ada perubahan sesi. Tidak ada auto-save ke disk. ACCEPT adalah observasi QA, bukan izin konversi/training.';
    $('memory-state').textContent = text; $('memory-state').className = 'memory-state' + (formDirty || memoryEdits ? ' dirty' : '');
  }
  function renderProgress() {
    const pilot = C.statistics(session, payload.pilot.record_ids); const full = C.statistics(session);
    $('progress').textContent = `Pilot ${pilot.resolved}/${pilot.total} resolved QA · ${pilot.pending} pending | Sumber ${full.resolved}/${full.total} resolved QA`;
    $('progress-bar').max = Math.max(1, pilot.total); $('progress-bar').value = pilot.resolved;
    $('progress-breakdown').replaceChildren(table('Pilot menurut kelas', pilot.by_class), table('Pilot menurut issue', pilot.by_issue));
    memoryEdits = C.changes(session).length; $('export').disabled = memoryEdits === 0;
    $('export').textContent = `Ekspor v${session.revision + 1} · ${memoryEdits} perubahan`;
    $('version').textContent = `Base v${session.revision} · ${memoryEdits} edit memori`;
    $('integrity-metadata').textContent = format({ loaded_revision: session.revision, parent_export_id: session.parentExportId,
      last_download_requested: lastExport ? { revision: lastExport.revision, export_id: lastExport.export_id } : null,
      source_fingerprint: payload.source_fingerprint, catalog_sha256: payload.catalog_sha256, dashboard_id: payload.dashboard_id,
      note: 'Unduhan tidak memajukan base otomatis. Impor kembali file yang benar-benar tersimpan. UNRESOLVED/REVISE tetap membutuhkan tindakan.' });
    renderMemoryWarning();
  }
  function navigate(id) {
    if (!id) return;
    if (!abandonForm()) { renderQueue(); return; }
    activeId = id; formDirty = false; queuePage = W.pageFor(visible, id, Number($('page-size').value));
    $('zoom').value = '1'; renderQueue(); renderRecord(); renderMemoryWarning();
  }
  function refreshFilters(nearIndex = 0) {
    appliedFilters = Object.fromEntries(filterIds.map((key) => [key, $(key).value]));
    visible = W.search(C.filteredRecords(session, filters()), $('search-query').value, index);
    if (!visible.some((row) => row.record_id === activeId)) activeId = visible.length ? visible[Math.max(0, Math.min(nearIndex, visible.length - 1))].record_id : null;
    queuePage = W.pageFor(visible, activeId, Number($('page-size').value));
    formDirty = false; renderQueue(); renderRecord(); renderProgress();
  }
  function applyFilterChange() {
    if (abandonForm()) refreshFilters();
    else if (appliedFilters) filterIds.forEach((key) => { $(key).value = appliedFilters[key]; });
  }
  function renderQueue() {
    const position = visible.findIndex((row) => row.record_id === activeId);
    const page = W.paginate(visible, queuePage, Number($('page-size').value)); queuePage = page.page;
    $('queue-total').textContent = `${visible.length} record`;
    $('position').textContent = visible.length ? `Record ${position + 1} dari ${visible.length} hasil filter` : 'Tidak ada record sesuai filter.';
    $('page-position').textContent = `${page.page + 1}/${page.totalPages} · ${page.start}–${page.end}`;
    $('page-previous').disabled = page.page === 0; $('page-next').disabled = page.page + 1 >= page.totalPages;
    ['previous', 'previous-center'].forEach((id) => { $(id).disabled = position <= 0; });
    ['next', 'next-center'].forEach((id) => { $(id).disabled = position < 0 || position >= visible.length - 1; });
    const current = session.working.get(activeId);
    $('current-record-indicator').textContent = current ? `Aktif: ${W.describe(session, current).type} · ${current.record_id.slice(0, 12)}` : 'Belum ada record aktif';
    const keepFocus = $('record-list').contains(document.activeElement);
    $('record-list').replaceChildren();
    page.rows.forEach((row) => {
      const view = W.describe(session, row); const item = document.createElement('li'); const button = document.createElement('button');
      button.type = 'button'; button.className = 'queue-item'; button.dataset.recordId = row.record_id;
      if (row.record_id === activeId) button.setAttribute('aria-current', 'true');
      button.setAttribute('aria-label', `${view.status.label}, ${view.type}, ${view.classes.join(', ')}, ${row.record_id}`);
      button.title = `${view.source}\n${row.record_id}`;
      const top = document.createElement('span'); top.className = 'queue-row-top';
      const type = document.createElement('span'); type.className = 'queue-type'; type.textContent = view.type;
      const badge = document.createElement('span'); badge.className = `status-badge ${view.status.tone}`; badge.textContent = view.status.label;
      top.append(type, badge);
      const label = document.createElement('span'); label.className = 'queue-class'; label.textContent = view.classes.join(', ');
      const source = document.createElement('span'); source.className = 'queue-source'; source.textContent = view.source;
      const reference = document.createElement('span'); reference.className = 'queue-reference'; reference.textContent = `${view.split} · ${view.reference.slice(0, 16)}`;
      button.append(top, label, source, reference); button.onclick = () => navigate(row.record_id); item.appendChild(button); $('record-list').appendChild(item);
    });
    if (keepFocus) { const currentButton = $('record-list').querySelector('[aria-current="true"]'); if (currentButton) currentButton.focus({ preventScroll: true }); }
  }
  function svgNode(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes).forEach((key) => node.setAttribute(key, String(attributes[key]))); return node;
  }
  function overlay(sample, record) {
    const svg = svgNode('svg', { viewBox: `0 0 ${sample.width} ${sample.height}`, preserveAspectRatio: 'xMidYMid meet' });
    if (sample.flags.includes('orientation_scope_unverified')) return svg;
    for (const annotation of annotationsByImage.get(sample.image_id)) {
      const bounds = C.envelope(annotation); if (!bounds) continue;
      const selected = record.annotation_ids.includes(annotation.annotation_id); const width = selected ? 2.5 : 1.2;
      const rect = (color, dashed) => {
        const node = svgNode('rect', { x: bounds[0] * sample.width, y: bounds[1] * sample.height,
          width: (bounds[2] - bounds[0]) * sample.width, height: (bounds[3] - bounds[1]) * sample.height,
          fill: 'none', stroke: color, 'stroke-width': width });
        if (dashed) node.setAttribute('stroke-dasharray', '5 3'); return node;
      };
      const title = () => { const node = svgNode('title', {}); node.textContent = `L${annotation.line_number} c${annotation.class_id} ${annotation.class_name} | ${annotation.annotation_id}`; return node; };
      if (annotation.kind === 'bbox' && $('show-bbox').checked) { const node = rect('#2563eb', false); node.appendChild(title()); svg.appendChild(node); }
      if (annotation.kind === 'polygon' && $('show-polygon').checked) {
        const points = annotation.coordinates.reduce((list, value, i, coords) => { if (i % 2 === 0) list.push(`${value * sample.width},${coords[i + 1] * sample.height}`); return list; }, []);
        const node = svgNode('polygon', { points: points.join(' '), fill: '#15803d', 'fill-opacity': '.06', stroke: '#15803d', 'stroke-width': width }); node.appendChild(title()); svg.appendChild(node);
      }
      if (annotation.kind === 'polygon' && $('show-proposal').checked) { const node = rect('#ea580c', true); node.appendChild(title()); svg.appendChild(node); }
      if (selected) { const label = svgNode('text', { x: Math.max(0, bounds[0] * sample.width), y: Math.max(10, bounds[1] * sample.height + 10), fill: '#111', stroke: 'white', 'stroke-width': '.5', 'paint-order': 'stroke', 'font-size': '10' }); label.textContent = `L${annotation.line_number}/c${annotation.class_id}`; svg.appendChild(label); }
    }
    return svg;
  }
  function layoutViewers() {
    $('zoom-label').textContent = `Fit ×${Number($('zoom').value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
    viewerLayouts.forEach((layout) => layout());
  }
  function renderViewer(record) {
    viewerObservers.forEach((observer) => observer.disconnect()); viewerObservers = []; viewerLayouts = [];
    $('viewer').replaceChildren(); $('annotation-list').replaceChildren();
    if (!record) { $('annotation-summary').textContent = 'Anotasi sumber'; return; }
    let annotationCount = 0;
    record.image_ids.forEach((id) => {
      const sample = session.samples.get(id);
      if (!/^source-images\/[a-f0-9]{24}\.(?:jpg|jpeg|png)$/.test(sample.source_copy_path)) throw new Error('Invalid canonical asset path');
      const card = document.createElement('div'); card.className = 'viewer-card';
      const caption = document.createElement('p'); caption.className = 'image-caption'; caption.textContent = `${sample.source_image_id} · ${sample.split} · ${sample.width}×${sample.height}`;
      const port = document.createElement('div'); port.className = 'zoomport'; port.tabIndex = 0; port.setAttribute('role', 'region'); port.setAttribute('aria-label', `Viewer ${sample.source_image_id}; gunakan scroll saat zoom`);
      const stage = document.createElement('div'); stage.className = 'canvas-stage'; const scene = document.createElement('div'); scene.className = 'scene';
      const image = document.createElement('img'); image.alt = 'Original source pixels'; image.src = `qa/${sample.source_copy_path}`;
      const shapes = overlay(sample, record); let naturalWidth = sample.width; let naturalHeight = sample.height;
      const layout = () => {
        if (!port.isConnected) return;
        const fitted = W.fitImage(naturalWidth, naturalHeight, Math.max(1, port.clientWidth), Math.max(1, port.clientHeight), Number($('zoom').value));
        scene.style.width = `${fitted.width}px`; stage.style.width = `${fitted.stageWidth}px`; stage.style.height = `${fitted.stageHeight}px`;
      };
      image.onload = () => {
        if (!port.isConnected) return;
        if (image.naturalWidth !== sample.width || image.naturalHeight !== sample.height) {
          shapes.remove(); naturalWidth = image.naturalWidth || sample.width; naturalHeight = image.naturalHeight || sample.height;
          message('Dimensi asli tidak cocok. Overlay disembunyikan; validasi paket sebelum review.', true);
        }
        layout();
      };
      image.onerror = () => { if (port.isConnected) { shapes.remove(); message('Gambar gagal dimuat; tidak ada verdict otomatis.', true); } };
      scene.append(image, shapes); stage.appendChild(scene); port.appendChild(stage); card.append(caption, port);
      const links = document.createElement('div'); links.className = 'image-links';
      const reviewImage = document.createElement('button'); reviewImage.type = 'button'; reviewImage.textContent = 'Record gambar'; reviewImage.onclick = () => showAnyRecord(imageRecordIds.get(id));
      const sourceLink = document.createElement('a'); sourceLink.href = `qa/samples/${id}.html`; sourceLink.target = '_blank'; sourceLink.rel = 'noopener'; sourceLink.textContent = 'Detail QA asal';
      links.append(reviewImage, sourceLink); card.appendChild(links); $('viewer').appendChild(card); viewerLayouts.push(layout);
      if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(layout); observer.observe(port); viewerObservers.push(observer); }
      for (const annotation of annotationsByImage.get(id)) {
        annotationCount++;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'annot-button' + (record.annotation_ids.includes(annotation.annotation_id) ? ' current' : '');
        button.textContent = `L${annotation.line_number} · c${annotation.class_id} ${annotation.class_name} · ${annotation.kind}`;
        button.onclick = () => showAnyRecord(annotationRecordIds.get(annotation.annotation_id)); $('annotation-list').appendChild(button);
      }
    });
    $('annotation-summary').textContent = `${annotationCount} anotasi sumber · klik untuk review individual`;
    requestAnimationFrame(layoutViewers);
  }
  function showAnyRecord(id) {
    if (!abandonForm()) return;
    $('queue').value = 'all'; $('type').value = 'all'; $('status').value = 'all';
    ['class-filter', 'split', 'issue', 'search-query'].forEach((key) => { $(key).value = ''; });
    activeId = id; $('zoom').value = '1'; refreshFilters();
  }
  function renderRecord() {
    const record = session.working.get(activeId); $('review-form').hidden = !record;
    if (!record) {
      $('record-title').textContent = 'Tidak ada record'; $('viewer-subtitle').textContent = 'Ubah filter atau pencarian untuk menampilkan antrean.';
      $('record-status').textContent = 'TIDAK ADA PILIHAN'; $('record-status').className = 'status-badge pending';
      $('metadata').textContent = ''; $('record-summary').replaceChildren(); $('qa-issues').replaceChildren(); renderViewer(null); return;
    }
    const context = C.recordContext(session, record); const view = W.describe(session, record);
    $('record-title').textContent = view.title;
    $('viewer-subtitle').textContent = `${view.type} · ${view.format} · ${view.split} · ${view.resolution}`;
    $('record-status').className = `status-badge ${view.status.tone}`; $('record-status').textContent = view.status.label;
    metadataList($('record-summary'), [['Jenis', view.type], ['Status', view.status.label], ['Kelas sumber', view.classes.join(', '), true], ['Format', view.format], ['Split', view.split], ['Resolusi', view.resolution], ['Referensi', view.reference.slice(0, 16)]]);
    $('qa-issues').replaceChildren();
    (view.issues.length ? view.issues : ['Tidak ada flag otomatis; review visual tetap diperlukan']).forEach((issue) => { const chip = document.createElement('span'); chip.className = 'issue-chip'; chip.textContent = issue; $('qa-issues').appendChild(chip); });
    const detail = record.record_type === 'annotation' ? session.annotations.get(record.annotation_ids[0]) : record.record_type === 'leakage_pair' ? session.pairs.get(record.pair_id) : context.samples[0];
    $('metadata').textContent = format({ record_id: record.record_id, source_fingerprint: record.source_fingerprint, classes: context.classes, issues: context.issues, metadata: detail });
    $('existing-review').textContent = record.decision === 'pending' ? 'Belum ada keputusan untuk record ini.' : `${record.decision.toUpperCase()} · ${record.reviewer_id} · ${record.reviewed_at}`;
    $('decision').value = record.decision === 'pending' ? '' : record.decision; $('scope').value = record.annotation_scope;
    $('reason').value = record.reason; $('evidence').value = record.evidence.join('\n');
    $('relationship').value = record.relationship; $('group-id').value = record.proposed_group_id || ''; $('negative').checked = record.negative_verified;
    $('pair-fields').hidden = record.record_type !== 'leakage_pair'; $('negative-label').hidden = record.record_type !== 'image';
    $('negative').disabled = record.record_type !== 'image' || (context.samples[0].classes.length > 0 && !C.equal(context.samples[0].classes, ['Healthy']));
    renderViewer(record); $('assessment').textContent = format(record.image_ids.map((id) => C.sampleAssessment(session, id))); formDirty = false;
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  $('review-form').addEventListener('input', () => { formDirty = true; renderMemoryWarning(); });
  $('review-form').onsubmit = (event) => {
    event.preventDefault();
    try {
      const record = session.working.get(activeId); const savedId = activeId; const position = visible.findIndex((row) => row.record_id === activeId);
      C.saveDecision(session, activeId, { reviewer_id: $('reviewer').value.trim(), decision: $('decision').value,
        annotation_scope: $('scope').value, reason: $('reason').value.trim(), evidence: $('evidence').value.split('\n').map((line) => line.trim()).filter(Boolean),
        relationship: record.record_type === 'leakage_pair' ? $('relationship').value : 'unresolved',
        proposed_group_id: record.record_type === 'leakage_pair' ? $('group-id').value.trim() || null : null,
        negative_verified: record.record_type === 'image' && $('negative').checked });
      formDirty = false; lastExport = null; refreshFilters(position);
      message(`Hanya record ${savedId} disimpan di memori. Record terkait tidak diubah. Ekspor file untuk menyimpan di disk.`);
    } catch (error) { message(error.message, true); }
  };
  $('add-reference').onclick = () => {
    const record = session.working.get(activeId);
    const reference = record.record_type === 'leakage_pair' ? `qa/leakage_queue.csv#${record.pair_id}` : `qa/samples/${record.image_ids[0]}.html${record.annotation_ids.length ? '#' + record.annotation_ids[0] : ''}`;
    const values = new Set($('evidence').value.split('\n').filter(Boolean)); values.add(reference); $('evidence').value = Array.from(values).join('\n'); formDirty = true; renderMemoryWarning();
  };
  $('export').onclick = () => {
    try {
      if (formDirty) throw new Error('Simpan atau abaikan perubahan formulir terlebih dahulu; ekspor tidak melakukan auto-save.');
      const value = C.makeExport(session, $('reviewer').value); download(value, `agriguard-review-v${value.revision}-${value.export_id}.json`);
      lastExport = value; renderProgress(); message('Unduhan diminta. Pastikan file tersimpan; base/version tidak dimajukan otomatis. Impor kembali file tersimpan untuk lanjut versi berikutnya.');
    } catch (error) { message(error.message, true); }
  };
  $('import').onchange = async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (formDirty) throw new Error('Simpan atau abaikan perubahan formulir dahulu. File impor harus cocok persis dengan edit memori bila ada; tidak ada overwrite otomatis.');
      if (file.size > 25 * 1024 * 1024) throw new Error('File ekspor terlalu besar.');
      const value = JSON.parse(await file.text()); const count = C.importExport(session, value); lastExport = null;
      refreshFilters(); message(`${count} keputusan eksplisit diimpor sebagai base v${session.revision}. Source/artifact integrity tetap wajib diverifikasi dengan CLI Python.`);
    } catch (error) { message(error.message, true); }
    event.target.value = '';
  };
  $('assessment-export').onclick = () => {
    const ids = new Set(Array.from(session.working.values()).filter((row) => row.record_type !== 'leakage_pair' && row.decision !== 'pending').flatMap((row) => row.image_ids));
    download({ format: 'agriguard-readonly-review-assessment', schema_version: 1, source_fingerprint: payload.source_fingerprint,
      catalog_sha256: payload.catalog_sha256, loaded_revision: session.revision, has_unexported_delta: C.changes(session).length > 0,
      pilot_progress: C.statistics(session, payload.pilot.record_ids), full_progress: C.statistics(session),
      reviewed_samples: Array.from(ids).map((id) => C.sampleAssessment(session, id)), conversion_authorized: false,
      training_authorized: false, groups_applied: false, note: 'Read-only session summary, NOT a decision-import file or converted dataset. Python validator checks source integrity and global scope consistency.' }, `agriguard-readonly-assessment-${Date.now()}.json`);
    message('Ringkasan read-only diunduh; ini bukan file keputusan atau dataset training.');
  };
  ['queue', 'type', 'class-filter', 'split', 'issue', 'status'].forEach((id) => { $(id).onchange = applyFilterChange; });
  $('search-form').onsubmit = (event) => { event.preventDefault(); applyFilterChange(); };
  $('clear-search').onclick = () => { if (abandonForm()) { $('search-query').value = ''; refreshFilters(); } };
  $('page-size').onchange = () => { queuePage = W.pageFor(visible, activeId, Number($('page-size').value)); renderQueue(); };
  function changePage(delta) {
    if (!abandonForm()) return;
    const page = W.paginate(visible, queuePage + delta, Number($('page-size').value));
    queuePage = page.page; if (page.rows.length) activeId = page.rows[0].record_id; formDirty = false;
    $('zoom').value = '1'; renderQueue(); renderRecord(); renderMemoryWarning();
  }
  $('page-previous').onclick = () => changePage(-1); $('page-next').onclick = () => changePage(1);
  function moveRecord(delta) { const i = visible.findIndex((row) => row.record_id === activeId); if (i >= 0 && i + delta >= 0 && i + delta < visible.length) navigate(visible[i + delta].record_id); }
  ['previous', 'previous-center'].forEach((id) => { $(id).onclick = () => moveRecord(-1); });
  ['next', 'next-center'].forEach((id) => { $(id).onclick = () => moveRecord(1); });
  $('zoom').oninput = layoutViewers;
  ['show-bbox', 'show-polygon', 'show-proposal'].forEach((id) => { $(id).onchange = () => renderViewer(session.working.get(activeId)); });
  $('zoom-reset').onclick = () => { $('zoom').value = '1'; layoutViewers(); };
  window.addEventListener('resize', layoutViewers);
  window.addEventListener('keydown', (event) => { const direction = W.keyboardDirection(event, $('keyboard-navigation').checked); if (direction) { event.preventDefault(); moveRecord(direction); } });
  window.addEventListener('beforeunload', (event) => { if (formDirty || C.changes(session).length) { event.preventDefault(); event.returnValue = ''; } });
  payload.catalog.source_classes.forEach((name) => $('class-filter').appendChild(option(name, name)));
  $('class-filter').appendChild(option('EMPTY / NO SOURCE LABEL', 'EMPTY / NO SOURCE LABEL'));
  Array.from(new Set(payload.catalog.samples.map((row) => row.split))).sort().forEach((name) => $('split').appendChild(option(name, name)));
  const allIssues = new Set(payload.records.flatMap((record) => C.recordContext(session, record).issues));
  Array.from(allIssues).sort().forEach((name) => $('issue').appendChild(option(name, W.issue(name))));
  metadataList($('pilot-info'), [['Gambar', payload.pilot.summary.base_representative_images], ['Anotasi', payload.pilot.summary.annotation_records], ['Pasangan', payload.pilot.summary.pair_records], ['Total record', payload.pilot.summary.total_records], ['Status sampling', 'Pilot terfokus, bukan sampel statistik', true]]);
  $('pilot-technical').textContent = format(payload.pilot.summary);
  $('queue').options[1].textContent = `Seluruh ${payload.records.length} record / sumber`;
  refreshFilters();
})();
