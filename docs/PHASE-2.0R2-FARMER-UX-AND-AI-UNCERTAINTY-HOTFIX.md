# PHASE 2.0R.2 — Farmer Dashboard & Scanner Usability Hotfix

- **Tanggal:** 2026-11-26
- **Baseline Commit:** `d839892` (`staging/yolo-2p`)
- **Lingkup:** Perbaikan lokal terfokus (tanpa deploy Vercel/Render, tanpa `git push`, tanpa perubahan database/Auth/RLS/Storage, tanpa retraining/ubah bobot AI, tanpa menyentuh Production).

---

## 1. Ringkasan Akar Masalah (Root Causes)

1. **Prioritas 1 — BMKG Weather Fallback & Dashboard Petani:**
   - `resolveLocationToAdm4()` sebelumnya selalu mengembalikan `LOKASI_BELUM_DIVERIFIKASI` saat GPS perangkat berada di luar poligon lahan terdaftar (mis. petani membuka dashboard dari rumah), meskipun petani sudah memiliki lahan terdaftar dengan kode `adm4` terverifikasi (`32.15.03.2001`).
   - `/api/weather/bmkg` sebelumnya hanya membaca `.limit(1)` lahan dan belum mendukung pemilihan lahan milik sendiri (`?parcel_id=...`) atau mode eksplisit lokasi perangkat (`?mode=device_only`).
   - Pada dashboard petani, `FloodStatusPanel` tetap menampilkan kartu penuh (termasuk CTA duplikat `SCAN KERUSAKAN SAWAH (AI)` dan teks umur data cuaca/air legacy) ketika data hidrologi terverifikasi (`water`) belum tersedia.

2. **Prioritas 2 — Interpretasi Ketidakpastian AI & Jalur Laporan Manual:**
   - Saat YOLO mengembalikan `NO_DETECTIONS` dan EfficientNet mengembalikan `Tidak Tampak Kerusakan (Foto)` (mis. hama ulat di luar kelas model), UI belum menampilkan penegasan eksplisit bahwa hasil tersebut **bukan bukti tanaman sehat / bebas hama**.
   - Tombol **"Gunakan Laporan Manual"** sebelumnya hanya muncul saat AI gagal/error, bukan saat AI mengeluarkan prediksi dengan ketidakpastian (`REVIEW_REQUIRED`).
   - `PhotoGuide` belum menyertakan panduan agar petani mengambil satu foto tanaman utuh, bukan kolase beberapa gambar.

3. **Prioritas 3 — Konsistensi Photo Evidence & Watermark:**
   - Chip overlay kiri-atas foto pada `/scan` menampilkan `Lokasi Terdeteksi` bahkan untuk `gallery_upload`, sehingga tidak konsisten dengan peringatan unggahan galeri di bawahnya.
   - `verifiedRegionLabel` pada `app/(app)/scan/page.tsx` sebelumnya jatuh ke `selectedLahan.name` saat `village`/`district` tidak tersedia, sehingga watermark mencetak nama lahan seolah-olah wilayah administratif.

4. **Prioritas 4 — Scanner INP (`592 ms` pada observasi Preview R.1):**
   - Profiling real Chrome 158 (4× CPU throttle, mobile `390×844`) pada halaman `/scan` **sebelum optimasi** menemukan 1 long task berat sebesar **`442 ms`** (`totalBlockingTimeMs: 392 ms`) tepat saat foto dipilih, disebabkan oleh:
     1. Pembuatan watermark sinkron di main thread (`new Image` → `canvas.drawImage` → `canvas.toBlob`) langsung pada commit pemilihan foto.
     2. Mount `<ScanMap>` (Leaflet DOM + tile + polygon) dalam commit yang sama dengan pratinjau foto.
     3. Pergantian tab pratinjau (`Deteksi YOLO` / `Salinan Watermark` / `Foto Asli`) tanpa `startTransition` dan tanpa `decoding="async"` pada `<img>` (`maxInpMs: 56 ms`, `presentationDelay: 29 ms`).

---

## 2. Daftar File yang Diubah (12 File)

| File | Ringkasan Perubahan |
| --- | --- |
| `lib/ews/bmkg.ts` | Tambah `BmkgLocationMode` (`parcel_first` \| `device_only`), `device_outside_parcel`, `parcel_id`/`parcel_name`, `resolveVerifiedAdm4ForAdmin()`, dan fallback terverifikasi ke `registered_lahan` (fail-closed bila `adm4` lahan belum diverifikasi; tetap fail-closed ketat pada `device_only`). |
| `app/api/weather/bmkg/route.ts` | Query seluruh lahan milik user via RLS (`owner_id = user.id`), dukung `?parcel_id=<uuid>` (HTTP `403` untuk lahan milik pengguna lain), dukung `?mode=device_only`, kembalikan `selected_parcel` & `available_parcels`. |
| `components/features/BmkgWeatherCard.tsx` | Judul eksplisit `Prakiraan untuk <Lahan> — <Wilayah>`, info transparan saat GPS di luar batas lahan, dropdown pemilih lahan aman jika >1 lahan, dan tombol toggle `Gunakan Lokasi Perangkat` ↔ `Gunakan Lahan Terdaftar`. |
| `components/features/FloodStatusPanel.tsx` | Tambah mode `compactFarmer` agar saat data hidrologi terverifikasi belum tersedia, kartu banjir petani tampil ringkas (`BELUM DIKETAHUI`), tanpa CTA Scan duplikat dan tanpa teks umur data air/cuaca legacy. |
| `app/(app)/dashboard/DashboardHero.tsx` | Teruskan prop `compactFarmer`. |
| `app/(app)/dashboard/DashboardContent.tsx` | Aktifkan `compactFarmer={true}` & `showScanCta={false}` khusus dashboard petani (PPL/Dinas tidak berubah). |
| `components/features/AdvisoryAssessment.tsx` | Tambah penjelasan ketidakpastian Bahasa Indonesia yang jelas bahwa `REVIEW_REQUIRED` / `Tidak Tampak Kerusakan (Foto)` bukan bukti tanaman bebas hama/penyakit di luar kelas model. |
| `components/features/DetectionOverlay.tsx` | Perjelas pesan `NO_DETECTIONS` (*bukan bukti tanaman sehat atau bebas hama/penyakit di luar kelas model*) dan tambah `decoding="async"`. |
| `app/(app)/scan/PhotoGuide.tsx` | Tambah tips: *"Utamakan satu foto tanaman yang jelas, bukan kolase beberapa gambar."* |
| `lib/reports/photo-evidence.ts` | Pisahkan `lahanName` pada baris `Lahan`, ubah fallback `Wilayah:` menjadi `Wilayah administratif belum diverifikasi`, dan optimasi `createWatermarkedCopy` memakai `createImageBitmap` + `OffscreenCanvas.convertToBlob` dengan fallback kompatibel offline. |
| `app/(app)/scan/page.tsx` | Tambah tombol **"Gunakan Laporan Manual"** di bawah hasil AI (+ toggle kembali), perbaiki chip GPS `gallery_upload` (`GPS saat unggah (bukan lokasi foto asli)`), hapus fallback nama lahan pada `verifiedRegionLabel`, dan terapkan optimasi INP (`startTransition`, `decoding="async"`, defer watermark & `<ScanMap>` ke frame berikutnya). |
| `tests/bmkg-weather-ews.test.ts` & `tests/photo-evidence.test.ts` | Tambah regression test untuk seluruh skenario PHASE 2.0R.2. |

---

## 3. Perbandingan Sebelum vs Sesudah (Dashboard, AI & Photo Evidence)

| Area | Sebelum (R.1 `d839892`) | Sesudah (R.2 Lokal) |
| --- | --- | --- |
| **BMKG saat GPS di luar lahan (1 lahan terverifikasi)** | `Lokasi belum dapat dipastikan` | `Prakiraan untuk Lahan Uji A — Telukjambe, Telukjambe Timur, Karawang` · Sumber: `Lokasi lahan terdaftar` · `adm4 32.15.03.2001` + catatan transparan GPS di luar lahan |
| **Opsi lokasi perangkat** | Tidak ada toggle | Tombol `Gunakan Lokasi Perangkat` (`mode=device_only`, tetap fail-closed bila di luar batas terverifikasi) |
| **Multi-lahan** | Hanya `.limit(1)` | Selector lahan berbasis RLS (`?parcel_id=...`, HTTP `403` jika milik pengguna lain) |
| **Kartu Banjir Petani (tanpa hidrologi)** | Kartu besar + CTA Scan duplikat + teks `Batas umur sementara` | Kartu ringkas `BELUM DIKETAHUI`, 1 CTA Scan di kartu BMKG, tanpa teks umur air legacy |
| **YOLO `NO_DETECTIONS` / EfficientNet `aman`** | Teks singkat, tanpa tombol Laporan Manual saat AI sukses | Penegasan eksplisit **bukan bukti tanaman sehat / bebas hama** + tombol **"Gunakan Laporan Manual"** tepat di bawah hasil AI |
| **Chip kiri-atas `gallery_upload`** | `Lokasi Terdeteksi` | `GPS saat unggah (bukan lokasi foto asli)` |
| **Watermark `Wilayah:` tanpa desa/kecamatan** | Nama lahan dicetak sebagai `Wilayah:` | `Wilayah: Wilayah administratif belum diverifikasi` (nama lahan dipisahkan ke baris `Lahan`) |

---

## 4. Hasil Profiling INP Halaman `/scan` (Chrome 158, Mobile `390×844`, 4× CPU Throttle)

Pengukuran dilakukan dengan `PerformanceObserver` (`event` + `longtask`) pada build produksi lokal (`next start`) dengan alur identik (unggah `sample_rusak_berat.jpg` + pindah tab `Foto Asli` / `Salinan Watermark` / `Deteksi YOLO`):

| Metrik | BEFORE (`d839892`) | AFTER (R.2) | Perubahan |
| --- | ---: | ---: | ---: |
| **Max INP (`interactionId > 0`)** | `56 ms` | **`16 ms`** | **-71%** |
| **Long Tasks (`>50 ms`)** | `1` | **`0`** | **-100%** |
| **Max Long Task Duration** | **`442 ms`** | **`0 ms`** | **-100%** |
| **Total Blocking Time (TBT)** | **`392 ms`** | **`0 ms`** | **-100%** |

> Menghilangkan long task `442 ms` pada frame pemilihan foto mencegah lonjakan INP ~`592 ms` saat pengguna menekan tab atau dropdown lahan di perangkat seluler kelas menengah.

---

## 5. Hasil Pengujian & Verifikasi

- **Unit & Security Tests (`npm run test:security`):** **292/292 PASS**, 0 fail.
- **TypeScript (`./node_modules/.bin/tsc --noEmit --incremental false`):** PASS (0 error).
- **Whitespace / Patch Check (`git diff --check`):** PASS.
- **Next.js Production Build (`npm run build`):** PASS (26/26 routes).
- **Real Chrome 158 Browser E2E (Supabase staging `zlluhylmykoymynnjxjs` + live BMKG):**
  - Desktop `1440×900` & Mobile `390×844`: `0` console/page errors, `0` horizontal overflow.
  - Farmer A dengan GPS di Jakarta (`-6.1647, 106.8454`, di luar poligon Lahan A):
    - Dashboard otomatis menampilkan prakiraan BMKG live untuk **Lahan Uji A** (`32.15.03.2001`, `Lokasi lahan terdaftar`, suhu live `°C`, catatan GPS di luar lahan).
    - Kartu banjir tampil ringkas `BELUM DIKETAHUI` tanpa teks `Batas umur sementara` / `default pusat Karawang`, dan hanya `1` CTA Scan di area utama.
    - Toggle `Gunakan Lokasi Perangkat` → fail-closed `Lokasi Belum Diverifikasi`; toggle kembali `Gunakan Lahan Terdaftar` → pulih ke `32.15.03.2001`.
    - Permintaan lintas pengguna `/api/weather/bmkg?parcel_id=<lahan-farmer-b>` → **HTTP 403**.
  - Halaman `/scan` (gallery upload `sample_rusak_berat.jpg`):
    - Panduan `bukan kolase beberapa gambar` tampil.
    - Chip kiri-atas tampil `GPS saat unggah (bukan lokasi foto asli)`, peringatan galeri tampil, `SHA-256 Asli` dan `SHA-256 Watermark` berbeda dan valid.
    - Catatan: pada runner lokal tanpa `AI_SERVICE_API_KEY` (rahasia khusus Vercel Preview), endpoint `/api/ai/analyze` mengembalikan fallback error sehingga jalur tombol manual sukses-AI (`Gunakan Laporan Manual`) diverifikasi lewat unit test dan akan terverifikasi end-to-end penuh pada Vercel Preview berikutnya.

---

## 6. Bukti Integritas Model & Production Tidak Tersentuh

- **Git Production:** `main` = `d7ffebb`, `origin/main` = `d7ffebb` (tidak berubah).
- **Working Branch:** `staging/yolo-2p` pada `d839892` (perubahan hanya di working tree lokal, belum di-commit/push).
- **Supabase Linked Ref:** `supabase/.temp/project-ref` = `gvrwzfwybvyqlvbqxebe` (tidak ada migrasi/seed/write ke Production).
- **Model ONNX SHA-256 (identik byte-for-byte, threshold YOLO tetap `0.25`):**
  - `ai-service/model/model_v2.onnx`: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`
  - `ai-service/model/detector_yolov8n_rice_v1.onnx`: `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0`
- **File Untracked Pengguna Terjaga:** `004_LoA_Tim Duo Shinobi.pdf` dan `video_arsip/` tetap utuh.

---

## 7. Keputusan Rilis

**KEPUTUSAN: GO (untuk rilis terkontrol Vercel Preview `staging/yolo-2p` berikutnya setelah persetujuan pemilik proyek).**

Seluruh 4 prioritas hotfix telah diimplementasikan lokal, lulus 292/292 test, build 26/26, real Chrome Desktop & Mobile E2E, dan menurunkan long task `/scan` dari `442 ms` menjadi `0 ms` tanpa menyentuh Production, database, autentikasi, atau bobot model AI.
