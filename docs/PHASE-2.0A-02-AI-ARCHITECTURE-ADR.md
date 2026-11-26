# ADR 2.0A — Baseline AI, kandidat arsitektur, dan batas keputusan

Tanggal: **16 November 2026**. Status: **PROPOSED / REQUIRES_APPROVAL** untuk
keputusan eksperimen/pengembangan; **EXISTING** untuk hasil inspeksi di bawah.
Keputusan pemilihan arsitektur produksi baru: **DEFERRED / BLOCKED**.

## 1. Konteks existing yang diverifikasi

```text
Foto terkompres/oriented dari scan
  → Next.js authenticated server proxy
      → FastAPI /predict → EfficientNet-B0 ONNX CPU
      → receipt ai_analyses (user_id + SHA foto) → damage_reports
  → [default OFF] /api/ai/detect → /predict/detect
      → YOLO26 ONNX preview + REVIEW_REQUIRED (bukan receipt severity)
```

FastAPI dan receipt existing dipertahankan. Browser mobile tidak menjalankan model
secara on-device. Source tidak membuktikan endpoint FastAPI publik terlindungi
gateway/auth antarlayanan; CORS `*` bukan autentikasi. Perubahan perimeter layanan
memerlukan rencana tersendiri, bukan melemahkan guard proxy.

### Model aktual versus narasi historis

| Aspek | Hasil inspeksi aktual |
|---|---|
| Active path | `ai-service/predict.py::MODEL_PATH` menunjuk `model/model_v2.onnx`, tidak memilih v1 melalui feature flag. |
| Arsitektur | Metadata `torchvision.efficientnet_b0`, tiga label visual; ORT CPU berhasil load. |
| Input/output | FP32 `pixel_values: [batch,3,224,224]` → `logits: [batch,3]`; kontrak HTTP tetap `status,confidence,damage_pct`. |
| Ukuran file aktual | v2 **16.035.581 bytes**; v1 `model.onnx` **16.088.381 bytes**. Ini ukuran file ONNX, bukan peak RSS/parameter count. |
| SHA-256 v2 | `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`, cocok metadata. |
| SHA-256 v1 | `beb8f95c353f74cd9d3b85e5092987635206a05f671a20f54700e5c65914b8ce`; tetap tersimpan, tidak diganti pada fase ini. |
| Preprocessing runtime | PIL RGB, direct resize 224×224 BICUBIC, `/255`, mean `[.485,.456,.406]`, std `[.229,.224,.225]`, NCHW FP32. |
| EXIF drift | Metadata/training memakai `exif_transpose:true`; `_preprocess` runtime tidak melakukannya sendiri. Scan menormalisasi orientasi di `geo.ts::compressImage`; direct FastAPI caller belum mendapat jaminan identik. |
| Gate aktual | Vegetasi HSV ≥0,15; confidence ≥**0,35**, sementara metadata v2 masih **0,50**. Ini drift yang perlu reconciled dengan versi, bukan ditambal diam-diam. |
| Persentase | Confidence-scaled range: aman 0–15, ringan 30–60, berat 60–95. Metadata `calibrated_against_measured_damage:false`. |
| Evidence ledger | `ai_analyses` belum menyimpan model SHA/version, taxonomy, calibration, atau preprocessing version. Authentic photo binding tidak membuktikan hasil ilmiah benar. |

## 2. Angka evaluasi: jangan digabung

| Klaim | Sumber | Status fase ini |
|---|---|---|
| 91,28% delapan penyakit v1 | AI README/model publisher attribution | **UNVERIFIED**, hasil penulis pada dataset penulis, bukan generalisasi Karawang. |
| 73,8% kelas / 78,6% status, 42 gambar | AI README/maintenance notes; pemilik mengatribusikan ke proposal | **HISTORICAL / UNVERIFIED**; proposal asli dan raw predictions belum tersedia, tidak direproduksi. |
| v2 0,9172, 145 test, majority 0,531 | Konstanta `predict.py`; metadata menyimpan hash metrics/manifest | **REPORTED_IN_SOURCE / UNVERIFIED**. Tidak ditemukan `metrics.json`, dataset manifest/split, reviewed labels dan checkpoint eksperimen yang memungkinkan audit end-to-end di repo. |
| Recall v2 ringan 0/7; kelas lain 61/61 dan 72/77 | Komentar/konstanta source, bukan hasil tes baru | Tidak cukup untuk endorsement. Jika akurat, menunjukkan kegagalan kelas minoritas yang tertutup oleh accuracy agregat. |
| Parity v2 ~1,25e-6 | Metadata ekspor | Bukti historis yang dideklarasikan. Hash ONNX diperiksa, parity PyTorch tidak dijalankan ulang. Parity bukan accuracy. |

Tidak menghitung macro-F1/confusion matrix baru dari angka komentar. Diperlukan
prediksi per sampel, label review, dan identitas split yang dapat diperiksa.

## 3. Keputusan arsitektur yang diusulkan

1. **Pertahankan EfficientNet existing** sebagai baseline operasional yang perlu
   qualification ilmiah; jangan mengganti atau menurunkan kualitas model tanpa bukti.
2. **Bandingkan** B0, MobileNetV3-Small, MobileNetV3-Large dengan protokol
   [benchmark](PHASE-2.0A-03-CLASSIFIER-BENCHMARK.md). Tidak memilih dari nama model
   atau ImageNet leaderboard. Server CPU, RSS, biaya dan maintainability menentukan
   bersama mutu data dan metrik task yang sah.
3. **YOLO26n/s tetap OFF secara default**, localization-only sampai reviewed data,
   trained checkpoint, parity, field performance dan izin aktivasi tersedia.
4. **Segmentasi adalah eksperimen terpisah**, bukan reinterpretasi polygon atau
   pengganti adapter existing. Hanya jika kebutuhan boundary dan label mask sah.
5. **Field damage severity bukan keluaran langsung classifier/box**. Dibutuhkan
   sampling evidence representative, geospatial context dan human assessment.
6. Tidak ada arsitektur yang berhak mengeluarkan `CLAIM_APPROVED`, `CLAIM_REJECTED`,
   `INSURANCE_ELIGIBLE`, atau `INSURANCE_INELIGIBLE` dari inference.

Alternatif yang dinilai:

| Kandidat | Kelebihan yang dapat dipertimbangkan | Risiko/bukti yang belum ada |
|---|---|---|
| EfficientNet-B0 | Runtime ONNX existing, preprocessing/factory dikenal, biaya integrasi rendah. | Kualitas lapangan/kelas minoritas, gates, kalibrasi, CPU/RSS comparative belum terbukti. |
| MobileNetV3-Small | Parameter referensi lebih sedikit, calon hemat memori/CPU. | Kapasitas/gejala halus, export hard-swish/SE dan latency target belum diuji. |
| MobileNetV3-Large | Kandidat kapasitas lebih besar dari Small. | Tidak otomatis lebih kecil dari B0; tanpa benchmark tidak ada pemenang. |
| YOLO26 detection | Menjawab lokasi gejala dalam foto; adapter/provenance sudah ada. | Belum trained rice model approved; disease boxes bukan flood loss. |
| Segmentation | Boundary irregular dan definisi proporsi jaringan lebih masuk akal bila mask benar. | Scope polygon belum resolved; output/memory/annotation cost dan validation baru. |

## 4. Ontologi dan otoritas — PROPOSED

Simpan dimensi yang berbeda, jangan satu severity enum menyatakan semuanya:

| Dimensi | Makna dan larangan inferensi |
|---|---|
| `rice_disease_symptom` | Gejala visual penyakit; bukan diagnosis kausal/laboratorium atau banjir. |
| `pest_damage` | Dugaan cedera hama; `leaf_folder_damage` memerlukan data yang kini tidak tersedia. |
| `flood_related_damage` | Dugaan dampak banjir dengan bukti kejadian/spasial/waktu, bukan dari disease label. |
| `other_environmental_damage` | Misalnya kekeringan/lodging; perlu taxonomy dan evidence terpisah. |
| `field_damage_assessment` | Penilaian representatif tingkat bidang, area/metode/uncertainty/reviewer; bukan box area satu foto. |

Label API `aman` adalah nilai kompatibilitas existing, bukan jaminan bebas banjir,
sehat, atau eligible AUTP. Confidence bukan persentase kerugian atau probabilitas
klaim diterima. `NO_DETECTIONS` bukan healthy.

### Advisory envelope dan kompatibilitas

**PROPOSED**, melalui perubahan kontrak terpisah yang direview:

- Hasil unsupported/uncalibrated memakai `review_status: REVIEW_REQUIRED` plus
  reason/calibration status. UI Bahasa Indonesia: **“Perlu ditinjau petugas”**.
- `/predict` existing dipertahankan tiga keys-nya; jangan mengubahnya menjadi
  detector response atau memalsukan angka nol untuk unknown. Adapter/versioned
  evidence metadata di web/receipt dapat menambah konteks tanpa menulis ulang receipt
  lama. Desain storage baru memerlukan approval skema dan tes RLS.
- `damage_pct` legacy tetap raw historical value; UI/rekap tidak boleh menyatakannya
  sebagai loss faktual. Jika belum ada definisi/validasi proporsi, jangan tampilkan
  persen tersebut sebagai penilaian kerusakan; tampilkan status review/keterbatasan.
- Receipt baru kelak mengikat user, foto, model SHA/version, preprocessing,
  taxonomy, review status, calibration ID (nullable) dan waktu server. Klien tidak
  boleh menulis hasil trusted. Receipt lama tetap `legacy` sesuai provenance asli.
- Saat heuristic gate menolak input, evidence intake dan review manual tetap
  diperlukan; reject foto oleh AI bukan reject laporan/claim. UX 422 existing
  yang hanya menawarkan retake adalah gap, bukan workflow final yang disetujui.

## 5. Konsekuensi dan gates

**GO**: inspeksi, evidence inventory, protokol benchmark, tes kontrak lokal.
**CONDITIONAL GO**: eksperimen terisolasi setelah data/taxonomy/weights/ML dependency
disetujui. **NO-GO**: model replacement, severity kuantitatif, aktivasi YOLO,
training unreviewed rice dataset, dan otomatisasi keputusan asuransi.

**REQUIRES_APPROVAL**: perubahan schema receipts, teknologi locked PRD v1
(YOLOv8n-cls/HF versus existing EfficientNet/Render), ML experiments, serta klaim
publik baru. Proposal ini tidak menyatakan deviasi historis telah disetujui formal.

## 6. Acceptance criteria

- **ADR-AC1**: active artifact dan preprocessing/gates dicatat dari runtime, beserta
  hash dan drift dokumentasi; tidak mengasumsikan rollback v1 telah diimplementasi.
- **ADR-AC2**: angka historis/konstanta, smoke contract dan benchmark baru terpisah;
  tidak ada accuracy/RSS/latency yang dikarang.
- **ADR-AC3**: pemilihan model baru hanya dengan data/split/protokol comparable dan
  sign-off reviewer; tanpa prasyarat status tetap BLOCKED.
- **ADR-AC4**: advisory UI dan future receipt melarang loss/claim inference;
  EfficientNet, FastAPI contract, existing receipts dan YOLO default OFF dipertahankan.

Sumber: `predict.py`, `model_v2.metadata.json`, `training/common.py`,
`lib/reports/{submit,evidence}.ts`, migrasi `0010`, [PHASE 1A](PHASE-1A-YOLO.md),
dan dokumentasi arsitektur resmi yang dicantumkan di benchmark plan.
