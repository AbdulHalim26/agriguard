# PHASE 2.0I.3 — Staging Default Privileges Hardening & Immutable Plan v3

Tanggal: **25 November 2026**. Status: **LOCAL_HARDENING_TESTED / IMMUTABLE_PLAN_V3_PREPARED / REMOTE_EXECUTION_NOT_APPROVED**.

Tidak ada migrasi remote, SQL write, link baru, pembuatan Auth user, upload Storage, seed, perubahan production, deployment, commit, atau push yang dijalankan pada fase ini.

---

## 1. Ringkasan Hasil Baseline Pemilik (Q01–Q08)

Target staging terverifikasi: **`zlluhylmykoymynnjxjs`** (`agriguard-staging`, `ap-southeast-1`, PostgreSQL 17, `ACTIVE_HEALTHY`). Production denylist: **`gvrwzfwybvyqlvbqxebe`** (root CLI link tetap production, tidak diubah).

| Query | Hasil Observasi Pemilik | Implikasi |
|---|---|---|
| Q01 | **PASS** | Identitas SQL & PG 17 primary sesuai target staging. |
| Q02 | **PASS** | Tidak ada tabel aplikasi di `public`; role & objek managed tersedia. |
| Q03 | **SKIPPED** | `supabase_migrations.schema_migrations` belum terinisialisasi (fresh). |
| **Q04** | **SECURITY FINDING** | Default privileges PostgreSQL 17 masih terlalu luas (rincian §2). |
| Q05 | **PASS** | Postur RLS awal sesuai ekspektasi fresh staging. |
| Q06 | **PASS** | Zero buckets; hak objek Storage managed tersedia. |
| Q07 | **PASS** | Zero Auth users dan zero Storage objects. |
| Q08 | **PASS** | Zero konflik nama/objek pada objek yang diperiksa. |

---

## 2. Audit Temuan Q04 — Global vs Per-Schema Default Privileges & Role Pembuat Objek

Hasil observasi Q04 pada staging PostgreSQL 17 menunjukkan dua sumber kebocoran privilege default:

1. **Creator `postgres` (role eksekusi migrasi aplikasi)**:
   - **`public` TABLES** (`anon` / `authenticated`): masih mewarisi **`MAINTAIN`, `REFERENCES`, `TRIGGER`, `TRUNCATE`** meskipun automatic API grants (`SELECT/INSERT/UPDATE/DELETE`) dimatikan.
   - **Global `FUNCTIONS`** (`PUBLIC` built-in `acldefault('f', creator)`): **`EXECUTE`** masih diberikan secara default ke `PUBLIC` (diwarisi `anon` dan `authenticated`).
   - **Perbedaan penting PostgreSQL**: `ALTER DEFAULT PRIVILEGES IN SCHEMA public` bersifat **aditif** terhadap global default dan **tidak** mencabut built-in global `PUBLIC EXECUTE` pada fungsi. Oleh karena itu, hardening wajib menjalankan **keduanya**:
     - Global (`ALTER DEFAULT PRIVILEGES FOR ROLE <creator> REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS FROM PUBLIC, anon, authenticated`) untuk menimpa built-in global `PUBLIC EXECUTE`.
     - Per-schema `public` (`ALTER DEFAULT PRIVILEGES FOR ROLE <creator> IN SCHEMA public REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS FROM PUBLIC, anon, authenticated`) untuk menghapus entri aditif skema `public`.

2. **Creator `supabase_admin` (role platform-managed Supabase)**:
   - **`public` TABLES** (`anon` / `authenticated`): masih mewarisi `SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE`.
   - **`FUNCTIONS`**: `EXECUTE` masih tersedia.
   - **Batas role managed Supabase**: Di Supabase managed, `postgres` umumnya **bukan** member dari `supabase_admin`. Menjalankan `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` secara tanpa syarat dari sesi `postgres` akan gagal (`must be member of role "supabase_admin"`).
   - **Strategi aman**:
     - Supplement mengetatkan `ALTER DEFAULT PRIVILEGES` secara wajib untuk `postgres` dan `CURRENT_USER` (fail-closed dengan `MIGRATION_CREATOR_MUST_BE_POSTGRES_OR_MEMBER` jika eksekutor bukan `postgres` atau member-nya).
     - Untuk `supabase_admin`, `ALTER DEFAULT PRIVILEGES` hanya dijalankan secara kondisional bila `pg_has_role(current_user, 'supabase_admin', 'MEMBER')` bernilai `true`.
     - **Mitigasi operasional**: seluruh migrasi aplikasi wajib dijalankan sebagai `postgres` (bukan `supabase_admin`), dan `assert-api-access.sql` menolak kepemilikan tabel aplikasi oleh `supabase_admin` (`UNEXPECTED_TABLE_OWNER`).
     - **Managed schemas (`auth`, `storage`) tidak disentuh sama sekali** (tidak ada `GRANT`, `REVOKE`, atau `ALTER DEFAULT PRIVILEGES IN SCHEMA auth|storage`).

---

## 3. Perbaikan Keamanan & Matriks Explicit Grants Aplikasi

Sembilan migrasi original (`0001`, `0003`, `0004`, `0005`, `0007`, `0008`, `0009`, `0010`, `0011`) **tidak diubah** (byte-identical). Seluruh perbaikan berada di supplement staging [`supabase/staging/explicit-api-grants.sql`](../supabase/staging/explicit-api-grants.sql) (`0012_staging_explicit_api_grants.sql`), post-check [`supabase/staging/assert-api-access.sql`](../supabase/staging/assert-api-access.sql), dan audit [`supabase/staging/read-only-audit.sql`](../supabase/staging/read-only-audit.sql).

### A. Revokasi Hak Existing & Hardening PG 17

- Mencabut `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` dari `PUBLIC, anon, authenticated` pada seluruh **7 tabel aplikasi** (`profiles`, `poktan`, `lahan`, `damage_reports`, `water_levels`, `audit_logs`, `ai_analyses`).
- Mencabut seluruh table & column privileges pada `lahan`, `water_levels`, `audit_logs` sebelum memberikan explicit grants minimal (melengkapi `0011` yang sudah mereset `profiles`, `poktan`, `damage_reports`, `ai_analyses`).
- Mencabut `EXECUTE` pada trigger function `public.handle_new_user()` dari `PUBLIC, anon, authenticated, service_role`.

### B. Verifikasi Explicit Grants Aplikasi, Trigger Auth, Onboarding, RLS & RPC

Diaudit terhadap seluruh pemanggilan `.from(...)` dan `.rpc(...)` pada `app/`, `lib/`, dan `components/`:

| Objek | `authenticated` | `service_role` | `anon` | Keterangan Kompatibilitas |
|---|---|---|---|---|
| `schema public`; enum `user_role`, `ai_status` | `USAGE` | `USAGE` | — | Diperlukan PostgREST/RPC & tipe kolom. |
| `public.profiles` | `SELECT`; `UPDATE(full_name)` | `SELECT, INSERT, UPDATE` | None | `0011`; `role`/`poktan_id`/`phone` tidak dapat ditulis client. |
| `public.poktan` | `SELECT(id,name,village,district,created_at)` | `SELECT` | None | `0011`; `invite_code` tersembunyi dari client. |
| `public.lahan` | `SELECT`; `INSERT(name,area_hectares,polygon,owner_id,poktan_id)`; `UPDATE(name,area_hectares,polygon)` | `SELECT` | None | Sesuai `lib/land/server.ts`; tanpa `DELETE`, tanpa ubah `owner_id`/`poktan_id`. |
| `public.water_levels` | `SELECT`; `INSERT/UPDATE(district,river_level_m,updated_by,updated_at)` | `SELECT` | None | Sesuai upsert `lib/ews/water-server.ts` (termasuk conflict key `district`); RLS PPL/Dinas tetap aktif. |
| `public.audit_logs` | `SELECT` | `SELECT, INSERT` | None | Officer scope via RLS `audit_select_officer_scope`; tanpa `UPDATE`/`DELETE`. |
| `public.damage_reports` | `SELECT` | `SELECT, INSERT, UPDATE` | None | `0011`; submit & evidence update hanya lewat server tervalidasi. |
| `public.ai_analyses` | `SELECT` | `SELECT, INSERT` | None | `0011`; receipt immutable (tanpa `UPDATE`/`DELETE` termasuk `service_role`). |
| 8 RPC/helper (`has_phone_otp_session`, `complete_onboarding`, `can_review_lahan`, `verify_damage_report`, `current_user_role`, `is_ppl_dinas`, `user_belongs_to_poktan`, `user_shares_lahan`) | `EXECUTE` | — | None (revoked from `PUBLIC, anon`) | `0010`/`0011`; semua `SECURITY DEFINER SET search_path = ''`. |
| `public.handle_new_user()` | None | None | None | Trigger `auth.users.on_auth_user_created` tetap berjalan sebagai `SECURITY DEFINER` owner (`postgres`) tanpa perlu `EXECUTE` client/API. |

Tidak ada policy RLS yang dihapus atau dilonggarkan; seluruh restrictive phone-OTP policies (`phase0a_phone_otp*`) dan Storage bucket privat `photos` tetap utuh.

---

## 4. Paket Migrasi Staging Immutable Baru (v3)

Paket lama `.staging/phase2i1-plan` dan `.staging/phase2i1-plan-v2` **dipertahankan utuh tanpa ditimpa**. Verifikasi `verify-plan` pada v2 kini sengaja gagal dengan `STAGING_SQL_OR_REVIEWED_SOURCE_HASH_MISMATCH`, mencegah eksekusi paket lama sebelum hardening Q04.

| Field | Nilai Aktual |
|---|---|
| Bundle baru | `.staging/phase2i3-plan-v3/` (lokal, gitignored, mode `0700`/`0600`) |
| Phase manifest | `2.0I.3` |
| Target pinned | `zlluhylmykoymynnjxjs` (`agriguard-staging`, `ap-southeast-1`, PG 17) |
| Execution steps | **10** (9 original byte-identical + `0012_staging_explicit_api_grants.sql`) |
| `0012` SHA-256 | `7b0f01dfc88f8dbcc3c2835e6da94985286764eb252c54cdc8e99d477441d7a4` |
| **New Plan SHA-256** | **`319d2f5918413ce8e7950c18edc5161876a827fd03f6fa0fa562731205df884b`** |
| Superseded v2 SHA-256 | `c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421` (rejected by verifier) |
| `seed_enabled` | `false` |
| `remote_execution_approval` | `NOT_GRANTED` |
| `cloud_actions_executed` | `false` |
| Root CLI link | Tetap `gvrwzfwybvyqlvbqxebe` (`is_production: true`, `changed: false`) |

---

## 5. Verification Ledger (Lokal Saja)

| Pemeriksaan | Hasil Aktual |
|---|---|
| `prepare-staging.ts plan --project-ref zlluhylmykoymynnjxjs --output .staging/phase2i3-plan-v3` | **PASS** — 10 steps, digest v3 terbuat, `cloud_actions_executed: false`. |
| `prepare-staging.ts verify-plan --plan .staging/phase2i3-plan-v3` | **PASS** — semua hash 9 original + `0012` + `config.toml` + digest cocok. |
| `prepare-staging.ts verify-plan --plan .staging/phase2i1-plan-v2` | **EXPECTED REJECT** (`STAGING_SQL_OR_REVIEWED_SOURCE_HASH_MISMATCH`); file v2 tetap utuh. |
| `prepare-staging.ts inspect-link` | **PASS** — root CLI link tetap production (`changed: false`). |
| `npm run test:security` | **270/270 PASS** (267 existing + 3 Q04 hardening/assertion/v3-digest regression tests baru). |
| `npm run build` (isolated placeholder env, `AUTH_PHONE_OTP_ENABLED=false`, `AGRIGUARD_YOLO_ENABLED=false`) | **PASS** — Next.js 15.5.28, 25 static pages; `DYNAMIC_SERVER_USAGE` pada `/dashboard` & `/lahan` expected. |
| `./node_modules/.bin/tsc --noEmit --incremental false` (setelah build) | **PASS**. |
| Preservation diff (`PRD.md`, `README.md`, `0001..0009`, `0002_seed`, `0006_seed_auth`, `ai-service/predict.py`, `model.onnx`, `model_v2.onnx`, `model_v2.metadata.json`) + `git diff --check` | **PASS** — nol perubahan pada file yang diproteksi. |
| Eksekusi PostgreSQL 17 nyata / remote staging migration / native Auth OTP / RLS row-level / Storage bytes / E2E | **NOT_RUN** — belum ada persetujuan eksekusi remote; pengujian lokal bersifat source/contract/manifest, bukan substitusi eksekusi SQL engine nyata. |

---

## 6. Risiko Tersisa & Batasan Jujur

1. **SQL belum dieksekusi di engine PostgreSQL 17 nyata**: Validasi syntax, transaksi `ALTER DEFAULT PRIVILEGES`, dan `assert-api-access.sql` baru diverifikasi lewat analisis statis & regression suite lokal, bukan runtime PostgreSQL 17 (PostgreSQL lokal tidak terpasang di mesin ini dan eksekusi remote dilarang pada fase ini).
2. **Default ACL `supabase_admin` (platform-managed)**: Jika sesi migrasi berjalan sebagai `postgres` tanpa membership `supabase_admin`, default privileges milik `supabase_admin` di `pg_default_acl` akan tetap ada sebagai sifat bawaan platform. Ini aman selama seluruh objek aplikasi dibuat oleh `postgres` (bukan `supabase_admin`) dan setiap migrasi mendatang menyertakan explicit `REVOKE`/`GRANT` + post-check `assert-api-access.sql`.
3. **E2E autentikasi & RLS belum terbukti**: Setelah migrasi disetujui & dijalankan pada staging, tetap wajib menjalankan `read-only-audit.sql`, `assert-api-access.sql`, `phase0a_security.dashboard.sql` (dengan approval terpisah), setup Phone Auth/4 synthetic accounts, serta uji nyata farmer → PPL/Dinas → AUTP.

---

## 7. Keputusan GO / NO-GO

- **GO (Lokal / Persiapan)**: Paket immutable **`.staging/phase2i3-plan-v3`** (SHA-256 `319d2f5918413ce8e7950c18edc5161876a827fd03f6fa0fa562731205df884b`) siap untuk review pemilik guna menggantikan v2 yang terblokir Q04.
- **NO-GO (Eksekusi Remote Saat Ini)**: Eksekusi migrasi remote pada `zlluhylmykoymynnjxjs` **belum diotorisasi** (`remote_execution_approval: NOT_GRANTED`). Menunggu persetujuan eksplisit pemilik untuk langkah berikutnya (controlled staging migration 9+1 dengan `--skip-vault` pada workspace terisolasi v3, diikuti post-check READ ONLY `read-only-audit.sql` dan `assert-api-access.sql`).
