# PHASE 2.0P — YOLO Training, Evaluation & Scanner Integration

**Tanggal:** 26 November 2026
**Status:** **`GO — TRAINED, EVALUATED, EXPORTED TO ONNX & VERIFIED END-TO-END IN REAL CHROME DESKTOP/MOBILE`**
**EfficientNet-B0 v2 (`ai-service/model/model_v2.onnx`):** **100% UNCHANGED** (`SHA-256: 76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`).
**Production (`gvrwzfwybvyqlvbqxebe`) & Vercel/Render Deployment:** **UNTOUCHED** (`AGRIGUARD_YOLO_ENABLED` tetap `false` secara default di kode; aktivasi hanya pada uji lokal terisolasi).

---

## 1. Dataset & Validasi Lisensi / Anotasi

- **Dataset Asli (tidak dimodifikasi):** `/Users/macbook/Documents/agriguard-datasets/raw/rice-v1/`
  - Sumber: Roboflow Universe `ricedisease-zwll3/rice_leaf_disease_detector` versi `1` (`CC BY 4.0`).
  - Status file governance [rice-v1.archive-evidence.json](file:///Users/macbook/Documents/Personal/agriguard/ai-service/training/yolo/sources/rice-v1.archive-evidence.json): tetap tidak diubah secara otomatis (`license_approved`, `annotations_approved`, `conversion_approved` tidak diflip); training PHASE 2.0P dijalankan atas persetujuan eksplisit pemilik proyek.
  - Hasil preflight validasi: `1.107` gambar (`776` train / `220` valid / `111` test), `0` gambar korup, `0` label hilang/yatim, `0` baris koordinat invalid, dan **`0` duplikat persis antar split** (`train∩valid=0`, `train∩test=0`, `valid∩test=0`).
  - Temuan anotasi campuran: `1.117` baris bbox 5-kolom + `2.620` baris poligon (`>= 7` kolom).
- **Dataset Turunan Bersih:** `/Users/macbook/Documents/agriguard-datasets/derived/rice-v1-detect-2p/`
  - Gambar di-symlink ke `raw/rice-v1` (tidak menduplikasi gambar, tidak memodifikasi sumber).
  - Seluruh anotasi poligon dikonversi secara deterministik ke tight axis-aligned bbox 5-kolom (`0` box degeneratif dibuang).
  - `dataset_manifest_sha256`: `64ca5b2db08632759f6d4a8e4e319222093484b0f443bf2ae8f004527ae275eb`.
  - **9 kelas asli dipertahankan utuh:** `Bacterial-Leaf-Blight`, `Brown-Spot`, `False-Smut`, `Healthy`, `Narrow-Brown-Spot`, `Rice-Blast`, `Sheath-Blight`, `Stem-Rot`, `Tungro-Virus`.

---

## 2. Arsitektur & Konfigurasi Training

- **Model:** `YOLOv8n` (`yolov8n.pt` pretrained detection weights resmi Ultralytics; `73` fused layers, `3,134,651` parameters, `8.6 GFLOPs`) — dipilih karena ringan (`6.5 MB` `.pt` / `12.2 MB` ONNX), kompatibel langsung dengan format output `raw_cxcywh_bcn` `(1, 4+nc, 8400)` + class-aware NMS pada [adapter.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/adapter.py).
- **Environment Training Terisolasi:** `/Users/macbook/Documents/agriguard-datasets/.venv-yolo-train` (`Python 3.12.15`, `torch 2.15.0` MPS, `torchvision 0.29.2`, `ultralytics 8.4.219`, `onnx 1.23.2`, `onnxruntime 1.32.0`) — terpisah total dari `ai-service/.venv`.
- **Hardware & Durasi:**
  - Apple M1 (8-core CPU/GPU, 16 GiB RAM), `device=mps` (GPU Metal).
  - Smoke test 1 epoch: `95.6 s` (lulus tanpa error/NaN).
  - Training penuh: `epochs=65`, `patience=15`, `imgsz=640`, `batch=8`, `workers=2`, `seed=42`, `deterministic=True`, `close_mosaic=10`.
  - Total durasi: **`5440.2 s` (`1.508 jam`)**, puncak memori `3.19 GiB`.
  - Pemilihan `best.pt` berdasarkan **validation split saja** (`220` gambar, `val mAP50 = 0.484`, `val mAP50-95 = 0.270`, `P = 0.565`, `R = 0.447`).

---

## 3. Evaluasi Final pada Held-Out Test Split (111 Gambar, 382 Instansi)

Test split tidak digunakan selama training atau pemilihan hyperparameter.

| Kelas | Precision | Recall | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|
| **ALL (9 kelas)** | **0.449** | **0.453** | **0.420** | **0.246** |
| `Bacterial-Leaf-Blight` | 0.436 | 0.700 | 0.561 | 0.413 |
| `Healthy` *(bukan bukti kerusakan)* | 0.396 | 0.560 | 0.511 | 0.493 |
| `Brown-Spot` | 0.631 | 0.386 | 0.478 | 0.189 |
| `Tungro-Virus` | 0.341 | 0.563 | 0.456 | 0.289 |
| `Sheath-Blight` | 0.400 | 0.543 | 0.443 | 0.254 |
| `False-Smut` | 0.485 | 0.489 | 0.414 | 0.184 |
| `Stem-Rot` | 0.478 | 0.267 | 0.390 | 0.191 |
| `Rice-Blast` | 0.527 | 0.325 | 0.328 | 0.127 |
| `Narrow-Brown-Spot` | 0.347 | 0.240 | 0.198 | 0.074 |

- **Artefak Evaluasi:** Confusion matrix, kurva PR/F1, dan log lengkap tersimpan di `/Users/macbook/Documents/agriguard-datasets/runs/agriguard-yolov8n-rice-v1/test_eval/`.
- **12 Sampel Prediksi Nyata Test Set:** Tersimpan di `/Users/macbook/Documents/agriguard-datasets/runs/agriguard-yolov8n-rice-v1/test_predictions/` (termasuk kasus terdeteksi kuat seperti `Bacterial-Leaf-Blight` `0.794` & `Tungro-Virus` `0.532`, serta kasus `0` deteksi seperti `Stem_rot-59` & `narrow_brown-100`).
- **Keterbatasan Jujur Model:**
  - `Narrow-Brown-Spot` (`mAP50=0.198`, `R=0.240`) dan `Rice-Blast` (`mAP50=0.328`, `R=0.325`) memiliki recall paling rendah karena lesi kecil/sempit dan kemiripan visual dengan `Brown-Spot`.
  - Dataset `rice-v1` berukuran kecil (`776` train) dengan latar beragam dan campuran anotasi poligon/bbox; hasil deteksi **bersifat indikasi visual awal (`REVIEW_REQUIRED`)**, bukan diagnosis patologi final, bukan persentase luas kerusakan lahan, dan bukan keputusan klaim AUTP.

---

## 4. Path, SHA-256 Checkpoint, Export ONNX & Parity

| Artefak | Path | SHA-256 |
|---|---|---|
| PyTorch `best.pt` | `/Users/macbook/Documents/agriguard-datasets/runs/agriguard-yolov8n-rice-v1/weights/best.pt` | `57ad91e1d42fa71630040df186675d9a1f4db4a716ae13768dab4c26fc6a5bb1` |
| ONNX Detector (opset 17, FP32, static `[1,3,640,640]` → `[1,13,8400]`) | [detector_yolov8n_rice_v1.onnx](file:///Users/macbook/Documents/Personal/agriguard/ai-service/model/detector_yolov8n_rice_v1.onnx) | `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0` |
| Detector Metadata | [detector_yolov8n_rice_v1.metadata.json](file:///Users/macbook/Documents/Personal/agriguard/ai-service/model/detector_yolov8n_rice_v1.metadata.json) | Terikat `model_sha256` & `dataset_manifest_sha256` |
| EfficientNet-B0 v2 *(tidak diubah)* | [model_v2.onnx](file:///Users/macbook/Documents/Personal/agriguard/ai-service/model/model_v2.onnx) | `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f` |

- **PyTorch vs ONNX Parity (10 gambar test riil):** `max_abs_diff = 0.00360` pada skala koordinat `0..640` (`< 0.004 px`, galat relatif `5.6 × 10^-6`).
- **Latensi Inferensi ONNX Runtime (CPU Apple M1):** rata-rata **`39.61 ms/gambar`**, `p95 = 41.37 ms/gambar`.

---

## 5. Daftar Perubahan File

- [ai-service/detection/contracts.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/contracts.py) — Menambahkan dukungan `model_family="yolov8n"` dan `label_schema="rice_v1_9class"` (9 kelas asli) secara 100% kompatibel mundur dengan `rice_detection_v1`.
- [ai-service/detection/adapter.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/adapter.py) — Meneruskan `label_schema` dari `ModelSpec` ke `Provenance`.
- [ai-service/detection/severity.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/severity.py) — Mengecualikan kelas `Healthy` dari perhitungan `lesion_box_union_px` agar daun sehat tidak pernah dihitung sebagai cakupan kerusakan.
- [ai-service/model/detector_yolov8n_rice_v1.onnx](file:///Users/macbook/Documents/Personal/agriguard/ai-service/model/detector_yolov8n_rice_v1.onnx) & [detector_yolov8n_rice_v1.metadata.json](file:///Users/macbook/Documents/Personal/agriguard/ai-service/model/detector_yolov8n_rice_v1.metadata.json) — Model ONNX detector terlatih + metadata SHA-256 terikat.
- [lib/detection.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/detection.ts) — Validasi Zod untuk `yolov8n` + `rice_v1_9class` serta lapisan interpretasi transparan `interpretDetectionClass()` (`Healthy` → bukan bukti kerusakan; kelas penyakit → indikasi visual, bukan diagnosis final).
- [components/features/DetectionOverlay.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/DetectionOverlay.tsx) — Palet 9 warna untuk 9 kelas dan penanda eksplisit `(bukan bukti kerusakan)` untuk `Healthy`.
- [app/(app)/scan/page.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/scan/page.tsx) — Menambahkan tab preview `Deteksi YOLO` berdampingan dengan `Salinan Watermark` dan `Foto Asli` tanpa mengubah alur EfficientNet v2, watermark, GPS, SHA-256, maupun offline sync.
- [ai-service/tests/test_yolov8n_rice_v1.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/tests/test_yolov8n_rice_v1.py) & [tests/detection-rice-v1.test.ts](file:///Users/macbook/Documents/Personal/agriguard/tests/detection-rice-v1.test.ts) — Suite regresi Python & TypeScript untuk model nyata `YOLOv8n` 9-kelas.

---

## 6. Hasil Pengujian & Bukti Bounding Box Browser

- **Python AI regression suite:** **75/75 PASS** (termasuk real `YOLOv8n` ONNX load, held-out rice detection, blank `NO_DETECTIONS`, `Healthy` non-damage, ASGI `/predict/detect` disabled/invalid/valid, dan regresi EfficientNet v2 `/model-info` & `/predict`).
- **Node security & contract tests (`npm run test:security`):** **284/284 PASS**.
- **TypeScript no-emit (`tsc --noEmit`), `git diff --check`, dan `npm run build`:** **PASS** (`0` error, `25/25` routes).
- **Real Chrome 158 Desktop (`1440×900`) & Mobile (`390×844`) E2E** (dengan `AGRIGUARD_YOLO_ENABLED=true` & `AGRIGUARD_YOLO_MODEL_PATH=ai-service/model/detector_yolov8n_rice_v1.onnx` pada runtime lokal terhadap staging `zlluhylmykoymynnjxjs`):
  - **PASS** (`console_errors: []`): Bounding box nyata **`Bacterial-Leaf-Blight · 79%`** tampil presisi di atas foto daun padi asli pada desktop & mobile, toggle `Deteksi YOLO` / `Salinan Watermark` / `Foto Asli` berfungsi, panel YOLO menampilkan `yolov8n · yolov8n-rice-v1-2p · REVIEW_REQUIRED`, dan hasil EfficientNet v2 tampil terpisah di bawahnya.
  - Screenshot bukti tersimpan lokal (gitignored, mode `0600`) di `.staging/phase2p-evidence/`:
    - `01-yolo-bbox-desktop.png`
    - `02-yolo-bbox-mobile.png`

---

## 7. Status Aktivasi Lokal & Instruksi Rilis Staging Preview (Setelah Persetujuan Terpisah)

- **Default kode:** `AGRIGUARD_YOLO_ENABLED` tetap `false` (fail-closed) bila env tidak disetel.
- **Menjalankan lokal dengan YOLO aktif:**
  - FastAPI: `AGRIGUARD_YOLO_ENABLED=true AGRIGUARD_YOLO_MODEL_PATH=ai-service/model/detector_yolov8n_rice_v1.onnx ai-service/.venv/bin/uvicorn main:app --app-dir ai-service --port 8000`
  - Next.js: `AGRIGUARD_YOLO_ENABLED=true AI_API_URL=http://127.0.0.1:8000 npm run dev`
- **Langkah rilis Staging Preview (menunggu persetujuan terpisah — belum dijalankan):**
  1. Commit & push artefak `detector_yolov8n_rice_v1.onnx` (`12.2 MB`) + `detector_yolov8n_rice_v1.metadata.json` dan perubahan kode setelah review pemilik proyek.
  2. Setel env pada Render AI service (`agriguard-ai`): `AGRIGUARD_YOLO_ENABLED=true`, `AGRIGUARD_YOLO_MODEL_PATH=/app/model/detector_yolov8n_rice_v1.onnx`, `AGRIGUARD_YOLO_CONFIDENCE=0.25`, `AGRIGUARD_YOLO_IOU=0.45`.
  3. Setel env **Preview-only** pada Vercel project `agriguard`: `AGRIGUARD_YOLO_ENABLED=true` (biarkan Production tidak diubah hingga lulus uji staging Preview).
