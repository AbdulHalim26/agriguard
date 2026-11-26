# PHASE 2.0J — Staging Authentication, Seed & RLS E2E Report

Tanggal & waktu eksekusi: **25 November 2026, 06:52–06:58 WIB** (`+07:00`).  
Target staging terverifikasi: **`agriguard-staging`** (`zlluhylmykoymynnjxjs`, `ap-southeast-1`, PostgreSQL **`17.12`**).  
Production denylist: **`gvrwzfwybvyqlvbqxebe`** — **UNTOUCHED** (root CLI link tetap production, `changed: false`).

Tidak ada migrasi ulang, database reset, aktivasi SMS berbayar, pengiriman SMS, perubahan model AI/dataset, deployment Vercel/Render, commit, atau push. Tidak ada `service_role` key, `anon` key, JWT, password, atau token signed URL yang ditulis ke file, log, atau chat.

---

## 1. Preflight Verification (STEP 1)

| Pemeriksaan | Hasil Aktual | Status |
|---|---|---|
| Isolated workspace (`verify-workspace`) | `zlluhylmykoymynnjxjs`, plan SHA `319d2f5918413ce8e7950c18edc5161876a827fd03f6fa0fa562731205df884b`, 10 steps, `production_link_changed: false` | **PASS** |
| Migration ledger | Exact 10 versions: `0001,0003,0004,0005,0007,0008,0009,0010,0011,0012` | **PASS** |
| Pre-seed counts | `auth_users: 0`, `storage_objects: 0`, seluruh 7 tabel aplikasi `0`, bucket `photos` privat (`5242880` bytes) | **PASS** |
| Rollback security suite (`phase0a_security.dashboard.sql`) pada PG 17.12 staging | Exit code `0`, selesai & `ROLLBACK` bersih | **PASS_DB_SECURITY_ONLY** |

---

## 2. Synthetic Fixtures Created on Staging (STEP 2)

Dibuat menggunakan generator resmi [`scripts/prepare-staging.ts`](../scripts/prepare-staging.ts) (`native-auth-create.json` → `.staging/identities.local.json` mode `0600` → `.staging/phase2j-seed/`).

### A. 4 Synthetic Native Auth Users (via Supabase Admin API)

| Alias | Auth UUID (Staging) | Synthetic Phone | `phone_confirmed` | Role Setelah Seed | Poktan |
|---|---|---|---|---|---|
| `farmer_a` | `1d32787b-089e-4581-b0e2-d48f4f62937e` | `6280000000101` | `true` | `petani` | Poktan A (`Telukjambe Timur`) |
| `farmer_b` | `b1bc5a23-2c23-404f-b941-4763f1ddc219` | `6280000000102` | `true` | `petani` | Poktan B (`Telukjambe Barat`) |
| `ppl` | `14c8d7c0-a3f0-445f-8154-ab22e8ee5e59` | `6280000000103` | `true` | `ppl` | Poktan A (`Telukjambe Timur`) |
| `dinas` | `5dbffdb2-8ce2-4a19-928c-aa14dd7af984` | `6280000000104` | `true` | `dinas` | Poktan A (lintas Poktan sesuai role) |

Trigger `auth.users.on_auth_user_created` (`public.handle_new_user()`) berjalan otomatis pada PG 17.12 saat keempat user dibuat (semua mulai sebagai `petani`, `poktan_id: null`, `phone` cocok).

### B. 3 Synthetic PNG Evidence Files (Private Bucket `photos`)

| # | Report ID | Owner Alias | Size | SHA-256 (Upload & Signed-URL Download Match) |
|---|---|---|---:|---|
| 1 | `40000000-0000-4000-8000-000000000401` | `farmer_a` | 313 B | `bd416fa3c9a0b19e22beb1fdb7e48ea0269af2ce03d2782fa66501c72c4b2408` (**MATCH**) |
| 2 | `40000000-0000-4000-8000-000000000402` | `farmer_a` | 313 B | `ffffddea6b4b24a6e1c15227ee97e9607e95b6b0e5cbe609270e290ebcaa7139` (**MATCH**) |
| 3 | `40000000-0000-4000-8000-000000000403` | `farmer_b` | 313 B | `5da0b1099d2a671d2522545c53facc5bbc022840687bcb8930564d8ec61cb4df` (**MATCH**) |

### C. Post-Seed Database Counts (Staging Aktual)

| Objek | Jumlah Aktual | Keterangan |
|---|---:|---|
| `auth.users` | **4** | 2 petani, 1 PPL, 1 Dinas (synthetic, non-production) |
| `public.profiles` | **4** | Cocok 1:1 dengan `auth.users` |
| `public.poktan` | **2** | `[STAGING SYNTHETIC] Poktan A` & `Poktan B` |
| `public.lahan` | **2** | 2 poligon WGS84 valid (`0.2 ha` milik `farmer_a`, `0.3 ha` milik `farmer_b`) |
| `public.damage_reports` | **3** | Semua `manual` & `pending` (`is_verified: false`, `verified_at: null`); 2 milik `farmer_a`, 1 milik `farmer_b` |
| `storage.objects` (`photos`) | **3** | 3 synthetic PNG terikat path + hash + `submission_hash` |
| `public.audit_logs` | **1** | `staging_fixture_seed` (administrative marker, bukan human verification) |
| `public.ai_analyses` | **0** | Tidak ada fake AI receipt |
| `public.water_levels` | **0** | Tidak ada fake operational EWS reading |

---

## 3. Authentication & Provider Readiness (STEP 3)

| Pemeriksaan Live GoTrue (`zlluhylmykoymynnjxjs`) | Hasil Aktual | Status |
|---|---|---|
| `GET /auth/v1/settings` | `external_phone: false`, `external_email: true`, `disable_signup: false`, `phone_autoconfirm: false`, `mailer_autoconfirm: false` | **Phone Auth Disabled** |
| `POST /auth/v1/otp` (`+6280000000101`, `create_user: false`) | `HTTP 400`, `error_code: "phone_provider_disabled"`, `msg: "Unsupported phone provider"` | **`BLOCKED_BY_PROVIDER`** |

- **Tidak ada SMS yang dikirim** dan **tidak ada provider berbayar yang diaktifkan**.
- Supabase staging mendukung fitur resmi **Test Phone Numbers** (tanpa SMS nyata dan tanpa biaya provider) setelah pemilik mengaktifkan **Phone Auth** dan mengisi pasangan `phone=otp` untuk 4 nomor sintetis di **Staging Dashboard → Authentication → Providers → Phone → Test Phone Numbers**.
- Karena `external_phone: false`, login native OTP E2E (`signInWithOtp` → `verifyOtp` → GoTrue JWT dengan `amr: [{"method":"otp"}]`) saat ini berstatus **`BLOCKED_BY_PROVIDER`** dan **tidak diklaim lulus**.

---

## 4. Security, RLS, Storage & Grants Verification Matrix (STEP 4)

| # | Skenario Uji | Metode Eksekusi Aktual | Hasil | Klasifikasi |
|---|---|---|---|---|
| 1 | Anonymous HTTP `GET /rest/v1/*` pada seluruh 7 tabel | Live HTTP ke PostgREST staging (`anon` key) | **7/7 ditolak** (`HTTP 401`, SQLSTATE `42501`) | **PASS_REAL_AUTHENTICATED_E2E** (anonymous boundary) |
| 2 | Anonymous HTTP `POST /rest/v1/rpc/*` (`has_phone_otp_session`, `complete_onboarding`, `verify_damage_report`) | Live HTTP ke PostgREST staging (`anon` key) | **3/3 ditolak** (`HTTP 401`, SQLSTATE `42501`) | **PASS_REAL_AUTHENTICATED_E2E** (anonymous boundary) |
| 3 | Anonymous HTTP private Storage (`public/photos/...` & `authenticated/photos/...` tanpa JWT) | Live HTTP ke Storage staging | **Keduanya ditolak** (`HTTP 400`) | **PASS_REAL_AUTHENTICATED_E2E** (anonymous boundary) |
| 4 | Signed URL download & integritas SHA-256 3 synthetic PNG | Live HTTP Storage staging (signed URL 60s via server `service_role`, token tidak dicetak) | **3/3 `HTTP 200`, 313 B, `sha256_match: true`** | **PASS_REAL_AUTHENTICATED_E2E** (server-signed Storage path) |
| 5 | Native Phone OTP login & per-user GoTrue JWT HTTP E2E | Live `POST /auth/v1/otp` | `HTTP 400 phone_provider_disabled` | **`BLOCKED`** (`BLOCKED_BY_PROVIDER`) |
| 6 | Farmer A: baca `lahan` (1), `damage_reports` (2), `storage.objects` (2); tidak bisa lihat/edit data Farmer B, tidak bisa naikkan role, tidak bisa baca `poktan.invite_code`, `audit_logs` (0), tidak bisa direct insert report, tidak bisa self-verify, tidak bisa tulis `water_levels` | SQL `ROLE authenticated` + claims OTP user `farmer_a` pada **actual seeded rows** PG 17.12 (`ROLLBACK`) | **Semua assertion lulus** | **`PASS_DB_SECURITY_ONLY`** |
| 7 | Farmer B: baca data sendiri (`lahan`: 1, `damage_reports`: 1, `storage.objects`: 1); tidak bisa lihat data Farmer A; **parcel hijack ditolak** (`UPDATE lahan SET name=...` 0 rows; `UPDATE lahan SET owner_id=...` `insufficient_privilege`; `INSERT lahan` dengan `owner_id = farmer_a` ditolak RLS `42501`) | SQL `ROLE authenticated` + claims OTP user `farmer_b` pada **actual seeded rows** PG 17.12 (`ROLLBACK`) | **Semua assertion lulus** | **`PASS_DB_SECURITY_ONLY`** |
| 8 | PPL (Poktan A): baca 2 report & 2 foto Poktan A; tidak bisa lihat/verify report/foto Poktan B (`insufficient_privilege`); tidak bisa edit `lahan` Farmer A (0 rows); `verify_damage_report` setujui 401 & tolak 402 + 2 transactional `audit_logs`; re-verify 401 ditolak (`check_violation`) | SQL `ROLE authenticated` + claims OTP user `ppl` pada **actual seeded rows** PG 17.12 (`ROLLBACK`) | **Semua assertion lulus** | **`PASS_DB_SECURITY_ONLY`** |
| 9 | Dinas: baca 3 report, 2 lahan, 3 foto lintas Poktan; `verify_damage_report` pada report Poktan B (403) sukses; baca 4 `audit_logs` | SQL `ROLE authenticated` + claims OTP user `dinas` pada **actual seeded rows** PG 17.12 (`ROLLBACK`) | **Semua assertion lulus** | **`PASS_DB_SECURITY_ONLY`** |
| 10 | Phone-session protection: `amr: password` dan mismatched phone `6280000000999` | SQL `ROLE authenticated` pada **actual seeded rows** PG 17.12 (`ROLLBACK`) | **0 rows** pada `profiles`, `lahan`, `damage_reports`, `storage.objects` | **`PASS_DB_SECURITY_ONLY`** |
| 11 | Post-seed `assert-api-access.sql` (PG 17 `MAINTAIN`, `TRUNCATE`, `TRIGGER`, `REFERENCES`, default ACL, trigger Auth, 8 RPC) | `BEGIN TRANSACTION READ ONLY` pada PG 17.12 staging | **`PASS_METADATA_ONLY_NATIVE_E2E_NOT_TESTED`** | **`PASS_DB_SECURITY_ONLY`** |

*Catatan kejujuran*: Pengujian #6–#10 dieksekusi nyata pada engine PostgreSQL 17.12 staging terhadap baris hasil seed aktual dengan `SET LOCAL ROLE authenticated` + `request.jwt.claims` lalu `ROLLBACK` (sehingga 3 laporan seed tetap `pending`), namun **diklasifikasikan `PASS_DB_SECURITY_ONLY`**, bukan `PASS_REAL_AUTHENTICATED_E2E`, karena token GoTrue nyata untuk keempat user masih terblokir `phone_provider_disabled`.

---

## 5. Bukti & Artefak Lokal

- `.staging/identities.local.json` (gitignored, mode `0600`) — 4 UUID native Auth staging.
- `.staging/phase2j-seed/` (gitignored, mode `0700`/`0600`) — `seed.sql`, `seed-manifest.json`, dan 3 synthetic PNG.
- Browser/mobile screenshots: **NOT_CAPTURED** (menunggu aktivasi Phone Auth Test Phone Numbers dan konfigurasi `.env.staging.local`).

---

## 6. Blocker, Risiko & Keputusan Demo-Readiness

### Blocker Tunggal untuk True Native Authenticated E2E

- **`BLOCKED_BY_PROVIDER`**: `external_phone` pada staging (`zlluhylmykoymynnjxjs`) masih `false`.

### Langkah Berikutnya yang Membutuhkan Tindakan Pemilik (Gratis, Tanpa SMS Nyata)

1. Buka **Supabase Dashboard → `agriguard-staging` (`zlluhylmykoymynnjxjs`) → Authentication → Providers → Phone**:
   - Aktifkan **Phone Provider**.
   - Konfigurasikan **Test Phone Numbers** (fitur resmi Supabase, tanpa pengiriman SMS nyata / tanpa biaya) untuk 4 nomor sintetis:
     - `+6280000000101` (`farmer_a`)
     - `+6280000000102` (`farmer_b`)
     - `+6280000000103` (`ppl`)
     - `+6280000000104` (`dinas`)
   - Set Site URL `http://localhost:3201` (bukan production Vercel).
2. Setelah Phone Auth + Test Phone Numbers aktif, jalankan **uji live GoTrue `signInWithOtp` → `verifyOtp`** + per-user HTTP PostgREST/Storage E2E dengan token asli GoTrue, lalu jalankan rehearsal browser lokal (`.env.staging.local` dengan `AUTH_PHONE_OTP_ENABLED=true`, port `3201`) untuk alur lengkap 2 Farmer / 1 PPL / 1 Dinas → AUTP print.

### Keputusan GO / NO-GO

- **GO (Staging Schema, Seed Fixtures & DB-Level RLS Security)**: Database staging (`zlluhylmykoymynnjxjs`) siap dengan 4 synthetic users, 2 Poktan, 2 lahan WGS84 valid, 3 laporan pending, 3 synthetic PNG di private `photos`, serta seluruh batas RLS/grants/PG 17 `MAINTAIN`/anonymous-denial terverifikasi pada PostgreSQL 17.12 nyata.
- **NO-GO (Klaim Full Authenticated E2E / Demo Ready Sekarang)**: Native Phone OTP login E2E masih **`BLOCKED_BY_PROVIDER`** sampai pemilik mengaktifkan Phone Auth + Test Phone Numbers pada staging.
- **Konfirmasi Production**: Production (`gvrwzfwybvyqlvbqxebe`) **100% tidak disentuh** (root CLI link unchanged, zero query/write ke production).
