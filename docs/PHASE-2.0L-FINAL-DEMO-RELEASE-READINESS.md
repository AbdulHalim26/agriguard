# PHASE 2.0L — Final Dress Rehearsal & Release Preflight

Tanggal & waktu: **26 November 2026, 01:40–01:45 WIB** (`+07:00`).  
Target kompetisi: **SEVENT X 2026** (deadline **30 November 2026**).  
Target staging terverifikasi: **`agriguard-staging`** (`zlluhylmykoymynnjxjs`, PostgreSQL `17.12`).  
Production denylist: **`gvrwzfwybvyqlvbqxebe`** — **100% UNTOUCHED** (root CLI link tetap production, `changed: false`).

Tidak ada migrasi production, tidak ada deployment Vercel/Render, tidak ada retraining model AI, dan tidak ada commit atau push pada fase ini. Tidak ada OTP, JWT, access token, atau secret yang ditampilkan dalam video, screenshot, maupun dokumen ini.

---

## 1. TASK 1 — Final 3-Minute Dress Rehearsal & Video Status

Direkam langsung dari **Google Chrome `158.0.8127.37` nyata** terhadap Next.js (`http://127.0.0.1:3201`), FastAPI EfficientNet-B0 v2 (`http://127.0.0.1:8000`), dan Supabase Staging (`zlluhylmykoymynnjxjs`):

| Artefak Video | Nilai Aktual |
|---|---|
| Path lokal (gitignored, mode `0600`) | `.staging/phase2l-evidence/agriguard-demo-rehearsal.mp4` |
| Durasi aktual | **`165,8 detik` (`2 menit 46 detik`)** — tepat di dalam target demo **≤ 3 menit** |
| Resolusi & Codec | `1280×720`, H.264 (`libx264`, `yuv420p`, `+faststart`), `2.453` frame Chrome nyata |
| Ukuran file | **`2.793.620 bytes` (~2,66 MiB)** |
| Keamanan visual | Input `#code` di-mask sebagai `password` (`••••••`) pada seluruh frame — **0 digit OTP, 0 JWT, 0 API key** terekspos |
| Console errors | **`0`** (`[]`) |

**Alur 10-langkah yang terekam utuh & lulus:**
1. Farmer A native Phone OTP login (tanpa Twilio, OTP di-mask).
2. Dashboard status jujur `BELUM DIKETAHUI` → klik **`Lihat Simulasi EWS`** → banner **`SIMULASI`** tampil jelas dengan label *"Angka contoh tidak digunakan untuk menyatakan risiko nyata"* (`11-ews-simulasi.png`) → kembali ke data nyata.
3. Peta Leaflet satelit Karawang (`/peta`) menampilkan poligon `[STAGING SYNTHETIC] Lahan A` & pin laporan.
4. AI Scanner (`/scan`) upload PNG sintetis → inferensi nyata **EfficientNet-B0 v2** → kartu advisory `REVIEW_REQUIRED` & `damage_pct: UNCALIBRATED`.
5. Pemilihan `Lahan A` + GPS geofence → `Kirim Laporan`.
6. Mode Offline Chrome → banner oranye `Mode Offline` → simpan laporan ke **IndexedDB** (`Laporan tersimpan offline`) → reconnect online → auto-sync otomatis ke staging.
7. Login PPL → `/verifikasi` tab `Verifikasi Laporan` (menampilkan laporan Poktan A, menyembunyikan Poktan B).
8. Tab `Rekap` → `Dokumen Pendukung AUTP (Internal)` (`Luas Terdaftar Unik: 0,2 ha`, `Luas terdampak belum terverifikasi`, disclaimer non-asuransi) + cetak **`10-autp-document.pdf`**.
9. Login ulang Farmer A → `/laporan` readback status `Laporan Terverifikasi`.

---

## 2. TASK 2 — Device & Browser Verification Matrix

| Perangkat / Viewport | Status | Hasil Aktual |
|---|---|---|
| **Desktop Google Chrome `158.0.8127.37`** (`1440×900` & `1280×720`, macOS arm64) | **`PASS_REAL_BROWSER_E2E`** | Login persistence, navigasi, upload foto, Leaflet satelit/poligon, EfficientNet v2, offline IndexedDB + auto-sync, PPL verification, AUTP PDF (`158 KiB`, `%PDF-`), EWS `BELUM DIKETAHUI` & `SIMULASI`, `0` console error |
| **Mobile Viewport Chrome Emulation** (`390×844`, `deviceScaleFactor: 2`, touch) | **`PASS_REAL_BROWSER_E2E`** (layout `/lahan`) | `mobile_horizontal_overflow: false` |
| **Perangkat HP Android / iOS Fisik** (kamera fisik, GPS satelit lapangan, sentuh layar nyata) | **`UNVERIFIED`** | Belum diuji pada perangkat seluler fisik; direkomendasikan 1 kali cek cepat oleh pemilik sebelum hari presentasi |

---

## 3. TASK 3 — AI Readiness & Model Provenance

| Model | Status Aktual | Bukti Terverifikasi |
|---|---|---|
| **EfficientNet-B0 v2** (`ai-service/model/model_v2.onnx`, 3 kelas visual) | **OPERASIONAL & TERVERIFIKASI** (Lokal `:8000` + Live Render) | SHA-256 `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f` (unchanged); Render `/health` `200` (`model_loaded: true`), `/model-info` `200`; lokal diuji nyata di Chrome (`/api/ai/analyze` → `REVIEW_REQUIRED`, `UNCALIBRATED`). Bobot tidak diubah. |
| **YOLO Localized Detector** | **OFF / CHECKPOINT_NOT_LOCATED** | `AGRIGUARD_YOLO_ENABLED=false`; audit read-only `scripts/ai-artifact-audit.py` tidak menemukan trained YOLO `.pt`/ONNX di workspace; `/api/ai/detect` mengembalikan `enabled: false`; nol kotak deteksi buatan. |
| **Batas Klaim AI** | **TERJAGA** | Keyakinan model disajikan sebagai *klasifikasi foto* (bukan persentase kerusakan lahan atau keputusan klaim AUTP); `damage_pct` berlabel `UNCALIBRATED`. |

---

## 4. TASK 4 — Release Preflight (Local vs Published Vercel/Render vs Staging/Production)

### A. Perbandingan Aktual

| Lapisan | Working Tree Lokal | Published Saat Ini | Selisih / Implikasi |
|---|---|---|---|
| **Web (Vercel)** | `PHASE 0A–2.0K` (native OTP, EWS 2.0B, advisory 2.0C, geometri D1, P0 origin & verification fixes, P1 offline `ScanMap` preload) | `https://agriguard-five.vercel.app` (commit `d7ffebb`): `/api/ai/detect` **`404`**, `/api/auth/session` **`404`** | Production Vercel masih memakai build lama; **jangan** mendorong perubahan ke production sebelum cutover DB production terencana. |
| **AI Service (Render)** | EfficientNet v2 + endpoint `/predict/detect` (YOLO OFF) | `https://agriguard-ai-96hh.onrender.com`: `/health` **`200`** (`model_loaded: true`), `/model-info` **`200`**, `/predict` aktif (tanpa `/predict/detect`) | Render existing **sudah kompatibel** dengan classifier EfficientNet v2 pada web staging selama `AGRIGUARD_YOLO_ENABLED=false`! |
| **Database Staging** | 10 migrasi v3 (`0001..0012`) + fail-closed `staging_send_sms_hook` + 4 synthetic users + seed | `zlluhylmykoymynnjxjs` (PG `17.12`) | **100% sinkron** dengan kode aplikasi terbaru. |
| **Database Production** | Tidak disentuh | `gvrwzfwybvyqlvbqxebe` (PG `17.11`, skema legacy tanpa `0010`/`0011`/`0012`, Phone Auth OFF) | **STRICTLY FORBIDDEN** — jangan arahkan Vercel Preview ke production! |

### B. Kelayakan & Rencana Vercel Staging/Preview Terpisah (BELUM DIEKSEKUSI)

**FEASIBLE & AMAN** hanya jika memakai **project Vercel terpisah** (`agriguard-staging`) atau branch preview khusus yang seluruh environment variable-nya dipin ke **`zlluhylmykoymynnjxjs`** (bukan project production `agriguard`):

- **Wajib terpisah dari Production:**
  - `AGRIGUARD_ENVIRONMENT=staging`
  - `AGRIGUARD_STAGING_PROJECT_REF=zlluhylmykoymynnjxjs`
  - `NEXT_PUBLIC_SUPABASE_URL=https://zlluhylmykoymynnjxjs.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging_anon_key>`
  - `SUPABASE_SERVICE_ROLE_KEY=<staging_service_role_key>` *(Server-only, JANGAN gunakan key production)*
  - `NEXT_PUBLIC_APP_URL=https://<staging-preview-domain>`
  - `AI_API_URL=https://agriguard-ai-96hh.onrender.com` *(Render classifier v2 existing, stateless)*
  - `AUTH_PHONE_OTP_ENABLED=true`, `AGRIGUARD_YOLO_ENABLED=false`, `EWS_DEMO_ENABLED=true`, `OPENWEATHER_API_KEY=""`
  - Tambahkan `https://<staging-preview-domain>` ke `additional_redirect_urls` pada staging Auth saja.
- **Perintah deploy (hanya setelah persetujuan rilis terpisah oleh pemilik):**
  1. Pastikan working tree sudah direview & di-commit ke branch staging khusus (bukan langsung push ke `main` production).
  2. Jalankan `node --env-file=.env.staging.local --import ./tests/register.mjs scripts/prepare-staging.ts check-env` untuk memastikan nol key/ref production.
  3. Deploy ke project Vercel staging terpisah (`vercel --prod` pada project `agriguard-staging`, atau `vercel` preview pada branch staging).
- **Rollback cepat:**
  - Web staging: `vercel rollback` pada project staging / nonaktifkan `AUTH_PHONE_OTP_ENABLED=false`.
  - Staging Auth pasca-kompetisi (wajib setelah 30 Nov 2026): jalankan rollback config dari `.staging/phase2j2-auth-config/backup-original.toml` + `supabase/staging/staging-send-sms-hook-rollback.sql` + *Revoke sessions* pada 4 akun sintetis.

---

## 5. TASK 5 — Final Evidence Package & Presentation Talking Points

Paket bukti bersih tersimpan di **`.staging/phase2l-evidence/`** (gitignored, mode `0600`, bebas secret/OTP):

- **Video demo 2m46s:** `agriguard-demo-rehearsal.mp4` (`1280×720`, `2,66 MiB`, OTP masked `••••••`).
- **12 screenshot tersanitasi:** `01-login-farmer.png` s.d. `11-ews-status.png` + `11-ews-simulasi.png`.
- **Dokumen PDF AUTP nyata:** `10-autp-document.pdf` (`158 KiB`, valid `%PDF-`).
- **Ringkasan hasil tes:** `275/275` Node security/unit tests PASS, `73/73` Python AI tests PASS, `npm run build` + `tsc --noEmit` PASS, `9/9` Chrome 158 E2E workflows PASS (`0` console error).

### Poin Presentasi Kompetisi SEVENT X (Jujur & Kuat)

1. **Arsitektur Keamanan Nyata:** Native Supabase Phone OTP (`amr: otp` + pinned phone), PostgreSQL 17 RLS ketat lintas peran (Petani A / Petani B / PPL / Dinas), hardening default privileges & PG 17 `MAINTAIN`, serta private Storage dengan signed URL.
2. **EWS Jujur (`Truthful States`):** Tidak pernah menampilkan `AMAN` palsu saat data cuaca/tinggi air belum tersedia (`BELUM DIKETAHUI`), dengan mode **`SIMULASI`** berlabel eksplisit untuk demo.
3. **AI Advisory & Geometri Lahan:** EfficientNet-B0 v2 ONNX sebagai alat triage awal (`REVIEW_REQUIRED`, `UNCALIBRATED`) dengan validasi topologi poligon + luas geodesik WGS84 (`geographiclib-geodesic`), bukan pengganti verifikasi manusia.
4. **Offline-First & Dokumen Pendukung AUTP:** Antrian IndexedDB dengan idempotency key + auto-sync saat koneksi kembali, verifikasi transaksional PPL + audit trail, serta dokumen pendukung AUTP yang memisahkan *luas terdaftar unik* dari *luas terdampak belum terverifikasi*.
5. **Transparansi Data Demo:** Seluruh akun (`[STAGING SYNTHETIC]`), poligon, dan foto demo diberi label jelas sebagai data uji staging sintetis.

---

## 6. Sisa Isu P0/P1 & Keputusan GO / NO-GO

- **Remaining P0:** **0** (untuk live demo lokal + staging terisolasi).
- **Remaining P1:**
  1. Uji perangkat HP Android/iOS fisik (kamera & GPS lapangan nyata) masih `UNVERIFIED`.
  2. Cold-start offline shell (Service Worker) belum ada — buka `/scan` saat online sebelum memutus jaringan saat demo.
  3. YOLO localized detector tetap OFF (tanpa checkpoint terlatih).
- **Keputusan Akhir:**
  - **`GO — LIVE COMPETITION DEMO READY (Local Next.js :3201 + FastAPI :8000 + Hosted Staging zlluhylmykoymynnjxjs)`**, didukung video backup `2m46s` (`agriguard-demo-rehearsal.mp4`), 12 screenshot, dan PDF AUTP nyata.
  - **`CONDITIONAL GO — Hosted Vercel Staging Preview`**: Hanya melalui project/env Vercel terpisah yang dipin ke `zlluhylmykoymynnjxjs` setelah persetujuan rilis terpisah dari pemilik.
  - **`NO-GO — Production Cutover Sekarang`**: Production (`gvrwzfwybvyqlvbqxebe` & `agriguard-five.vercel.app`) tetap tidak disentuh hingga pasca-kompetisi dengan rencana cutover akun lama & migrasi terpisah.
