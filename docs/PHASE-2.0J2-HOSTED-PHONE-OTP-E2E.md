# PHASE 2.0J.2 — Hosted Staging Phone OTP Activation & Real Authenticated E2E

Tanggal & waktu eksekusi: **25 November 2026, 12:35–13:16 WIB** (`+07:00`).  
Target staging terverifikasi: **`agriguard-staging`** (`zlluhylmykoymynnjxjs`, `ap-southeast-1`, PostgreSQL **`17.12`**).  
Production denylist: **`gvrwzfwybvyqlvbqxebe`** — **100% UNTOUCHED** (root CLI link tetap production, `changed: false`).

**Final Decision:** **`PHASE 2.0J.2 — AUTH VERIFIED, BROWSER E2E STILL UNVERIFIED`**

Tidak ada kredensial Twilio (asli maupun palsu), tidak ada SMS berbayar/nyata yang dikirim, tidak ada migrasi ulang/DB reset, tidak ada perubahan model AI/dataset, tidak ada deployment Vercel/Render, dan tidak ada commit atau push. Tidak ada OTP, access token, key, atau signed URL token yang dicatat di file ini.

---

## 1. Pre-Execution Safety Gate & Backup Konfigurasi Auth

- Target live metadata terkonfirmasi via `supabase projects list`: `zlluhylmykoymynnjxjs` / `agriguard-staging` / `ap-southeast-1` / `ACTIVE_HEALTHY` / `17.12.0.000`.
- Isolated workspace `.staging/phase2i3-plan-v3/workspace` lulus `verify-workspace` (`plan_sha256` cocok, `production_link_changed: false`).
- Backup konfigurasi Auth asli sebelum perubahan diambil melalui `supabase config pull --project-ref zlluhylmykoymynnjxjs --workdir .staging/phase2j2-auth-config`:
  - Full backup privat: `.staging/phase2j2-auth-config/backup-original.toml` (mode `0600`, gitignored), SHA-256: `b1c302f9332c687ef087a032044f00a59b29213504f92d1f37df663a79af03b1`.
  - Redacted backup: `.staging/phase2j2-auth-config/backup-redacted.toml` (mode `0600`, gitignored).
- 4 kode OTP 6 digit acak secara kriptografis (`crypto.randomInt`) dibuat dan disimpan **hanya** di `.staging/phase2j2-auth-config/test-otps.local.json` (mode `0600`, gitignored), divalidasi oleh `buildStagingPhoneAuthPatch()` (nol field Twilio).

---

## 2. Pemasangan Fail-Closed Send SMS Hook & Aktivasi Phone Auth

### A. PostgreSQL Hook (`supabase/staging/staging-send-sms-hook.sql`)

Dipasang ke `zlluhylmykoymynnjxjs` via isolated workspace, lalu diaudit `READ ONLY`:

| Atribut | Hasil Aktual PG 17.12 |
|---|---|
| Signature & Owner | `public.staging_send_sms_hook(jsonb)`, owner `postgres`, `SECURITY INVOKER`, `search_path=""` |
| `EXECUTE` `supabase_auth_admin` + `USAGE public` | **`true`** / **`true`** |
| `EXECUTE` `anon` / `authenticated` / `service_role` | **`false`** / **`false`** / **`false`** |
| Post-install `assert-api-access.sql` | **`PASS_METADATA_ONLY_NATIVE_E2E_NOT_TESTED`** |

### B. Perubahan Konfigurasi Auth Staging (Redacted Diff)

Diterapkan via `supabase config push --project-ref zlluhylmykoymynnjxjs --workdir .staging/phase2j2-auth-config` (Management API resmi, nol field Twilio):

| Properti | Sebelum | Sesudah (Verified Live Readback) |
|---|---|---|
| `external_phone` (`auth.sms.enable_signup`) | `false` | **`true`** |
| `disable_signup` (`auth.enable_signup`) | `false` | **`true`** |
| `phone_autoconfirm` (`auth.sms.enable_confirmations`) | `false` | **`false`** *(sempat `true` pada push pertama karena inversi flag TOML, langsung diperbaiki & diverifikasi `false`)* |
| `auth.hook.send_sms.enabled` | `false` | **`true`** |
| `auth.hook.send_sms.uri` | `null` | **`pg-functions://postgres/public/staging_send_sms_hook`** |
| `auth.sms.test_otp` (4 nomor sintetis `6280000000101..104`) | `null` | **`[REDACTED]`** (4 OTP 6 digit acak) |
| `auth.site_url` / `additional_redirect_urls` | `http://localhost:3000` / `[]` | **`http://localhost:3201`** / **`["http://127.0.0.1:3201"]`** |

*Catatan `sms_test_otp_valid_until`:* `supabase config push` CLI v2.120.0 tidak memetakan `test_otp_valid_until` dari TOML. Pemilik tetap wajib mengatur **Test OTPs Valid Until = `2026-12-01`** di Staging Dashboard atau menjalankan prosedur rollback (§6) segera setelah 30 November 2026.

---

## 3. Hasil Login GoTrue 4 Peran & Uji Negatif (No-SMS)

Seluruh 4 akun diuji langsung terhadap hosted GoTrue (`https://zlluhylmykoymynnjxjs.supabase.co`):

| Alias | Phone | `signInWithOtp` + `verifyOtp` | `getUser` & ID Match | `jwt.role` / `jwt.amr` | `hasPhoneOtpClaims` | DB `has_phone_otp_session()` | Profile Role & Scope | Klasifikasi |
|---|---|---|---|---|---|---|---|---|
| `farmer_a` | `6280000000101` | **OK** | **MATCH** | `authenticated` / `["otp"]` | **`true`** | **`true`** | `petani` / Poktan A | **`PASS_REAL_AUTHENTICATED_E2E`** |
| `farmer_b` | `6280000000102` | **OK** | **MATCH** | `authenticated` / `["otp"]` | **`true`** | **`true`** | `petani` / Poktan B | **`PASS_REAL_AUTHENTICATED_E2E`** |
| `ppl` | `6280000000103` | **OK** | **MATCH** | `authenticated` / `["otp"]` | **`true`** | **`true`** | `ppl` / Poktan A | **`PASS_REAL_AUTHENTICATED_E2E`** |
| `dinas` | `6280000000104` | **OK** | **MATCH** | `authenticated` / `["otp"]` | **`true`** | **`true`** | `dinas` / Lintas Poktan | **`PASS_REAL_AUTHENTICATED_E2E`** |

**Uji Negatif & Verifikasi No-SMS:**
- Wrong OTP (`000000`) untuk `farmer_a` → **REJECTED** (`HTTP 403`).
- Nomor asing (`+6281234567890`) `shouldCreateUser: false` → **REJECTED** (`otp_disabled`, 0 SMS).
- Nomor asing (`+6281234567890`) `shouldCreateUser: true` → **REJECTED** (`signup_disabled`, 0 SMS).
- Cross-account claim mismatch (`farmer_a` token vs `farmer_b` ID/phone) → **REJECTED** (`false`).
- Revoked session (`signOut()` → `getUser(revokedToken)`) → **REJECTED**.

---

## 4. Real Authenticated HTTP RLS & Storage E2E (Per-User GoTrue JWT)

Dieksekusi langsung melalui HTTPS ke PostgREST & Storage staging memakai **JWT asli masing-masing peran** (tanpa `service_role`):

| Peran | Pengujian Positif & Negatif | Hasil Aktual | Klasifikasi |
|---|---|---|---|
| **Farmer A** | Baca `lahan` (`1`: Lahan A), baca `damage_reports` (`2`: 401/402, 403 tidak terlihat), `audit_logs` (`0`), update `Lahan B` (`0` rows), eskalasi `profiles.role` (ditolak), baca `poktan.invite_code` (ditolak), self-`verify_damage_report` (ditolak), signed URL foto sendiri (`HTTP 200`), signed URL foto Farmer B (ditolak) | **11/11 PASS** | **`PASS_REAL_AUTHENTICATED_E2E`** |
| **Farmer B** | Baca `lahan` (`1`: Lahan B), baca `damage_reports` (`1`: 403), hijack `owner_id` Lahan A (ditolak), edit `name` Lahan A (`0` rows), signed URL foto Farmer A (ditolak), signed URL foto sendiri (`HTTP 200`) | **6/6 PASS** | **`PASS_REAL_AUTHENTICATED_E2E`** |
| **PPL (Poktan A)** | Baca `damage_reports` (`2`: Poktan A saja, 403 tidak terlihat), edit `Lahan A` (`0` rows), `verify_damage_report` lintas Poktan 403 (ditolak), signed URL foto Poktan A (`HTTP 200`), signed URL foto Poktan B (ditolak) | **6/6 PASS** | **`PASS_REAL_AUTHENTICATED_E2E`** |
| **Dinas** | Baca semua `damage_reports` (`3`), semua `lahan` (`2`), `audit_logs` (`1`), signed URL foto Poktan B (`HTTP 200`) | **4/4 PASS** | **`PASS_REAL_AUTHENTICATED_E2E`** |

---

## 5. Rehearsal Aplikasi Next.js Lokal (Port `3201`, Staging Env) & Report Workflow E2E

Dijalankan terhadap `next dev --hostname 127.0.0.1 --port 3201` dengan environment staging eksplisit (`AGRIGUARD_ENVIRONMENT=staging`, `AUTH_PHONE_OTP_ENABLED=true`, `AGRIGUARD_YOLO_ENABLED=false`, `EWS_DEMO_ENABLED=false`, nol variabel production):

| Skenario | Hasil Aktual | Klasifikasi |
|---|---|---|
| Farmer A login via `POST /api/auth/otp` → `/api/auth/session` (`200`, `userId` cocok) → `/dashboard` (`200`) → `/lahan` (`200`) → `/api/lahan` (`200`, `count: 1`) | **PASS** | **`PASS_REAL_AUTHENTICATED_E2E`** (HTTP App Routes) |
| Farmer A akses `/verifikasi` | **`HTTP 307` redirect ke `/dashboard`** (ditolak middleware) | **`PASS_REAL_AUTHENTICATED_E2E`** |
| Farmer A submit laporan sintetis ke-4 via `POST /api/sync` (`manual`, `rusak_ringan`, PNG baru valid, `idempotency_key: 50000000-0000-4000-8000-000000000599`) | **`HTTP 200`**, `id: d4ef116a-1505-4228-8104-806f778b105b` | **`PASS_REAL_AUTHENTICATED_E2E`** |
| Replay `POST /api/sync` dengan `idempotency_key` sama | **`HTTP 200`**, **`replay_same_report_id: true`** (tanpa duplikat) | **`PASS_REAL_AUTHENTICATED_E2E`** |
| PPL login via `POST /api/auth/otp` → `/verifikasi` (`200`) → `verify_damage_report(d4ef116a-...)` dengan catatan `[PHASE 2.0J.2 SYNTHETIC E2E]` | **PASS** (`error: null`) | **`PASS_REAL_AUTHENTICATED_E2E`** |
| Farmer A readback laporan `d4ef116a-...` + PPL cek `audit_logs` | `is_verified: true`, `verified_by === ppl`, `has_note: true`, `audit_verify_row_count: 1` (`verify_report`, `actor_id = ppl`) | **`PASS_REAL_AUTHENTICATED_E2E`** |
| Interactive browser UI (Leaflet, kamera, IndexedDB offline restart, cetak PDF AUTP) | Belum diuji di Chrome/Android nyata (tidak ada Playwright/browser automation di mesin ini) | **UNVERIFIED** |

---

## 6. Post-Activation Security Check & Rollback Readiness

| Pemeriksaan | Hasil Aktual |
|---|---|
| `assert-api-access.sql` pada PG 17.12 staging | **`PASS_METADATA_ONLY_NATIVE_E2E_NOT_TESTED`** |
| State DB staging pasca-E2E | `ledger_count: 10`, `auth_users: 4`, `original_3_still_pending: 3` (tidak termutasi), `verified_e2e_reports: 1`, `storage_objects: 4`, `audit_logs: 3`, hook `EXECUTE` hanya `supabase_auth_admin` |
| Root production CLI link (`inspect-link`) | **`gvrwzfwybvyqlvbqxebe`** (`is_production: true`, `changed: false`) |
| Regression suite (`auth.test.ts`, `staging-preflight.test.ts`, `staging-migration-preflight.test.ts`, `staging-phone-otp-config.test.ts`) + `git diff --check` | **38/38 PASS** |

**Rollback cepat pasca-kompetisi (atau darurat):**
1. Salin `.staging/phase2j2-auth-config/backup-original.toml` (atau gunakan `buildStagingPhoneAuthRollback`) ke `config.toml` terisolasi dan jalankan `supabase config push --project-ref zlluhylmykoymynnjxjs --workdir .staging/phase2j2-auth-config --yes`.
2. Jalankan [`supabase/staging/staging-send-sms-hook-rollback.sql`](../supabase/staging/staging-send-sms-hook-rollback.sql) pada staging.
3. Verifikasi `POST /auth/v1/otp` kembali `phone_provider_disabled` dan `assert-api-access.sql` tetap PASS.

---

## 7. Keputusan Akhir & Langkah Terkecil Berikutnya

- **Status Resmi:** **`PHASE 2.0J.2 — AUTH VERIFIED, BROWSER E2E STILL UNVERIFIED`**.
- **GO untuk Demo Rehearsal Browser/Android:** Seluruh fondasi backend staging—PostgreSQL 17.12, 10 migrasi, Q04 hardening, native GoTrue Phone OTP tanpa Twilio, 4 peran, RLS, Storage privat, idempotent sync, verifikasi PPL, dan audit trail—**terbukti nyata end-to-end**.
- **Langkah Terkecil Berikutnya menuju Demo 30 November 2026:**
  1. Set `Test OTPs Valid Until = 2026-12-01` di Staging Dashboard → Authentication → Providers → Phone (1 klik) agar kedaluwarsa otomatis pasca-kompetisi tercatat di platform.
  2. Jalankan rehearsal manual 3 menit di browser Chrome/HP pada `http://127.0.0.1:3201` (dengan AI service lokal port `8000` untuk EfficientNet v2) mencakup: login OTP Farmer A → scan AI/manual → simpan offline IndexedDB → sync → login PPL → verifikasi → cetak/Simpan PDF dokumen pendukung AUTP, lalu simpan bukti screenshot/video rehearsal.

---

## 8. PHASE 2.0J.2A — Redacted Credential Rotation Record

- **Timestamp rotasi (WIB):** **26 November 2026, 00:37–01:20 WIB** (`+07:00`).
- **Alasan:** Empat test OTP awal terekspos pada screenshot; pemilik menghapus mapping lama di Staging Dashboard dan menyimpan 4 OTP pengganti baru.
- **Pencabutan OTP lama:** Terverifikasi live sebelum rotasi (`POST /auth/v1/otp` untuk `farmer_a` → `HTTP 403 "SMS delivery is disabled in AgriGuard staging"`, 0 SMS terkirim; OTP lama tidak pernah dicetak/digunakan ulang).
- **4 Kredensial Baru:** Dihasilkan secara acak kriptografis (`crypto.randomInt`), saling berbeda, nol irisan dengan OTP lama, disimpan hanya pada file privat gitignored mode `0600` (`.staging/phase2j2-auth-config/test-otps.local.json`, `dashboard-paste.local.txt`).
- **Verifikasi Login Baru (26 Nov 2026, 01:20 WIB):**
  - `farmer_a`, `farmer_b`, `ppl`, `dinas`: **4/4 PASS** (`signInWithOtp` → `verifyOtp` → `getUser` → `jwt.amr: ["otp"]`, `hasPhoneOtpClaims: true`, DB `has_phone_otp_session(): true`, UUID/phone/role/Poktan cocok).
  - Negatif: OTP salah (`000000`) ditolak (`HTTP 403`), nomor asing (`+6281234567890`) ditolak (`otp_disabled`, 0 SMS).
  - `auth.users`: tetap **4** (nol user baru tak terduga).
- **Temuan Session Security:** Rotasi `sms_test_otp` tidak otomatis mencabut refresh session sebelumnya (`active_sessions: 12` termasuk sesi uji). Access JWT lama berlaku hingga `exp` (1 jam) kecuali dicek terhadap sesi aktif; pencabutan penuh dilakukan lewat Staging Dashboard → Authentication → Users → *Revoke sessions*.
- **Expiry & Production:** Pemilik telah mengonfirmasi expiry `1 Desember 2026` pada Staging Dashboard. Production (`gvrwzfwybvyqlvbqxebe`) **tidak tersentuh** (root CLI link `changed: false`).

