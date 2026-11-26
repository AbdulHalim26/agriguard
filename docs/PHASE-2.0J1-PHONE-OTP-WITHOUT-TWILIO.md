# PHASE 2.0J.1 — Staging Phone OTP Without Twilio: Feasibility, Security Review & Local Proof

Tanggal: **25 November 2026** (`11:31–11:36 WIB`).  
Target staging terverifikasi: **`agriguard-staging`** (`zlluhylmykoymynnjxjs`, PostgreSQL `17.12`, Free Plan).  
Production denylist: **`gvrwzfwybvyqlvbqxebe`** — **UNTOUCHED** (root CLI link tetap production, `changed: false`).

**Batas eksekusi fase ini:** Hanya riset dokumentasi/upstream, implementasi lokal, pengujian kontrak lokal, dan preflight. **Tidak ada** perubahan konfigurasi Auth hosted, deployment hook, Management API write, pembuatan user/seed ulang, perubahan model/dataset AI, deployment Vercel/Render, commit, atau push.

---

## Status Akhir Fase (Kategori Resmi)

| Komponen | Status |
|---|---|
| Riset kelayakan & desain solusi no-Twilio (Test Phone Numbers + Fail-Closed Send SMS Hook) | **IMPLEMENTED_AND_TESTED_LOCAL** |
| Artifact lokal (`staging-send-sms-hook.sql`, `staging-send-sms-hook-rollback.sql`, `auth-test-config.ts`, 5 regression tests) | **IMPLEMENTED_AND_TESTED_LOCAL** |
| Eksekusi lokal container GoTrue + PostgreSQL 17 (`supabase start`) | **NOT_IMPLEMENTED** (`docker`/`podman`/`psql`/`initdb` tidak terpasang di mesin lokal) |
| Aktivasi hosted Phone Provider + `sms_test_otp` + `staging_send_sms_hook` pada `zlluhylmykoymynnjxjs` | **REQUIRES_OWNER_APPROVAL** (dan masih **BLOCKED_BY_PROVIDER** hingga disetujui & diterapkan) |

---

## 1. Kontrak Autentikasi Existing AgriGuard

Seluruh lapisan aplikasi dan database menuntut sesi native GoTrue Phone OTP asli (tidak boleh di-bypass):

| Lapisan | File | Persyaratan Aktual |
|---|---|---|
| API Route | [`app/api/auth/otp/route.ts`](../app/api/auth/otp/route.ts), [`lib/auth/phone-otp.ts`](../lib/auth/phone-otp.ts) | `AUTH_PHONE_OTP_ENABLED=true`, exact-origin guard, `client.auth.signInWithOtp({ phone: '+628...', options: { channel: 'sms', shouldCreateUser: mode === 'register' } })` → `client.auth.verifyOtp({ phone: '+628...', token: code, type: 'sms' })` → `client.auth.getUser()` + verifikasi `profiles.phone === user.phone`. |
| Session Helper | [`lib/auth/session.ts`](../lib/auth/session.ts) | Token tervalidasi remote via `auth.getUser(token)`, `user.phone_confirmed_at` non-null, JWT claims: `sub === user.id`, `role === 'authenticated'`, `phone === user.phone` (non-empty), `exp * 1000 > Date.now()`, `amr` array memuat `{ method: 'otp' }`, serta `profiles.phone === user.phone`. |
| Middleware | [`middleware.ts`](../middleware.ts) | `getPhoneOtpUser(supabase.auth)` + `profiles.phone === user.phone` + role gate `ppl`/`dinas` untuk `/verifikasi` dan `/audit`. |
| Database RLS | [`supabase/migrations/0010_phase0a_security.sql`](../supabase/migrations/0010_phase0a_security.sql) | `public.has_phone_otp_session()` (RESTRICTIVE policy `phase0a_phone_otp` pada 6 tabel + `phase0a_phone_otp_photos` pada `storage.objects` + `ai_analyses_select_own`) memeriksa: `auth.uid() IS NOT NULL`, `auth.jwt()->>'phone' <> ''`, cocok dengan `public.profiles.phone`, dan `auth.jwt()->'amr'` memuat `entry->>'method' = 'otp'`. |

**Kesimpulan kontrak:** Tidak ada syarat yang perlu dilonggarkan. JWT yang diterbitkan oleh Supabase GoTrue melalui `verifyOtp(..., type: 'sms')` untuk nomor uji resmi (`sms_test_otp`) secara alami membawa `role: 'authenticated'`, `sub`, `phone`, `phone_confirmed_at`, `aal: 'aal1'`, dan `amr: [{ method: 'otp', timestamp }]`.

---

## 2. Temuan Dokumentasi Resmi Supabase & Upstream

Referensi resmi yang diperiksa:
- `https://supabase.com/docs/guides/auth/testing-auth-flows`
- `https://supabase.com/docs/guides/auth/auth-hooks`
- `https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook`
- `https://supabase.com/docs/guides/auth/phone-login`
- Upstream `supabase/auth` (`auth/internal/api/verify.go`) & `supabase/supabase#45198`

Temuan kunci:

1. **Official Test Phone Numbers (`sms_test_otp` + `sms_test_otp_valid_until`) tersedia di Hosted Free Plan**:
   - Format: `<E164_tanpa_plus>=<6_digit_otp>` dipisahkan koma, disertai batas kedaluwarsa ISO-8601 `sms_test_otp_valid_until`.
   - Di upstream GoTrue (`verify.go`), `config.Sms.GetTestOTP(params.Phone, time.Now())` mengecek nomor uji sebelum gateway eksternal; `signInWithOtp` melewati pengiriman SMS nyata, dan `verifyOtp` menerbitkan **JWT GoTrue asli** (dengan `amr: otp`).
   - Setelah `sms_test_otp_valid_until` lewat, fixed test OTP otomatis tidak lagi berlaku.
2. **Send SMS Auth Hook (`pg-functions://`) tersedia di Hosted Free Plan**:
   - `hook_send_sms_enabled: true` + `hook_send_sms_uri: "pg-functions://postgres/public/staging_send_sms_hook"` dapat menggantikan SMS provider bawaan (Twilio/Vonage/MessageBird) sepenuhnya tanpa biaya SMS dan tanpa Edge Function eksternal.
   - Dieksekusi oleh role internal `supabase_auth_admin` (membutuhkan `GRANT USAGE ON SCHEMA public TO supabase_auth_admin` dan `GRANT EXECUTE ON FUNCTION ... TO supabase_auth_admin`).
3. **Bug Validasi Dashboard Upstream (`supabase/supabase#45198`)**:
   - Di Supabase Dashboard UI, saat Send SMS Hook aktif dan field kredensial Twilio tampak nonaktif (greyed out), validasi client-side form masih dapat menolak Save dengan error *Twilio Account SID / Auth Token / Message Service SID is required*.
   - **Jalan keluar resmi tanpa kredensial Twilio palsu:** Gunakan **Supabase Management API v1** (`PATCH https://api.supabase.com/v1/projects/zlluhylmykoymynnjxjs/config/auth`) dengan `external_phone_enabled: true`, `disable_signup: true`, `sms_autoconfirm: false`, `sms_test_otp`, `sms_test_otp_valid_until`, `hook_send_sms_enabled: true`, `hook_send_sms_uri: "pg-functions://postgres/public/staging_send_sms_hook"` — tanpa field Twilio apa pun.
4. **Keterbatasan**:
   - `sms_test_otp` hanya untuk phone sign-in/sign-up, bukan MFA step-up (AgriGuard tidak memakai MFA step-up).
   - Fixed OTP tidak membuktikan delivery SMS operator telekomunikasi (tetap dicatat jujur sebagai staging test-number authentication).

---

## 3. Kelayakan Hosted Staging Tanpa Twilio

**FEASIBLE (LAYAK & DIDUKUNG RESMI)** pada hosted Supabase Free Plan (`zlluhylmykoymynnjxjs`) tanpa mendaftar Twilio, tanpa SMS berbayar, dan tanpa melemahkan Auth/RLS.

### Solusi yang Direkomendasikan (Utama)

Kombinasi **3 kontrol berlapis** khusus staging `zlluhylmykoymynnjxjs`:

1. **Official `sms_test_otp` + `sms_test_otp_valid_until`**:
   - Terbatas tepat pada 4 nomor sintetis existing (`6280000000101..6280000000104`), OTP 6 digit dipilih pemilik saat eksekusi (tidak di-hardcode di repo).
   - Kedaluwarsa otomatis tepat setelah deadline kompetisi: `2026-12-01T16:59:59Z` (`2026-12-01 23:59:59 WIB`).
2. **Fail-Closed `pg-functions://` Send SMS Hook** ([`supabase/staging/staging-send-sms-hook.sql`](../supabase/staging/staging-send-sms-hook.sql)):
   - `public.staging_send_sms_hook(event jsonb) returns jsonb` (`SECURITY INVOKER`, `SET search_path = ''`).
   - Selalu mengembalikan `{"error": {"http_code": 403, "message": "SMS delivery is disabled in AgriGuard staging"}}` — tidak pernah mengirim SMS, tidak pernah meloloskan nomor asing, tidak pernah mencetak/menyimpan OTP.
   - `EXECUTE` dicabut dari `PUBLIC, anon, authenticated, service_role` dan diberikan **hanya** kepada `supabase_auth_admin`.
3. **`disable_signup: true` + `sms_autoconfirm: false` via Management API**:
   - Menutup pendaftaran nomor baru/asing di staging (keempat synthetic users sudah ada sejak PHASE 2.0J).
   - Menghindari bug validasi Dashboard `#45198` tanpa memasukkan kredensial Twilio dummy.

### Alternatif (Tidak Dipilih Sebagai Utama)

- *Alt A — SMS provider Indonesia / alternatif (TextBee, Fonnte, Vonage, MessageBird)*: Membutuhkan pendaftaran akun pihak ketiga, pengiriman SMS nyata, atau biaya; tidak diperlukan untuk demo staging terkontrol sebelum 30 Nov 2026.
- *Alt B — Email/Password login*: **DITOLAK** — melanggar kontrak `has_phone_otp_session()` (`amr: otp`) dan kebijakan keamanan Phase 0A.

---

## 4. Implementasi & Bukti Lokal (STEP 4)

### Batasan Lingkungan Lokal (Jujur)

Pengecekan biner lokal mengonfirmasi: `docker=MISSING`, `podman=MISSING`, `psql=MISSING`, `initdb=MISSING`, `pg_ctl=MISSING`. Karena itu instance GoTrue + PostgreSQL lokal (`supabase start`) **tidak dapat dijalankan** pada mesin ini, dan tidak ada hasil GoTrue lokal yang direkayasa.

### Artefak Lokal yang Dibuat & Diuji

1. [`supabase/staging/staging-send-sms-hook.sql`](../supabase/staging/staging-send-sms-hook.sql) — Hook SQL staging fail-closed (di luar `supabase/migrations/`, belum dieksekusi).
2. [`supabase/staging/staging-send-sms-hook-rollback.sql`](../supabase/staging/staging-send-sms-hook-rollback.sql) — Rollback SQL (`DROP FUNCTION IF EXISTS public.staging_send_sms_hook(jsonb)`).
3. [`lib/staging/auth-test-config.ts`](../lib/staging/auth-test-config.ts) — Builder payload Management API khusus staging (menolak production ref, menolak nomor di luar 4 synthetic phones, menolak expiry lewat `2026-12-01T16:59:59Z`, menolak Twilio keys, menyediakan rollback payload dan `redactAuthConfigSnapshot`).
4. [`tests/staging-phone-otp-config.test.ts`](../tests/staging-phone-otp-config.test.ts) — 5 regression tests baru untuk patch/rollback/redaction, kontrak SQL hook fail-closed, dan verifikasi klaim `hasPhoneOtpClaims` / `getPhoneOtpUser` (valid OTP, password-only, expired, cross-phone, unconfirmed phone).

### Verification Ledger Lokal

| Pemeriksaan | Hasil Aktual |
|---|---|
| `npm run test:security` | **275/275 PASS** (270 existing + 5 test baru `staging-phone-otp-config.test.ts`) |
| `npm run build` (placeholder env) + `./node_modules/.bin/tsc --noEmit --incremental false` | **PASS** (Next.js 15.5.28, 25 static pages) |
| `git diff --check` | **PASS** |
| `prepare-staging.ts inspect-link` | Root CLI link tetap production `gvrwzfwybvyqlvbqxebe` (`changed: false`) |
| Live GoTrue OTP dengan `sms_test_otp` pada staging | **NOT_RUN / REQUIRES_OWNER_APPROVAL** |

---

## 5. Analisis Keamanan & Penyalahgunaan

| Risiko | Mitigasi |
|---|---|
| Fixed OTP diketahui publik / bocor | OTP tidak pernah di-commit ke repo/log/browser API; hanya diset di staging via env privat saat aktivasi; otomatis kedaluwarsa `2026-12-01T16:59:59Z` + rollback eksplisit pasca-demo. |
| Penyalahgunaan ke nomor asli / SMS bombing | `disable_signup: true` + fail-closed `staging_send_sms_hook` (HTTP 403) + nol kredensial SMS provider → **0 SMS** bisa terkirim ke nomor mana pun. |
| Eskalasi hak fungsi hook di DB | `SECURITY INVOKER`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role`, `GRANT EXECUTE` hanya ke `supabase_auth_admin`. |
| Pengaruh ke production atau RLS | Target dipin ketat ke `zlluhylmykoymynnjxjs`; production `gvrwzfwybvyqlvbqxebe` diblokir di validator; tidak ada RLS policy, table grant, atau `0001..0012` yang diubah. |
| Kebocoran rahasia di backup config | `redactAuthConfigSnapshot()` menyensor seluruh kunci `secret`, `token`, `password`, `key`, `sms_test_otp`, dan provider sebelum disimpan. |

---

## 6. Rencana Perubahan Hosted Staging (BELUM DIEKSEKUSI — Menunggu Persetujuan Pemilik)

Prasyarat sebelum eksekusi:
- Persetujuan eksplisit pemilik untuk **PHASE 2.0J.2 (Staging Phone Auth Activation & Real GoTrue OTP E2E)** pada `zlluhylmykoymynnjxjs` saja.
- Pemilik menyediakan `SUPABASE_ACCESS_TOKEN` di file privat gitignored `.env.staging.audit.local` (mode `0600`) dan 4 kode OTP 6 digit uji untuk `6280000000101..6280000000104` (tidak dikirim via chat publik).

Urutan eksekusi setelah disetujui:
1. **Backup konfigurasi Auth staging saat ini (redacted)**: `GET https://api.supabase.com/v1/projects/zlluhylmykoymynnjxjs/config/auth` → simpan hasil `redactAuthConfigSnapshot(...)` ke `.staging/auth-config-backup-redacted.json` (mode `0600`).
2. **Pasang fail-closed SQL hook pada staging saja**: jalankan [`supabase/staging/staging-send-sms-hook.sql`](../supabase/staging/staging-send-sms-hook.sql) via isolated workspace `.staging/phase2i3-plan-v3/workspace` (tanpa menyentuh `supabase_migrations.schema_migrations` atau root link).
3. **Aktifkan Phone Auth + `sms_test_otp` + Hook via Management API**: `PATCH https://api.supabase.com/v1/projects/zlluhylmykoymynnjxjs/config/auth` dengan payload dari `buildStagingPhoneAuthPatch(...)` (tanpa field Twilio).
4. **Verifikasi Real GoTrue JWT & E2E (4 peran)**:
   - Jalankan `signInWithOtp` + `verifyOtp` nyata untuk `farmer_a`, `farmer_b`, `ppl`, `dinas` → periksa JWT asli memiliki `sub`, `role: 'authenticated'`, `phone`, `amr: [{ method: 'otp' }]`, dan `auth.getUser()` sukses.
   - Uji negatif: OTP salah → 401/403; nomor tak dikenal (`+6281234567890`) → ditolak (`disable_signup` / hook 403, 0 SMS).
   - Jalankan query PostgREST/RPC/Storage nyata memakai **JWT asli masing-masing peran** (Farmer A vs Farmer B isolation, parcel hijack deny, PPL scoped read/verify + cross-Poktan deny, Dinas cross-Poktan read, signed Storage photo) untuk menaikkan status dari `PASS_DB_SECURITY_ONLY` menjadi **`PASS_REAL_AUTHENTICATED_E2E`**.
   - Konfirmasi ulang `assert-api-access.sql` dan root production link tidak berubah.

---

## 7. Rollback & Emergency Disable

Untuk mematikan kapan saja (atau wajib setelah 30 November 2026):
1. `PATCH https://api.supabase.com/v1/projects/zlluhylmykoymynnjxjs/config/auth` dengan `buildStagingPhoneAuthRollback('zlluhylmykoymynnjxjs')`:
   - `external_phone_enabled: false`, `sms_test_otp: ""`, `sms_test_otp_valid_until: null`, `hook_send_sms_enabled: false`, `hook_send_sms_uri: null`.
2. Jalankan [`supabase/staging/staging-send-sms-hook-rollback.sql`](../supabase/staging/staging-send-sms-hook-rollback.sql) pada staging untuk `DROP FUNCTION IF EXISTS public.staging_send_sms_hook(jsonb)`.
3. Verifikasi `POST /auth/v1/otp` kembali menolak (`phone_provider_disabled`) dan `assert-api-access.sql` tetap PASS.

---

## 8. Keputusan GO / NO-GO

- **GO (Desain & Implementasi Lokal)**: Solusi hosted staging **tanpa Twilio** (Official `sms_test_otp` + expiry `2026-12-01T16:59:59Z` + fail-closed `pg-functions://` Send SMS Hook + `disable_signup: true` via Management API) **layak secara teknis, gratis di Free Plan, dan mempertahankan seluruh keamanan RLS/JWT AgriGuard**.
- **CONDITIONAL GO (Aktivasi Hosted Staging — PHASE 2.0J.2)**: Membutuhkan **persetujuan eksplisit pemilik** + token Management API di file lokal privat (`.env.staging.audit.local`) untuk memasang hook SQL dan mengirim `PATCH /v1/projects/zlluhylmykoymynnjxjs/config/auth`.
- **NO-GO**: Menggunakan kredensial Twilio palsu di Dashboard, melonggarkan `has_phone_otp_session()`, mengaktifkan SMS berbayar, menyentuh production (`gvrwzfwybvyqlvbqxebe`), atau mengklaim `PASS_REAL_AUTHENTICATED_E2E` sebelum uji GoTrue nyata dijalankan.
