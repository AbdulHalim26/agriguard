# PHASE 2.0A — Spesifikasi lokalisasi gejala/kerusakan tanaman

Tanggal: **16 November 2026**. Status: **PROPOSED** untuk pengembangan v2;
fondasi detector diberi label **EXISTING**, performa model nyata **UNVERIFIED**.

## 1. Pertanyaan produk dan ruang lingkup

“Bagian tanaman mana yang **diduga** mengalami kerusakan?” membutuhkan keluaran
spasial. Classification membantu triage citra tetapi tidak menunjuk lokasi objek.
Lokalisasi tetap image-level evidence, bukan pengukuran luas rusak suatu bidang.

Ontologi yang dipisahkan: rice disease symptom, pest-related damage,
flood-related damage, other environmental damage, dan field damage assessment.
Classifier severity, symptom detection, verifikasi PPL, annotation ACCEPT dan
keputusan klaim adalah proses dengan otoritas berbeda.

## 2. Kontrak existing yang dipertahankan

Source: `ai-service/detection/{contracts,adapter,severity}.py`, `taxonomy.json`,
`lib/detection.ts`, `lib/detection-server.ts`, `components/features/DetectionOverlay.tsx`.

| Field/perilaku | EXISTING |
|---|---|
| Model | `model_family: yolo26n/yolo26s`, version, SHA model dan dataset manifest. |
| Citra | SHA bytes compressed upload, EXIF-oriented `image_width/image_height`. Bukan ukuran sensor kamera sebelum kompresi. |
| Objek | Canonical class ID/name, `annotation_level: lesion/leaf`, confidence 0–1, `bbox_xyxy`. |
| Koordinat | Continuous pixel edges, top-left origin: `0 ≤ x1 < x2 ≤ width`, `0 ≤ y1 < y2 ≤ height`. Inverse letterbox sebelum response. |
| Task/head | FP32 static batch1; `end2end_xyxy` one-to-one tanpa NMS kedua, atau `raw_cxcywh_bcn` dengan class-aware NMS. Unsupported task/layout fail-closed. |
| Status | `SUCCESS/NO_DETECTIONS`, non-2xx `UNAVAILABLE/ERROR`; seluruhnya `severity_status: REVIEW_REQUIRED`. |
| Legacy fields | `status`, `confidence`, `damage_pct` di level detector **null**. Tidak memalsukan severity agar lolos receipt classifier. |
| Provenance | Preprocessing/output/postprocessing, thresholds, image/model/dataset hashes, inference duration; `persistence: preview_only`. |
| UI | Gated overlay loading/error/unavailable/no detection, dimensi cocok, object-contain; browser nyata belum diverifikasi ulang. |
| Aktivasi | `AGRIGUARD_YOLO_ENABLED` OFF di proxy dan AI service secara default; tidak diubah fase ini. |

Canonical taxonomy existing tetap:
`0 leaf_blast`, `1 bacterial_leaf_blight`, `2 brown_spot`, `3 sheath_blight`,
`4 tungro_symptom`, `5 leaf_folder_damage`. Ini taxonomy gejala/cedera, **bukan
taxonomy kerusakan banjir yang telah divalidasi**. Tungro visual bukan diagnosis
laboratorium. Tidak menambahkan flood class atau merelabel disease sekarang.

`NO_DETECTIONS` hanya sesudah model kompatibel benar-benar berjalan; bukan
fallback error, sehat, atau tidak ada kerusakan. Confidence detektor bukan severity.

## 3. Data dan ground truth

**EXISTING** rice-v1 merupakan mixed bbox/polygon. Sumber asli 1.107 gambar,
9 kelas sumber, 1.117 bbox dan 2.620 polygon menurut inspeksi fase sebelumnya;
13 empty labels tidak membuktikan negatif. Pilot internal 543 record, keseluruhan
5.829 pending pada paket awal. Tidak ada approval baru pada fase ini.

- Source/canonical IDs tidak sama; preserve source label/line, hashes dan geometry.
- Scope lesion versus whole leaf harus direview per anotasi; jangan menggabungkan
  target yang berbeda di bawah kelas yang sama.
- Polygon yang tersedia tidak otomatis merupakan mask lesion yang valid; dapat
  menggambarkan daun penuh atau geometri bermasalah.
- Envelope polygon adalah proposal QA. Seluruh label conversion/derived writer
  perlu approval dan ledger tersendiri; tidak ada full conversion di fase ini.
- `leaf_folder_damage` belum memiliki dukungan label unambiguous. Healthy bukan
  disease class; negatif perlu explicit image-level review.
- 985 kandidat dHash lintas split/17 similarity buckets bukan verified training
  groups. Global acquisition/session/parentage grouping dan split baru diperlukan.
- Lisensi/diagnosis/provenance/scope/negative/data adequacy tetap gates terpisah dari
  annotation ACCEPT; review dashboard bukan alat klaim petani/PPL.

Dataset localization flood-related kelak memerlukan protocol baru: misalnya bagian
tanaman rebah/terendam/nekrosis yang bisa diamati, timestamp/parcel/event context,
dan adjudication ahli. Keberadaan air atau penyakit tidak boleh menjadi label
sebab banjir otomatis. Ground truth causality sering memerlukan bukti lain.

## 4. Deteksi versus segmentasi

| Kebutuhan | Deteksi bbox | Segmentasi |
|---|---|---|
| Menunjuk area gejala untuk petugas | Memadai untuk highlight kasar, mudah ditinjau. | Boundary lebih rinci tetapi tidak selalu diperlukan untuk triage. |
| Lesi irregular dan proporsi jaringan terlihat | Envelope menyertakan background; tidak dapat mengukur tissue area. | Dapat mendefinisikan rasio mask bila damage dan denominator plant/leaf masks valid. |
| Ground truth | Reviewed box dengan satu scope/class. | Reviewed per-pixel/polygon mask, occlusion policy, boundary dan instance/semantic policy. |
| Data sekarang | Mixed scope belum approved; converter tetap gate. | Polygon belum dipastikan lesion/leaf/topology/completeness; bukan siap training. |
| Runtime | Existing ONNX adapter/proxy; head compatibility sudah diuji synthetic. | Mask prototypes/coefficients atau semantic logits, decode/resize/topology dan kontrak baru; biaya CPU/RSS perlu diukur. |
| Kompleksitas | Integrasi lebih rendah; box IoU/mAP dan miss review. | Annotation cost, inter-rater disagreement, Dice/IoU/boundary, masked rendering/export baru. |

**Keputusan PROPOSED**: lanjutkan detection foundation sebagai baseline lokalisasi,
tanpa aktivasi produksi. Segmentasi menjadi eksperimen bersyarat bila reviewer
membutuhkan boundary/tissue proportion dan tersedia mask yang sah. Jangan mengubah
adapter `detect` untuk menerima tensor mask dengan menebak shape.

## 5. Definisi proporsi citra dan larangan field extrapolation

Existing geometric diagnostic:

- `lesion_image_box_coverage_ratio = area(union lesion envelopes)/(width×height)`.
- `lesion_leaf_box_coverage_ratio` memakai intersection lesion/leaf envelope dan
  union leaf boxes; tidak tersedia bila denominator leaf tidak tersedia.
- Union mencegah double counting overlap, tetapi box berisi background. Whole-leaf
  disease box bukan lesion mask; rasio tidak menjadi damaged tissue percentage.

**PROPOSED** untuk segmentasi yang sudah divalidasi:
`visible_lesion_mask_ratio = area(union reviewed/predicted lesion masks ∩ visible
plant mask) / area(visible plant mask)`, pada citra oriented yang sama. Denominator
nol/tidak terukur menghasilkan unavailable, bukan 0% sehat. Wajib mencatat target
scope, occlusion policy, annotation agreement, model/calibration version dan error
terhadap manual masks. Ini hanya proporsi **bagian terlihat di foto**, bukan
kerusakan seluruh tanaman, kehilangan hasil, hektar, atau eligibility AUTP.

Penilaian bidang memerlukan bukti sampling yang representatif antar titik/waktu,
geometry snapshot, area survey/method, crop stage, incident context dan human
review. Foto bias yang dipilih pengguna tidak dapat diproyeksikan langsung ke
seluruh hektar. Jangan kalikan box ratio, confidence atau legacy `damage_pct`
dengan area bidang untuk menghasilkan crop loss.

## 6. Future persistence dan review — REQUIRES_APPROVAL

Detector evidence receipt terpisah dari `ai_analyses` classifier, secara konseptual:

- immutable receipt ID, uploader/submitter, exact image hash/storage reference;
- model version/hash, taxonomy/dataset manifest/preprocessing/postprocessing;
- actual dimensions, class/scope/boxes atau versi mask contract;
- inference status dan `REVIEW_REQUIRED` reason; timestamp server;
- human review events append-only: actor, scope assignment, evidence, correction,
  reason dan time. Tidak mengubah original prediction/annotation secara in-place.

Payload dari klien harus dicocokkan dengan receipt server, bukan dipercaya. Review
model output tidak menyetujui parcel, dossier atau klaim. Masih **PROPOSED**, belum
ada migration/receipt tersebut dan preview tidak dipromosikan ke legacy severity.

## 7. Evaluation dan activation gates

1. Reviewed taxonomy/scope/licenses/negatives/global groups; prepared dataset baru
   immutable; real checkpoint dengan provenance dan environment ML approved.
2. Holdout group-aware yang dibekukan, per-class support/groups, mAP50/mAP50–95,
   precision/recall, missed objects, object size/scope slices dan false positive
   burden. IoU ground truth harus sama scope; disease mAP bukan flood accuracy.
3. Segmentasi jika dipilih: per-class IoU/Dice, boundary quality, leaf/lesion scope,
   denominator completeness dan error proporsi foto; jangan hanya box mAP.
4. ONNX parity, static I/O/metadata/hash dan postprocess tests serta CPU/RSS target.
5. Browser overlay oriented/non-square/zoom/mobile dan offline degradation dengan
   foto serta human review sebenarnya; synthetic contracts bukan hasil agronomi.
6. Review lisensi software/weights termasuk kondisi distribusi Ultralytics; service
   rollout eksplisit, rollback artifact/flags dan staging security gates lulus.

## 8. Acceptance criteria

- **LOC-AC1**: setiap hasil mengikat version/hash, dimensi, class/scope, bbox valid,
  confidence, provenance dan review status; error bukan empty success.
- **LOC-AC2**: scope/source IDs tidak diinferensikan dari nama; tidak ada automatic
  label approval, full conversion atau training source unreviewed.
- **LOC-AC3**: semua keluaran uncalibrated ditandai REVIEW_REQUIRED; tidak ada
  percentage loss atau insurance decision dari confidence/box coverage.
- **LOC-AC4**: evaluasi detection/segmentation dan keputusan pemilihan punya
  annotation protocol, holdout, support serta actual runtime evidence.
- **LOC-AC5**: persistence baru hanya melalui schema/receipt/RLS yang direview;
  classifier contract existing dan YOLO default OFF tetap kompatibel.

Sumber historis: [PHASE 1A](PHASE-1A-YOLO.md), [mixed QA](MIXED-ANNOTATION-QA-1B003.md),
dan `ai-service/training/yolo/README.md` (termasuk rujukan dokumentasi YOLO26).
