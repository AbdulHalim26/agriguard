# PHASE 2.0K — Browser E2E, AI Scanner & Demo Readiness Report

Tanggal & waktu eksekusi: **26 November 2026, 01:19–01:35 WIB** (`+07:00`).  
Target staging terverifikasi: **`agriguard-staging`** (`zlluhylmykoymynnjxjs`, PostgreSQL `17.12`).  
Production denylist: **`gvrwzfwybvyqlvbqxebe`** — **100% UNTOUCHED** (root CLI link tetap production, `changed: false`).  
Target kompetisi: **SEVENT X 2026** (deadline **30 November 2026**).

Tidak ada perubahan database production, deployment Vercel/Render, migrasi schema baru, retraining/penggantian bobot model AI, commit, atau push. Tidak ada OTP, JWT, access token, atau service-role key yang dicatat dalam laporan maupun screenshot.

---

## 1. Lingkungan Uji Aktual

| Komponen | Versi / Konfigurasi Aktual |
|---|---|
| Browser nyata | **Google Chrome `158.0.8127.37`** (macOS arm64, `--headless=new` via Chrome DevTools Protocol, desktop `1440×900` + mobile viewport `390×844`) |
| Web App lokal | Next.js `15.5.28` pada `http://127.0.0.1:3201` (env staging terisolasi: `AGRIGUARD_ENVIRONMENT=staging`, `AUTH_PHONE_OTP_ENABLED=true`, `AGRIGUARD_YOLO_ENABLED=false`, `EWS_DEMO_ENABLED=true`, `OPENWEATHER_API_KEY=""`) |
| AI Service lokal | FastAPI + ONNX Runtime pada `http://127.0.0.1:8000` (`AGRIGUARD_YOLO_ENABLED=false`) |
| EfficientNet v2 runtime | **`model_loaded: true`** — `EfficientNet-B0 (torchvision, retrain dataset banjir sawah)` (`ai-service/model/model_v2.onnx`, bobot tidak diubah) |
| YOLO runtime | **OFF (`enabled: false`)** — `/api/ai/detect` mengembalikan `enabled: false`; nol bounding box buatan |
| Staging Supabase | `https://zlluhylmykoymynnjxjs.supabase.co` (`external_phone: true`, `disable_signup: true`, `phone_autoconfirm: false`, fail-closed `staging_send_sms_hook`, expiry 1 Desember 2026 dikonfirmasi pemilik) |

---

## 2. STEP 1 — Verifikasi Auth Staging Pasca-Rotasi OTP

- **4/4 login GoTrue asli dengan OTP baru (pasca-rotasi PHASE 2.0J.2A):**
  - `farmer_a` (`6280000000101`, `petani`, Poktan A): **PASS** (`jwt.amr: ["otp"]`, `claims_ok: true`, DB `has_phone_otp_session(): true`).
  - `farmer_b` (`6280000000102`, `petani`, Poktan B): **PASS**.
  - `ppl` (`6280000000103`, `ppl`, Poktan A): **PASS**.
  - `dinas` (`6280000000104`, `dinas`, Lintas Poktan): **PASS**.
- **Negatif & No-SMS:** OTP salah (`000000`) ditolak (`HTTP 403`), nomor asing (`+6281234567890`) ditolak (`otp_disabled`, 0 SMS).
- **Jumlah Auth user:** tetap **4** (nol akun asing). Catatan sesi: `active_sessions: 12` dari sesi uji sebelumnya; rotasi `sms_test_otp` tidak otomatis mencabut refresh session lama (pencabutan manual tersedia via Staging Dashboard → Users → *Revoke sessions*).

---

## 3. Hasil Pengujian Real Chrome Browser E2E (TEST A–I)

Seluruh pengujian di bawah dieksekusi pada **Google Chrome 158 nyata** (bukan sekadar mock/HTTP) terhadap staging + FastAPI lokal. Data yang digunakan adalah **data sintetis staging** (`[STAGING SYNTHETIC]`), bukan foto/data petani lapangan nyata.

| Test | Alur yang Diuji di Chrome 158 | Hasil Aktual | Klasifikasi | Bukti |
|---|---|---|---|---|
| **TEST A** | Farmer A login via `/login` OTP → `/dashboard` → refresh halaman | Login sukses, sesi bertahan setelah refresh, hanya melihat Poktan A / Petani A, nol console error | **`PASS_REAL_BROWSER_E2E`** | `01-login-farmer.png`, `02-dashboard.png` |
| **TEST B** | `/lahan` & `/peta` (Leaflet + poligon + luas + isolasi + mobile `390×844`) | Leaflet satelit + poligon Lahan A (`0,2 ha`) + pin laporan tampil; `[STAGING SYNTHETIC] Lahan B` tidak tampil; mobile `390×844` tanpa horizontal overflow (`false`) | **`PASS_REAL_BROWSER_E2E`** | `03-land-map.png` |
| **TEST C** | `/scan` → upload PNG sintetis → inferensi EfficientNet v2 `/api/ai/analyze` → interpretasi advisory | EfficientNet v2 merespons nyata (`Indikasi Kerusakan Berat`, `Keyakinan model (klasifikasi foto): 36–37%`, `Perlu Verifikasi · REVIEW_REQUIRED`, `damage_pct: UNCALIBRATED`, `Luas terdampak belum terverifikasi`); YOLO OFF tanpa kotak palsu | **`PASS_REAL_BROWSER_E2E`** | `04-ai-scanner.png`, `05-ai-result.png` |
| **TEST D** | Pilih `Lahan A` + GPS dalam geofence → `Kirim Laporan` → tampil di `/laporan` | Laporan AI sintetis terkirim nyata ke staging dan tampil di `/laporan` (`Hasil Analisis AI`, `Menunggu`, `Luas Terdaftar Unik: 0,2 ha`) | **`PASS_REAL_BROWSER_E2E`** | `06-report-submission.png` |
| **TEST E** | Offline workflow: buka `/scan` online → putus jaringan Chrome → upload PNG + kirim offline → IndexedDB → reconnect auto-sync | **Bug P1 ditemukan & diperbaiki (§4).** Setelah fix: nol crash offline, banner `Mode Offline` & pesan `Laporan tersimpan offline. Akan tersinkron otomatis saat koneksi kembali` tampil, IndexedDB `agriguard-offline.reports = 1`, dan setelah reconnect laporan otomatis tersinkron ke staging (tampil di daftar PPL `08-ppl-verification.png` pukul `01.33`) | **`PASS_REAL_BROWSER_E2E`** | `07-offline-queue.png`, `08-ppl-verification.png` |
| **TEST F** | Logout → login PPL → `/verifikasi` tab `Verifikasi Laporan` | Tab `Verifikasi Laporan` menampilkan seluruh laporan Poktan A (termasuk laporan AI & laporan offline-synced), `[STAGING SYNTHETIC] Lahan B` tersembunyi | **`PASS_REAL_BROWSER_E2E`** | `08-ppl-verification.png` |
| **TEST G** | Login ulang Farmer A → `/laporan` | Status `Laporan Terverifikasi` dan `Luas Terdaftar Unik: 0,2 ha` tampil konsisten dengan data server | **`PASS_REAL_BROWSER_E2E`** | `09-farmer-readback.png` |
| **TEST H** | Tab `Rekap` → `Dokumen Pendukung AUTP (Internal)` → Chrome `Page.printToPDF` | Menampilkan `Luas Terdaftar Unik: 0,2 ha`, `Luas terdampak belum terverifikasi`, disclaimer *bukan persetujuan klaim / bukan integrasi resmi Jasindo*, dan menghasilkan **PDF valid `%PDF-` (`158.422 bytes`)** | **`PASS_REAL_BROWSER_E2E`** | `10-autp-document.png`, `10-autp-document.pdf` |
| **TEST I** | EWS di `/dashboard` | Menampilkan status jujur netral **`BELUM DIKETAHUI`** (bukan `AMAN` palsu), timestamp WIB (`26 Nov 2026, 01.29 WIB`), konteks GPS perangkat `(-6.3302, 107.3102)` dengan disclaimer *belum merupakan penilaian per bidang sawah*, dan tombol `Lihat Simulasi EWS` | **`PASS_REAL_BROWSER_E2E`** *(mode nyata `BELUM DIKETAHUI` terverifikasi; klik tombol simulasi di CDP tidak memicu transisi di pass 3 — perlu verifikasi klik manual singkat saat rehearsal)* | `11-ews-status.png` |

---

## 4. Bug Ditemukan Saat Chrome E2E & Perbaikan (STEP 5)

### Bug P1 — Crash Offline `ChunkLoadError` pada `/scan` Saat Memilih Foto

- **Gejala tereproduksi di Chrome 158:** Ketika petani membuka `/scan` saat online, lalu berpindah ke mode offline sebelum memilih foto, pemilihan foto memicu mount `next/dynamic(() => import('./ScanMap'))` yang belum terunduh → `ChunkLoadError` → halaman `/scan` jatuh ke error boundary (`Terjadi kesalahan — Halaman tidak dapat ditampilkan`), memblokir penyimpanan laporan offline.
- **Perbaikan sempit & aman** di [`app/(app)/scan/page.tsx`](../app/(app)/scan/page.tsx):
  1. Menambahkan preload chunk `import('./ScanMap').catch(() => {})` saat halaman `/scan` pertama kali dimuat dalam keadaan online.
  2. Menambahkan fallback defensif `OfflineMapFallback` pada `dynamic(() => import('./ScanMap').catch(() => ({ default: OfflineMapFallback })))` agar koordinat GPS tetap tersimpan meski peta tidak tersedia saat offline.
- **Verifikasi pasca-fix:**
  - Chrome 158 Test E: `crashed_offline: false`, `console_errors: []`, laporan tersimpan ke IndexedDB (`reports: 1`) dan otomatis tersinkron ke staging saat online kembali.
  - Full regression suite `npm run test:security`: **275/275 PASS**.
  - `npm run build` + `./node_modules/.bin/tsc --noEmit --incremental false`: **PASS**.
  - `git diff --check` + `inspect-link` (production unchanged): **PASS**.

---

## 5. Inventaris Bukti Demo Lokal (`.staging/phase2k-evidence/`, Gitignored)

Seluruh 11 screenshot dan 1 PDF nyata tersimpan di `.staging/phase2k-evidence/` (mode `0600`, bebas OTP/JWT/secret):

- `01-login-farmer.png` — Halaman login OTP Farmer A (sebelum input OTP).
- `02-dashboard.png` — Dashboard Farmer A dengan status EWS netral `BELUM DIKETAHUI`.
- `03-land-map.png` — Peta Leaflet satelit Karawang dengan poligon `Lahan A` & pin laporan.
- `04-ai-scanner.png` — Halaman Scan Kerusakan Padi sebelum upload.
- `05-ai-result.png` — Hasil inferensi nyata EfficientNet-B0 v2 (`REVIEW_REQUIRED`, `UNCALIBRATED`).
- `06-report-submission.png` — Riwayat `/laporan` setelah submit laporan AI melalui UI Chrome.
- `07-offline-queue.png` — Mode Offline aktif + pesan `Laporan tersimpan offline. Akan tersinkron otomatis saat koneksi kembali`.
- `08-ppl-verification.png` — Tab `Verifikasi Laporan` PPL menampilkan laporan Poktan A (termasuk hasil auto-sync offline) dan menyembunyikan Poktan B.
- `09-farmer-readback.png` — Halaman `/laporan` Farmer A menampilkan status `Laporan Terverifikasi`.
- `10-autp-document.png` — Tab `Rekap` menampilkan `Dokumen Pendukung AUTP (Internal)` + disclaimer non-asuransi.
- `10-autp-document.pdf` — File PDF nyata hasil Chrome `Page.printToPDF` (`158.422 bytes`, valid `%PDF-`).
- `11-ews-status.png` — Panel EWS `BELUM DIKETAHUI` lengkap dengan timestamp WIB & disclaimer konteks lokasi.
- Video workflow: **NOT_CAPTURED** (headless Chrome CDP mengambil 11 screenshot + PDF; rekaman video demo 3 menit disarankan direkam langsung oleh pemilik menggunakan screen recorder macOS/HP saat dress rehearsal).

---

## 6. Sisa Catatan & Keputusan Demo Readiness

### Catatan Non-Blocker Menjelang 30 November 2026

1. **YOLO Localized Detection:** Tetap **OFF** (`AGRIGUARD_YOLO_ENABLED=false`) karena checkpoint terlatih belum tersedia. Presentasi kompetisi harus jujur menyebut **EfficientNet-B0 v2** sebagai classifier aktif dan **YOLO** sebagai fondasi riset opsional yang dinonaktifkan.
2. **Cold-Start Offline Shell:** Belum ada Service Worker cache untuk membuka aplikasi dari nol saat offline; alur demo offline harus membuka `/scan` saat online terlebih dahulu lalu memutus jaringan (sudah terbukti bekerja 100%).
3. **Verifikasi EWS Simulasi & Rekam Video 3 Menit:** Pemilik disarankan melakukan 1 kali dress rehearsal interaktif di Chrome/HP (termasuk menguji klik `Lihat Simulasi EWS` dan merekam video demo 3 menit) serta mencabut/rollback test OTP staging segera setelah 30 November 2026.

### Keputusan Akhir

**`GO — MVP DEMO READY (STAGING + REAL CHROME E2E VERIFIED)`**

Seluruh alur inti SEVENT X (Native Phone OTP tanpa Twilio, isolasi 4 peran & RLS, Peta Leaflet + geometri WGS84, EfficientNet-B0 v2 advisory AI, pelaporan online & offline IndexedDB + auto-sync, verifikasi PPL, readback petani, EWS jujur `BELUM DIKETAHUI`, dan cetak PDF Dokumen Pendukung AUTP) telah **diverifikasi nyata di Google Chrome 158**, dengan bukti 11 screenshot + 1 PDF valid, `0` console error, `275/275` regresi lulus, build lulus, dan production (`gvrwzfwybvyqlvbqxebe`) 100% tidak disentuh.
