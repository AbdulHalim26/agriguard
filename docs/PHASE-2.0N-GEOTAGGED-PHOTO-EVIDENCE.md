# PHASE 2.0N — Geotagged Photo Evidence (GPS Camera Watermark & Verifiable Photo Evidence)

**Tanggal:** 26 November 2026
**Status:** `GO — IMPLEMENTED & VERIFIED LOCALLY + STAGING E2E (ZERO MIGRATION, PRODUCTION UNTOUCHED)`
**Target Staging:** `zlluhylmykoymynnjxjs` (`agriguard-staging`, PostgreSQL `17.12`)
**Production (`gvrwzfwybvyqlvbqxebe`):** **STRICTLY UNTOUCHED** (`supabase/.temp/project-ref` terkonfirmasi tetap `gvrwzfwybvyqlvbqxebe`; tidak ada migrasi DB, deploy Vercel/Render, atau perubahan bobot model AI).

---

## 1. Ringkasan Arsitektur & Pemenuhan Kebutuhan

Fitur **GPS Camera Watermark & Verifiable Photo Evidence** diimplementasikan pada alur scanner petani, antrean offline IndexedDB + sinkronisasi idempoten, API/server submission, dan panel pemeriksaan PPL/Dinas:

1. **Snapshot GPS & Waktu Capture Terkunci (`app/(app)/scan/page.tsx`)**
   - Saat foto diambil lewat kamera aplikasi (`capture="environment"` → `camera_capture`) atau diunggah dari galeri (`gallery_upload`), waktu perangkat (`device_captured_at`) dan snapshot GPS (`latitude`, `longitude`, `accuracy_m`, `captured_at`) dibekukan saat capture.
   - Metadata capture tidak pernah ditimpa saat pengiriman online maupun saat sinkronisasi offline tertunda.
2. **Foto Asli Byte-Identical + Salinan Watermark Terpisah (`lib/reports/photo-evidence.ts`)**
   - File foto asli (`photos[0]`) disimpan **tanpa kompresi ulang atau mutasi byte**; SHA-256 asli dihitung langsung dari file asli dan tetap mengikat `damage_reports.photo_hash` serta receipt `ai_analyses`.
   - Salinan watermark (`photos[1]`) dirender terpisah via HTML5 Canvas (`createWatermarkedCopy`) berisi: identitas `AgriGuard` + sumber foto (`Kamera Aplikasi` / `Unggahan Galeri`), tanggal/jam **WIB**, ID lahan (`#<8-char>`), koordinat GPS + akurasi (`±X m` atau `Lokasi belum terverifikasi`), dan nama wilayah terverifikasi dari data lahan/Poktan server.
   - SHA-256 foto asli dan salinan watermark dihitung secara terpisah di klien dan diverifikasi ulang di server.
3. **Pemisahan Sumber Foto, Fallback GPS Ditolak & Disclaimer Kejujuran**
   - Sumber `camera_capture` dibedakan tegas dari `gallery_upload`.
   - Jika izin GPS ditolak/tidak tersedia, pelaporan tetap didukung dengan status `gps_unavailable_unverified` atau `manual_map_pin` (tunduk pada geofence poligon lahan yang ada).
   - Disclaimer eksplisit (`PHOTO_EVIDENCE_DISCLAIMER`) ditampilkan pada halaman scan dan modal pemeriksaan PPL: metadata GPS, waktu perangkat, EXIF, dan watermark bersifat pendukung dokumentasi dan **tidak menjamin keaslian absolut atau bahwa foto bebas manipulasi**.
4. **Dukungan Offline IndexedDB & Idempotent Sync (`lib/offline/db.ts`, `lib/offline/sync-core.ts`)**
   - `OfflineReport` menyimpan `photoBlobs` (`[original, watermarked]`) beserta `captureMetadata` terbekukan dan `clientCreatedAt`.
   - Saat offline, `server_received_at` tidak pernah dipalsukan; server mencatat `server_created_at` / `server_received_at` sendiri saat sinkronisasi diterima di `/api/sync`.
   - Retry idempoten dengan `idempotency_key` sama tidak menduplikasi baris `damage_reports` maupun entri `audit_logs`.
5. **Panel Pemeriksaan PPL/Dinas (`app/(app)/verifikasi/verification-actions.ts`, `components/features/ReportVerification.tsx`)**
   - Menampilkan toggle **Salinan Watermark** / **Foto Asli** (signed URL 1 jam dari bucket privat `photos`).
   - Menampilkan panel **Pemeriksaan Bukti Foto & Lokasi**: status geofence (`Di Dalam Batas Lahan` / `Di Tepi` / `Di Luar` / `Geometri Tidak Valid`), sumber foto, status lokasi, badge `Dikirim Offline`, koordinat laporan, akurasi GPS saat capture, waktu foto perangkat (WIB) vs waktu diterima server (WIB), SHA-256 foto asli, SHA-256 salinan watermark, dan disclaimer keaslian.
   - Bucket `photos` tetap privat dan tidak ada koordinat sensitif yang diekspos pada halaman publik.

---

## 2. Audit Skema Database (Zero Migration Required)

Sebelum implementasi, dilakukan audit skema existing staging (`zlluhylmykoymynnjxjs`) dan kontrak `submitEvidence`:

| Kebutuhan Data | Penyimpanan Saat Ini (Tanpa Migrasi) | Catatan Keamanan & Kompatibilitas |
|---|---|---|
| Foto asli + salinan watermark | `damage_reports.photo_paths text[]` (`[0]` asli, `[1]` watermark) | Sudah mendukung 1–3 file privat di bucket `photos`; kompatibel 100% dengan laporan lama (1 file). |
| Hash foto asli | `damage_reports.photo_hash` | Tetap mengikat `files[0]` (asli), menjaga kontrak receipt `ai_analyses` dan dedupe 24 jam. |
| Metadata bukti foto terverifikasi server (`photo-evidence-v1`) | `audit_logs.meta.photo_evidence` (`action = 'submit_report'`, `entity = 'damage_reports'`) | Ditulis hanya oleh `service_role` pada saat insert laporan; immutable; dapat dibaca PPL/Dinas sesuai RLS `audit_select_officer_scope`. |
| Waktu penerimaan server | `damage_reports.server_created_at` & `photo_evidence.server_received_at` | Selalu berasal dari server, terpisah dari `device_captured_at` / `client_created_at`. |
| Referensi versi geometri | `photo_evidence.geometry_version_id` (`null` sampai D2 aktif) | Siap menerima UUID versi geometri lahan begitu fase D2 diaktifkan. |

**Kesimpulan Audit Skema:** **Tidak diperlukan migrasi database** pada PHASE 2.0N. Untuk fase pasca-kompetisi (opsional, memerlukan persetujuan migrasi terpisah), dapat dipertimbangkan tabel khusus `report_photo_evidence` atau kolom `damage_reports.capture_metadata jsonb` bila diperlukan query/indeks langsung atas `capture_source` atau `watermarked_photo_sha256`.

---

## 3. Perubahan File

- [lib/reports/photo-evidence.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/reports/photo-evidence.ts) — Skema Zod `clientCaptureMetadataSchema`, tipe `ServerPhotoEvidence`, formatter WIB, pembuat baris watermark, generator salinan watermark terpisah (`createWatermarkedCopy`), dan `PHOTO_EVIDENCE_DISCLAIMER`.
- [lib/reports/evidence.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/reports/evidence.ts) — Parsing & validasi opsional `capture_metadata` pada `parseReportInput()` (backwards-compatible).
- [lib/reports/submit.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/reports/submit.ts) — Verifikasi SHA-256 `[0]` asli + `[1]` watermark, pengikatan `ServerPhotoEvidence` ke `report_id`, `user_id`, `lahan_id`, `geofence_status`, `server_received_at`, dan persistensi ke `audit_logs.meta.photo_evidence`.
- [lib/geo.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/geo.ts) — Memperluas tanda tangan `calculateSha256(file: Blob)` agar mendukung `Blob` salinan watermark selain `File`.
- [lib/offline/db.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/offline/db.ts) & [lib/offline/sync-core.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/offline/sync-core.ts) — Menyimpan dan meneruskan `capture_metadata` (`submitted_offline: true`) saat sinkronisasi offline tanpa mengubah timestamp capture atau byte foto asli.
- [app/(app)/scan/page.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/scan/page.tsx) — Mempertahankan foto asli byte-identical, membedakan kamera vs galeri, mengunci snapshot GPS, fallback `gps_unavailable_unverified` / `manual_map_pin`, preview toggle `Salinan Watermark` / `Foto Asli`, kartu metadata + SHA-256 + disclaimer.
- [app/(app)/verifikasi/verification-actions.ts](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/verifikasi/verification-actions.ts) — Menandatangani `photo_paths[1]` sebagai `watermarked_photo_url`, menghitung `geofence_status`, dan mengambil `photo_evidence` dari `audit_logs` dalam cakupan RLS petugas.
- [components/features/ReportVerification.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/ReportVerification.tsx) — Panel pemeriksaan PPL/Dinas + toggle `Salinan Watermark` / `Foto Asli` + badge geofence, sumber foto, offline, akurasi GPS, timestamp perangkat vs server (WIB), SHA-256, dan disclaimer.
- [tests/photo-evidence.test.ts](file:///Users/macbook/Documents/Personal/agriguard/tests/photo-evidence.test.ts) — 6 unit & regression tests baru mencakup seluruh kontrak PHASE 2.0N.

---

## 4. Hasil Verifikasi & Bukti E2E

### 4.1 Automated Checks
- `npm run test:security`: **281/281 PASS** (termasuk 6 test baru di `tests/photo-evidence.test.ts`, 0 gagal).
- `./node_modules/.bin/tsc --noEmit --incremental false`: **PASS** (0 error).
- `git diff --check`: **PASS** (0 whitespace/conflict issues).
- `npm run build`: **PASS** (25/25 routes compiled & type-checked).
- Root Supabase CLI link (`supabase/.temp/project-ref`): tetap `gvrwzfwybvyqlvbqxebe` (tidak berubah).

### 4.2 Real Chrome 158 Desktop (`1440×900`) & Mobile (`390×844`) E2E — Staging `zlluhylmykoymynnjxjs`
*Catatan: Seluruh data akun, lahan, dan foto di bawah adalah data sintetis staging (`[STAGING SYNTHETIC]`), bukan bukti lapangan riil.*

| Skenario E2E | Viewport | Hasil | Bukti Terverifikasi di Staging |
|---|---|---|---|
| Camera capture + GPS snapshot (`±11 m`) + separate watermark + byte-identical original + online submit | Desktop `1440×900` | **PASS** | Report `6f6797a2-106b-4a79-aea5-b97be1da0213`, `photo_paths_count: 2`, `original_sha256_match: true`, `watermark_sha256_distinct: true`, `capture_source: camera_capture`, `location_status: gps_captured`, `geofence_status: INSIDE`, `device_captured_at ≠ server_received_at` |
| Gallery upload + GPS denied (`gps_unavailable_unverified`) + manual pin (`manual_map_pin`) + offline IndexedDB queue + reconnect sync | Mobile `390×844` | **PASS** | Report `16b13be2-ad94-4876-9dae-04f567b34e47`, `photo_paths_count: 2`, `capture_source: gallery_upload`, `location_status: manual_map_pin`, `submitted_offline: true`, waktu foto perangkat `16:58:46 WIB` vs waktu server `16:58:55 WIB` |
| PPL modal inspection panel + toggle `Salinan Watermark` / `Foto Asli` + geofence + SHA-256 + disclaimer | Desktop `1440×900` & Mobile `390×844` | **PASS** | Panel `Pemeriksaan Bukti Foto & Lokasi` tampil penuh pada desktop & mobile, toggle berjalan, `console_errors: []` |

Bukti screenshot tersimpan lokal (gitignored, mode `0600`, bebas OTP/JWT/kunci rahasia) di `.staging/phase2n-evidence/`:
- `01-scan-camera-watermark-desktop.png`
- `02-scan-gps-denied-gallery-mobile.png`
- `03-scan-offline-queued-mobile.png`
- `04-ppl-inspection-desktop.png`
- `05-ppl-inspection-mobile.png`
