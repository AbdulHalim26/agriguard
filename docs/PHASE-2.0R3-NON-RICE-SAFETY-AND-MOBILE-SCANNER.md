# PHASE 2.0R.3 — Non-Rice Image Safety Gate & Mobile Scanner Usability Hotfix

- **Tanggal:** 27 November 2026
- **Baseline:** `staging/yolo-2p` commit `4ec48a4` (Vercel Preview R.2 `https://agriguard-3gnsrlaqe-abdulhalim26s-projects.vercel.app`)
- **Lingkup:** Perubahan lokal saja (tanpa training ulang, tanpa perubahan bobot/threshold/dataset, tanpa migrasi DB/Supabase/Auth, tanpa deploy Render/Vercel, tanpa commit/push, Production 100% tidak disentuh).

---

## 1. Akar Penyebab yang Terbukti (TASK 1)

1. **Asimetri Gerbang Domain antara `/predict` dan `/predict/detect`:**
   - Endpoint klasifikasi `/predict` (`ai-service/predict.py:320-344`) menjalankan pra-cek server-side (`DomainGateError` → HTTP `422`) sebelum inference EfficientNet-B0 v2 (`_green_ratio < 0.15` atau `confidence < 0.35`). Pada foto kipas angin iPhone, rasio hijau mendekati `0%` sehingga `/predict` menolaknya dengan HTTP `422` (*"Foto bukan lahan padi/tanaman"*).
   - Sebaliknya, endpoint deteksi `/predict/detect` (`ai-service/main.py:108-124`, `ai-service/detection/adapter.py:184-211`) **tidak memiliki gerbang domain sama sekali** — hanya memeriksa MIME JPG/PNG, ukuran `<= 5 MB`, dan dimensi. Foto kipas angin langsung masuk ke `detector_yolov8n_rice_v1.onnx` (yang dilatih eksklusif pada 9 kelas penyakit/daun padi tanpa kelas negatif non-padi), sehingga tekstur jeruji kipas menghasilkan false positive `Rice-Blast` ~26% (`>= 0.25`).
2. **Kurangnya Koordinasi Fail-Closed pada Frontend `/scan`:**
   - `app/(app)/scan/page.tsx` memanggil `/api/ai/detect` dan `/api/ai/analyze` secara paralel dan independen. Saat `/api/ai/analyze` mengembalikan HTTP `422` (`aiRetake = true`), UI tetap menampilkan overlay `DetectionOverlay` beserta kotak `Rice-Blast` di atas foto kipas yang ditolak classifier.
3. **Keterbatasan Heuristik Hijau Lama (`_green_ratio < 0.15`):**
   - Uji empiris terhadap 111 foto uji penyakit padi asli (`rice-v1/test/images`) menunjukkan heuristik hijau-saja lama menolak **24/111 (21,6%)** foto penyakit padi asli — terutama daun cokelat/kuning/kering (`Brown-Spot`, `Stem-Rot`, `Bacterial-Leaf-Blight`).

---

## 2. Daftar File yang Diubah (9 File)

| File | Perubahan |
| --- | --- |
| `ai-service/detection/domain_gate.py` | *(Baru)* Pra-gerbang domain tanaman fail-closed (`evaluate_crop_domain`) berbasis rentang warna dedaunan padi (hijau + kuning-hijau + cokelat/kuning kering: PIL HSV `H 12..95`, `S >= 0.14`, `V >= 0.15`, min rasio `0.08`) + tekstur alami (`texture_gradient >= 0.50`, `flat_pixel_ratio <= 0.85`). |
| `ai-service/detection/contracts.py` | Tambah `UNSUPPORTED_IMAGE` pada `DetectionResponse.inference_status` dan `UNSUPPORTED_NON_RICE_IMAGE` pada `SeverityReview.reason`; validator menolak jika `UNSUPPORTED_IMAGE` memiliki bounding box. |
| `ai-service/detection/severity.py` | Tambah dukungan parameter `unsupported_image=True` → `reason="UNSUPPORTED_NON_RICE_IMAGE"`. |
| `ai-service/detection/adapter.py` | Jalankan `evaluate_crop_domain()` sebelum ONNX YOLO pada model nyata (`allow_synthetic=False`); foto non-padi langsung mengembalikan `UNSUPPORTED_IMAGE` dengan `detections=[]` tanpa menjalankan YOLO. |
| `lib/detection.ts` | Perluas `detectionResponseSchema` untuk `UNSUPPORTED_IMAGE` & `UNSUPPORTED_NON_RICE_IMAGE` dengan `superRefine` ketat (wajib `detections.length === 0`). |
| `components/features/DetectionOverlay.tsx` | Blokir kotak deteksi saat `UNSUPPORTED_IMAGE` atau `suppressedByClassifier=true`; batasi tinggi pratinjau mobile (`min(42vh, 280px)`) sambil menjaga aspect ratio & koordinat persentase bounding box tetap presisi tanpa crop/geser. |
| `app/(app)/scan/page.tsx` | Koordinasi fail-closed `isUnsupportedImage = aiRetake \|\| detectionResult?.inference_status === 'UNSUPPORTED_IMAGE'`; sembunyikan tab `Deteksi YOLO` saat foto ditolak; lipat metadata teknis & SHA-256 ke `<details>` (`Detail bukti foto & SHA-256`); batasi tinggi gambar `max-h-[42vh] sm:max-h-72`; tambah `safe-area-inset-bottom` Safari iOS & target sentuh `min-h-[44px]`. |
| `ai-service/tests/test_yolov8n_rice_v1.py` | Tambah pengujian `UNSUPPORTED_IMAGE` (kipas sintetis, dinding hijau polos, tirai biru, `logo.png`, blank PNG), recall sampel padi asli, dan penolakan kontrak bila ada box pada `UNSUPPORTED_IMAGE`. |
| `tests/detection-rice-v1.test.ts` | Tambah pengujian kontrak `UNSUPPORTED_IMAGE`, `suppressedByClassifier`, tinggi pratinjau mobile, `<details>` SHA-256, dan `safe-area-inset-bottom`. |

---

## 3. Bukti Pengujian Foto Non-Padi & Padi Asli (TASK 3)

*(Catatan: foto kipas iPhone asli pengguna tidak tersimpan di workspace lokal; digunakan fixture sintetis jeruji kipas ditambah 7 gambar non-padi nyata/sintetis dan 115 gambar padi nyata. Hash `model_v2.onnx` dan `detector_yolov8n_rice_v1.onnx` serta threshold `0.25` tidak diubah.)*

### 3.1 Negative Set (Non-Padi — 8 Gambar)
| Gambar | `foliage` | `grad` | `flat` | Sebelum R.3 (YOLO) | Sesudah R.3 (`/predict/detect`) |
| --- | ---: | ---: | ---: | --- | --- |
| `synth_fan_grill` (jeruji kipas) | `0.000` | `8.85` | `>0.5` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `synth_indoor_wall` | `0.000` | `0.12` | `>0.9` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `synth_document` | `0.000` | `13.93` | `>0.5` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `synth_solid_green_wall` (adversarial hijau) | `1.000` | `0.00` | `1.000` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `synth_blue_curtain` | `0.000` | `1.73` | `>0.8` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `public/logo.png` | `0.009` | `3.59` | `0.395` | **FP `Narrow-Brown-Spot: 42%`** | **`UNSUPPORTED_IMAGE`** (0 box) |
| `public/icons/icon-512.png` (ikon hijau datar) | `0.733` | `1.74` | `0.894` | `NO_DETECTIONS` | **`UNSUPPORTED_IMAGE`** (0 box) |
| `dashboard-desktop-1440.png` (screenshot UI hijau) | `0.185` | `5.42` | `0.499` | **FP `False-Smut: 29%`** | *LOLOS pra-gerbang* (residual FP; lihat Bagian 4) |

### 3.2 Positive Set (Padi Nyata — 115 Gambar)
| Kelompok | Jumlah | Lolos Pra-Gerbang R.3 | Catatan |
| --- | ---: | ---: | --- |
| `ai-service/tests/samples/` (`aman`, `rusak_ringan`, `rusak_berat`) | 3 | **3/3 (100%)** | Tidak ada penolakan palsu |
| `public/ilustrations/hero-rice.jpg` | 1 | **1/1 (100%)** | Lolos |
| Roboflow `rice-v1/test/images` (9 kelas termasuk daun cokelat/kuning/kering & `Healthy`) | 111 | **109/111 (98,2%)** | Jauh lebih baik dibanding gerbang hijau lama (`87/111` / `78,4%`); `BACTERAILBLIGHT4_123` tetap menampilkan box nyata `Bacterial-Leaf-Blight 65%` + `Rice-Blast 33%` |

---

## 4. False Positives & False Negatives yang Masih Tersisa (Jujur)

1. **Residual False Positives (OOD yang masih dapat lolos pra-gerbang):**
   - Screenshot aplikasi/dokumen ber-sidebar hijau dengan teks padat (contoh: `dashboard-desktop-1440.png`: `foliage=0.185`, `grad=5.42`, `flat=0.499`) atau foto tanaman hias non-padi berdaun hijau/cokelat bertekstur alami dapat tetap melewati `evaluate_crop_domain()`.
   - **Mengapa:** baik EfficientNet-B0 v2 maupun YOLOv8n tidak dilatih dengan kelas negatif OOD (non-padi). Pengaman R.3 adalah *lightweight pre-gate* + koordinasi dual-model (`aiRetake` menyembunyikan box YOLO), **bukan** solusi generalisasi open-set OOD penuh. Solusi jangka panjang memerlukan classifier biner `rice-vs-non-rice` atau data negatif pada fase training terpisah.
2. **Residual False Negatives (Foto padi valid yang tertolak pra-gerbang):**
   - **2/111 (1,8%)** foto pada `rice-v1/test/images` (potret studio daun sangat tipis di atas latar putih dominan dengan `foliage < 0.08`, mis. `Brown_spot-123` `foliage=0.057`) ditolak sebagai `UNSUPPORTED_IMAGE`. Pengguna tetap dapat mengambil ulang foto lebih dekat atau memakai **Gunakan Pelaporan Manual** tanpa kehilangan jalur laporan ke PPL.

---

## 5. Perbandingan Mobile Sebelum vs Sesudah (TASK 4)

Diverifikasi dengan Chrome 158 pada **`390×844`**, **`375×812`**, dan **`1440×900`** (bukti screenshot tersanitasi di `.staging/phase2r3-evidence/`):

| Aspek Mobile | Sebelum (R.2) | Sesudah (R.3) |
| --- | --- | --- |
| **Tinggi pratinjau YOLO potret di iPhone** | `w-full` tanpa batas tinggi (`477–636 px`), mendorong hasil AI ke bawah layar | Dibatasi `min(42vh, 280px)` dengan rumus `width: min(100%, calc(min(42vh, 280px) * W / H))` — aspect ratio & posisi bounding box tetap presisi |
| **Visibilitas hasil AI di layar pertama** | Tertutup foto tinggi + blok hash SHA-256 terbuka | Kartu `Deteksi penyakit & kerusakan (YOLO)` / `UNSUPPORTED_IMAGE` langsung terlihat di layar pertama pada `390×844` & `375×812` |
| **Hash & metadata teknis** | Selalu terbuka (4 baris monospace + disclaimer) | Dilipat rapi di `<details>` (`Detail bukti foto & SHA-256`), tetap utuh di payload laporan, offline queue, dan panel PPL |
| **Foto non-padi (`logo.png`)** | Menampilkan tab & kotak `Narrow-Brown-Spot 42%` | Menampilkan `UNSUPPORTED_IMAGE`, `0` bounding box, tab YOLO disembunyikan, tombol `Ambil Ulang Foto` & `Gunakan Pelaporan Manual` langsung terlihat |
| **Overflow & Safari iOS safe area** | Tanpa `safe-area-inset-bottom` pada kontainer `/scan` | `pb-[max(1.5rem,env(safe-area-inset-bottom))]`, `0` horizontal overflow pada `390×844`, `375×812`, `1440×900`, `0` console error |

---

## 6. Regression Gate & Bukti Integritas

- **Python AI Tests (`unittest discover ai-service/tests`):** **PASS** (seluruh suite termasuk `test_non_rice_safety_gate_and_crop_recall`).
- **Security & Unit Tests (`npm run test:security`):** **293/293 PASS**, 0 fail.
- **TypeScript (`./node_modules/.bin/tsc --noEmit --incremental false`):** **PASS**.
- **Diff Check (`git diff --check`):** **PASS**.
- **Next.js Production Build (`npm run build`):** **PASS** (`26/26` routes).
- **Chrome 158 E2E (`390×844`, `375×812`, `1440×900`):** **PASS** (`0` overflow, `0` console errors; bukti di `.staging/phase2r3-evidence/scan-nonrice-blocked-390.png`, `scan-yolo-mobile-390.png`, `scan-yolo-mobile-375.png`).
- **Model & Production Tidak Berubah:**
  - `model_v2.onnx`: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`
  - `detector_yolov8n_rice_v1.onnx`: `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0`
  - `HEAD` = `4ec48a4` (`staging/yolo-2p`), `main` & `origin/main` = `d7ffebb`.

---

## 7. Keputusan Rilis

**KEPUTUSAN: CONDITIONAL GO (untuk rilis staging terkontrol setelah persetujuan pemilik proyek).**

**Syarat penting saat rilis staging nanti:**
- Perubahan R.3 mencakup kode **FastAPI (`ai-service/detection/`)** sekaligus **Next.js frontend**. Agar `UNSUPPORTED_IMAGE` aktif di backend staging (bukan hanya supresi sisi UI dari HTTP 422 classifier), rilis staging R.3 memerlukan **deploy ulang Render AI staging (`agriguard-ai-staging`)** selain push `staging/yolo-2p` ke Vercel Preview (Production Render `agriguard-ai` & Vercel Production tetap tidak disentuh).
- Keterbatasan OOD pra-gerbang (tanaman hias non-padi / screenshot UI hijau) tetap didokumentasikan secara jujur untuk juri.
