# PHASE 2.0Q.1 — Focused Regression Audit: YOLO Scanner & Gallery GPS Evidence

**Tanggal:** 26 November 2026
**Target Preview Diaudit:** `https://agriguard-eo1orgtw3-abdulhalim26s-projects.vercel.app` → `https://agriguard-ai-staging.onrender.com`
**Perubahan Model / Production / Deployment:** **TIDAK ADA** (tidak ada training ulang, tidak ada perubahan bobot ONNX/EfficientNet, tidak ada perubahan threshold `0.25`, tidak ada deploy baru, dan Production tetap tidak disentuh).

---

## 1. Perbandingan 4-Layer Inference pada File Identik

Pengujian dijalankan pada file yang **persis sama** melalui 4 layer: (1) PyTorch `best.pt`, (2) ONNX Runtime lokal, (3) FastAPI staging (`agriguard-ai-staging.onrender.com`), dan (4) Next.js Vercel Preview (`agriguard-eo1orgtw3`).

| Foto Uji | Dimensi & EXIF | PyTorch `best.pt` (default rect `auto=True`) | PyTorch `best.pt` (`640×640` square) | ONNX Lokal (`640×640` square) | FastAPI Staging | Vercel Preview | EfficientNet v2 |
|---|---|---|---|---|---|---|---|
| **`padi.jpeg`** *(reproduksi temuan browser)* | `387×516` (portrait, EXIF `null`) | `Rice-Blast 0.5273`, `Rice-Blast 0.4025`, `BLB 0.2654` *(input `480×640`)* | Max `BLB 0.2443`, `Rice-Blast 0.2395` → **`NO_DETECTIONS`** | Max `BLB 0.2443` (`max_abs_diff = 0.00113 px`) → **`NO_DETECTIONS`** | **`NO_DETECTIONS`** | **`NO_DETECTIONS`** | **`rusak_berat`** (`0.3952`, `74%`) |
| **`BACTERIALBLIGHT2_080.jpg`** *(fixture positif)* | `300×300` (square, EXIF `null`) | `BLB 0.7936` `[15.4, 0.7, 292.3, 298.9]` | `BLB 0.7936` | `BLB 0.7936` | `SUCCESS` (`BLB 0.7936`) | `SUCCESS` (`BLB 0.7936`) | `rusak_ringan` (`0.4113`, `42%`) |
| **`sample_rusak_berat.jpg`** | `1600×1200` (landscape, EXIF `null`) | `BLB 0.4912`, `Brown-Spot 0.4205`, `Sheath 0.2792` | `Brown-Spot 0.3262`, `Sheath 0.3063`, `BLB 0.3019` | `Brown-Spot 0.3262` (`8` anchors ≥ 0.25) | `SUCCESS` (3 boxes) | — | `aman` (`0.3851`, `9%`) |
| **`Stem_rot-59.jpg`** *(missed test split)* | `224×224` (square, EXIF `null`) | Max `Stem-Rot 0.1302` → `NO_DETECTIONS` | `NO_DETECTIONS` | Max `Stem-Rot 0.1301` → `NO_DETECTIONS` | `NO_DETECTIONS` | — | `rusak_berat` (`0.4343`, `75%`) |

### Kesimpulan Akar Masalah (Terbukti Secara Matematis)
1. **Tidak ada bug pada Frontend, Proxy Next.js, FastAPI Adapter, EXIF, NMS, maupun Export ONNX.**
   - Pada tensor `640×640` yang identik untuk `padi.jpeg`, PyTorch `best.pt`, ONNX Runtime lokal, FastAPI staging, dan Vercel Preview menghasilkan skor **identik** (`Bacterial-Leaf-Blight 0.2443`, `max_abs_diff = 0.00113 px` across `13 × 8400` outputs).
2. **Mengapa `padi.jpeg` menghasilkan `NO_DETECTIONS` pada ONNX/Staging (`0.2443 < 0.25`):**
   - **Skor borderline:** Skor puncak `0.2443` berada hanya `0.0057` di bawah ambang `0.25`.
   - **Sensitivitas letterbox persegi (`640×640`) vs persegi panjang (`480×640`) pada foto non-square:** `padi.jpeg` berukuran portrait `387×516`. PyTorch `predict()` default memakai letterbox rectangular (`auto=True` → `480×640` tanpa padding samping), sedangkan ONNX statis `[1, 3, 640, 640]` menambahkan padding abu-abu `(114, 114, 114)` selebar `80 px` di kiri & kanan. Karena objek gejala pada `padi.jpeg` berada dekat tepi gambar (`x1=0.2, y1=486.9`) dan mayoritas dataset latih `rice-v1` berbentuk persegi (`224×224` / `300×300`), padding samping mengubah aktivasi tepi dari `0.5273` menjadi `0.2443`.
3. **Keputusan:** **`NO_DETECTIONS` dipertahankan** sesuai fakta model; ini didokumentasikan secara jujur sebagai keterbatasan model & input statis `640×640` pada foto non-square (opsi mitigasi pasca-kompetisi: augmentasi rasio aspek saat training atau ekspor ONNX dynamic-shape setelah persetujuan terpisah).

---

## 2. Evaluasi Offline Threshold Sweep pada Held-Out Test Split (111 Gambar, 382 Instansi)

| `conf_threshold` | TP | FP | FN | Precision | Recall | F1 | Gambar `NO_DETECTIONS` (dari 111) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| `0.05` | 237 | **663** | 145 | 0.2633 | 0.6204 | 0.3697 | 0 |
| `0.10` | 210 | **378** | 172 | 0.3571 | 0.5497 | 0.4330 | 0 |
| `0.15` | 197 | **250** | 185 | 0.4407 | 0.5157 | 0.4753 | 1 |
| `0.20` | 178 | **190** | 204 | 0.4837 | 0.4660 | 0.4747 | 2 |
| **`0.25` (aktif)** | **159** | **143** | **223** | **0.5265** | **0.4162** | **0.4649** | **5** |
| `0.30` | 138 | 108 | 244 | 0.5610 | 0.3613 | 0.4395 | 11 |
| `0.35` | 119 | 84 | 263 | 0.5862 | 0.3115 | 0.4068 | 16 |

**Keputusan Threshold:** **`AGRIGUARD_YOLO_CONFIDENCE=0.25` TETAP DIPERTAHANKAN.** Menurunkan threshold ke `0.20` menaikkan false positives sebesar **`+32.9%`** (`143 → 190`), dan ke `0.15` menaikkan FP sebesar **`+74.8%`** (`143 → 250`) dengan penurunan precision dari `52.7%` menjadi `44.1%`.

---

## 3. Audit & Perbaikan Label GPS untuk `gallery_upload` (Task 8)

### Temuan Audit
Sebelumnya, saat pengguna memilih foto dari galeri (`gallery_upload`) dan izin GPS browser aktif:
- Badge lokasi menampilkan `"Snapshot GPS saat capture"`.
- Watermark menulis `"GPS: -6.xxx, 107.xxx (±X m)"`.
- Hal ini berpotensi menyesatkan PPL seolah koordinat tersebut adalah lokasi pengambilan foto asli di lapangan, padahal untuk unggahan galeri itu hanyalah lokasi perangkat **saat file dipilih/diunggah**.

### Perbaikan Lokal yang Diterapkan (Siap Di-deploy Setelah Persetujuan Terpisah)
- [lib/reports/photo-evidence.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/reports/photo-evidence.ts):
  - `locationStatusLabel('gps_captured', 'gallery_upload')` → **`"GPS perangkat saat pilih file (bukan bukti lokasi foto asli)"`** (sedangkan `camera_capture` tetap `"Snapshot GPS saat capture"`).
  - `buildWatermarkLines` untuk `gallery_upload` memakai prefiks **`"GPS Unggah (bukan lokasi asli): ..."`**.
  - Menambahkan konstanta `GALLERY_LOCATION_WARNING`.
- [app/(app)/scan/page.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/scan/page.tsx):
  - Menampilkan `"Waktu pilih file (perangkat)"`, `"Akurasi GPS saat unggah"`, serta banner peringatan kuning `GALLERY_LOCATION_WARNING` khusus untuk `gallery_upload`.
- [components/features/ReportVerification.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/ReportVerification.tsx):
  - Panel pemeriksaan PPL meneruskan `capture_source` ke `locationStatusLabel()` dan menampilkan banner peringatan kuning `GALLERY_LOCATION_WARNING` setiap kali laporan berasal dari `gallery_upload`.
- [tests/photo-evidence.test.ts](file:///Users/macbook/Documents/Personal/agriguard/tests/photo-evidence.test.ts):
  - Menambahkan unit & regression test khusus yang memastikan `gallery_upload` tidak pernah mengklaim GPS perangkat sebagai lokasi foto asli.

---

## 4. Hasil Verifikasi Regresi
- `npm run test:security`: **285/285 PASS** (termasuk test baru `gallery_upload` GPS disclaimer).
- `./node_modules/.bin/tsc --noEmit --incremental false`: **PASS** (0 error).
- `git diff --check`: **PASS**.
- Tidak ada perubahan bobot model, threshold, Production, maupun deployment baru tanpa persetujuan terpisah.
