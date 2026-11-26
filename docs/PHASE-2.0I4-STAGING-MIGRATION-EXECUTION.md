# PHASE 2.0I.4 — Staging v3 Migration Execution & Post-Migration Verification

Tanggal & waktu eksekusi: **25 November 2026, 06:44–06:48 WIB** (`+07:00`).  
Status: **STAGING_MIGRATION_EXECUTED_AND_METADATA_VERIFIED / SEED_AND_AUTH_NOT_APPROVED**.

Tidak ada perubahan pada production (`gvrwzfwybvyqlvbqxebe`), tidak ada pembuatan Auth user, tidak ada upload Storage atau seed, tidak ada deployment Vercel/Render, dan tidak ada commit atau push.

---

## 1. Target & Immutable Plan yang Dieksekusi

| Field | Nilai Aktual Terverifikasi |
|---|---|
| Target project | **`agriguard-staging`** |
| Staging Supabase ref | **`zlluhylmykoymynnjxjs`** (`ap-southeast-1`, `ACTIVE_HEALTHY`, PostgreSQL **`17.12`** / build `17.12.0.000`) |
| Production denylist | **`gvrwzfwybvyqlvbqxebe`** (root CLI link tetap production, `changed: false`) |
| Plan bundle | `.staging/phase2i3-plan-v3/` (isolated workdir `.staging/phase2i3-plan-v3/workspace`) |
| **Plan SHA-256 aktual** | **`319d2f5918413ce8e7950c18edc5161876a827fd03f6fa0fa562731205df884b`** (cocok persis) |
| **Supplement `0012` SHA-256 aktual** | **`7b0f01dfc88f8dbcc3c2835e6da94985286764eb252c54cdc8e99d477441d7a4`** (cocok persis) |
| CLI & flag | Cached Supabase CLI `v2.120.0`, `--linked --project-ref zlluhylmykoymynnjxjs --workdir ... --skip-vault` |
| Conflicting DB/PG env overrides | Semua `UNSET` |

### Catatan Pre-Execution Gate

Saat `verify-workspace` pertama dijalankan sesudah `supabase link --workdir .staging/phase2i3-plan-v3/workspace`, verifier menolak dengan `STAGING_LINK_METADATA_MISMATCH` karena Supabase CLI v2.120.0 menulis kunci `"ref"` (bukan `"id"`) pada `.temp/linked-project.json` (`{"ref":"zlluhylmykoymynnjxjs","name":"agriguard-staging",...}`). Perbaikan kompatibilitas 1 baris diterapkan pada [`lib/staging/preflight.ts`](../lib/staging/preflight.ts) (`metadata.ref ?? metadata.id`), tanpa mengubah SQL, `config.toml`, atau digest plan. Setelah perbaikan, `verify-workspace` dan `db push --dry-run` lulus penuh dengan tepat 10 migrasi (`seeds: []`, `roles: []`).

---

## 2. Status Eksekusi 10 Migration Steps

Dieksekusi pada **25 November 2026, 06:46:45–06:47:40 WIB** (exit code `0`, `seeds: []`, `roles: []`):

| # | Migration | Version Ledger | Status |
|---|---|---|---|
| 1 | `0001_init.sql` | `0001` | **APPLIED** |
| 2 | `0003_fix_rls_recursion.sql` | `0003` | **APPLIED** |
| 3 | `0004_unique_water_level_district.sql` | `0004` | **APPLIED** |
| 4 | `0005_water_levels_unique.sql` | `0005` | **APPLIED** |
| 5 | `0007_fix_signup_and_poktan_rls.sql` | `0007` | **APPLIED** |
| 6 | `0008_fix_handle_new_user.sql` | `0008` | **APPLIED** |
| 7 | `0009_fix_onboarding_full_name.sql` | `0009` | **APPLIED** |
| 8 | `0010_phase0a_security.sql` | `0010` | **APPLIED** |
| 9 | `0011_phase0a_effective_grants.sql` | `0011` | **APPLIED** |
| 10 | `0012_staging_explicit_api_grants.sql` | `0012` | **APPLIED** |

---

## 3. Hasil Post-Migration Verification pada PostgreSQL 17 Staging (READ ONLY)

Seluruh pemeriksaan berikut benar-benar dieksekusi terhadap PostgreSQL `17.12` staging (`zlluhylmykoymynnjxjs`) dalam transaksi `BEGIN TRANSACTION READ ONLY` → `ROLLBACK` pada **06:47:48–06:48:22 WIB**:

### A. SQL Assertions (`supabase/staging/assert-api-access.sql`)

- Hasil aktual: **`PASS_METADATA_ONLY_NATIVE_E2E_NOT_TESTED`** (exit code `0`).
- Terverifikasi pada engine PG 17:
  - RLS aktif pada seluruh 7 tabel aplikasi + `storage.objects`.
  - Nol privilege `TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` untuk `anon` & `authenticated` pada seluruh 7 tabel (serta nol `SELECT/INSERT/UPDATE/DELETE` untuk `anon`).
  - Nol column `REFERENCES` untuk `anon` & `authenticated`.
  - Tidak ada tabel aplikasi yang dimiliki oleh `anon`, `authenticated`, atau `supabase_admin`.
  - Default privileges `postgres` & `CURRENT_USER` pada `TABLES`, `SEQUENCES`, `FUNCTIONS` (global + `public`) tidak lagi memberikan hak ke `PUBLIC`, `anon`, atau `authenticated`.
  - Explicit grants aplikasi (`lahan` narrow INSERT/UPDATE, `water_levels` upsert termasuk `district`, `audit_logs` authenticated SELECT + service_role SELECT/INSERT, `profiles` UPDATE `full_name` only, `damage_reports` tanpa direct client write, `ai_analyses` immutable) sesuai kontrak.
  - 8 RPC/helper (`has_phone_otp_session`, `complete_onboarding`, `can_review_lahan`, `verify_damage_report`, `current_user_role`, `is_ppl_dinas`, `user_belongs_to_poktan`, `user_shares_lahan`) dapat dieksekusi `authenticated` dan ditolak untuk `anon`/`PUBLIC`.
  - `public.handle_new_user()` tidak memiliki `EXECUTE` untuk `anon`, `authenticated`, maupun `service_role`, dan trigger `auth.users.on_auth_user_created` terkonfirmasi ada.
  - Bucket privat `photos` (5 MiB, `image/jpeg`, `image/png`) dan hak `storage.objects` sesuai kontrak.

### B. RLS, Grants & Default ACL Audit (`supabase/staging/read-only-audit.sql`)

- `transaction_read_only`: `"on"`, `server_version`: `"17.12"`.
- **Tabel (`rls: true`, `force_rls: false`)**: `ai_analyses`, `audit_logs`, `damage_reports`, `lahan`, `poktan`, `profiles`, `water_levels`, dan `storage.objects`.
- **Kolom `damage_reports`**: memuat 4 kolom bukti 0A (`evidence_source`, `manual_status`, `ai_analysis_id`, `submission_hash`).
- **`authenticated_profile_update_columns`**: `["full_name"]` (tepat 1 kolom).
- **Policies**: seluruh restrictive phone-OTP policies (`phase0a_phone_otp` pada 6 tabel + `phase0a_phone_otp_photos` pada `storage.objects`), scoped SELECT policies (`profiles_select_officer_scope`, `poktan_select_scope`, `lahan_select_owner_or_poktan`, `reports_select_scope`, `audit_select_officer_scope`, `ai_analyses_select_own`, `photos_select_scope`), serta zero browser INSERT policy pada `damage_reports` dan `storage.objects`.
- **Storage bucket `photos`**: `public: false`, `file_size_limit: 5242880`, `allowed_mime_types: ["image/jpeg", "image/png"]`.
- **Post-migration `default_acl` untuk `postgres`**:
  - `GLOBAL` `f` (FUNCTIONS): `{postgres=X/postgres}` — nol `PUBLIC`/`anon`/`authenticated`.
  - `public` `f` (FUNCTIONS): `{postgres=X/postgres}` — nol `PUBLIC`/`anon`/`authenticated`.
  - `public` `S` (SEQUENCES): `{postgres=rwU/postgres}` — nol `PUBLIC`/`anon`/`authenticated`.
  - `public` `r` (TABLES): `{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}` — nol `PUBLIC`/`anon`/`authenticated`.
- **Catatan transparan `default_acl` & `service_role`**:
  - `supabase_admin` tetap mempertahankan default ACL bawaan platform karena `postgres` bukan member `supabase_admin`; tidak ada tabel aplikasi yang dimiliki `supabase_admin`.
  - Pada `damage_reports`, `poktan`, `profiles`, `service_role` masih memiliki flag `Dxtm` (`TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`) bawaan saat `0001` dibuat (karena `0011` mencabut dari `public, anon, authenticated` saja, bukan `service_role`). Ini hanya berlaku untuk server-only `service_role` (nol eksposur ke `anon`/`authenticated`).

### C. Migration Ledger & Inventaris Objek

- `supabase_migrations.schema_migrations`: `migration_count: 10`, `applied_versions: ["0001","0003","0004","0005","0007","0008","0009","0010","0011","0012"]`.
- `public_tables`: tepat 7 tabel aplikasi (`ai_analyses`, `audit_logs`, `damage_reports`, `lahan`, `poktan`, `profiles`, `water_levels`).
- `public_functions`: tepat 9 fungsi aplikasi + `rls_auto_enable()` (fungsi event trigger automatic-RLS bawaan Supabase dari baseline Q05). Tidak ada objek tak terduga.
- `d2_schema_present`: `false`.
- `auth_users`: `0`, `storage_objects`: `0`.
- Root production CLI link (`inspect-link`): `gvrwzfwybvyqlvbqxebe` (`is_production: true`, `changed: false`).

---

## 4. Error & Catatan Operasional

- Tidak ada SQL error saat eksekusi 10 migrasi maupun post-migration checks.
- Satu perbaikan non-SQL lokal pada `lib/staging/preflight.ts` (`metadata.ref ?? metadata.id` untuk format `linked-project.json` CLI v2.120.0) telah diuji ulang (`tests/staging-migration-preflight.test.ts` lulus penuh).
- Catatan CLI v2.120.0: `Initialising login role...` dijalankan oleh CLI pada target **staging** yang disetujui (tidak menyentuh production).

---

## 5. Keputusan GO / NO-GO untuk Fase Berikutnya

- **GO — Tahap Schema Staging Selesai (Metadata-Verified)**: Seluruh 10 migrasi v3 telah diterapkan dan diverifikasi pada PostgreSQL 17 staging (`zlluhylmykoymynnjxjs`) dengan postur RLS, explicit grants, PG 17 `MAINTAIN`, default privileges `postgres`, trigger Auth, 8 RPC, dan private bucket `photos` sesuai kontrak.
- **CONDITIONAL GO — Fase Berikutnya (O-03 / O-04: Rollback Security Suite, Native Phone Auth, 4 Synthetic Users, Storage Upload & Staging Seed)**: Siap dilanjutkan **hanya setelah persetujuan eksplisit terpisah dari pemilik** untuk:
  1. Konfigurasi native Phone Auth & test-phone-number allowlist pada staging.
  2. Eksekusi rollback security suite (`phase0a_security.dashboard.sql`) bila diinginkan sebelum seeding.
  3. Pembuatan 4 synthetic Auth identities via Admin API, upload 3 synthetic PNG ke bucket privat `photos`, dan penerapan `seed.sql` staging.
- **NO-GO Saat Ini**: Menjalankan seed, membuat Auth users, mengubah production, melakukan deploy, atau mengklaim E2E penuh telah lulus sebelum uji nyata native OTP + RLS row-level + Storage + alur farmer/PPL/Dinas dijalankan.
