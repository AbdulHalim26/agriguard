# PHASE 2.0I.2 — Staging Baseline, Owner SELECT-Only Verification

Tanggal: **25 November 2026**.

**Keputusan saat ini: NO-GO untuk eksekusi paket migrasi 9+1.** Baseline database
aktual belum dikirim/diperiksa. Query sudah disiapkan dan diperiksa lokal, tetapi
**tidak dijalankan remotely oleh agent**. Tidak ada temporary-role provisioning,
CLI link change, migrations, Auth creation, seed, production access atau deployment.

Dokumen ini melanjutkan [preflight I.1](PHASE-2.0I1-STAGING-MIGRATION-PREFLIGHT.md).
Instruksi remote CLI/write pada dokumen lama **tidak menjadi instruksi fase I.2**.
Gunakan hanya SELECT files di bawah pada SQL Editor staging, oleh pemilik.

## 1. Target dan plan yang dipertahankan

| Item | Evidence lokal / provenance |
|---|---|
| Pinned staging | **`zlluhylmykoymynnjxjs`**, `agriguard-staging`, `ap-southeast-1`. Identitas ini diperoleh dari actual Management project metadata pada I.1, tidak direkonstruksi. |
| Production denylist | **`gvrwzfwybvyqlvbqxebe`**. Jangan buka/menjalankan query di project ini. |
| Active immutable bundle | **`.staging/phase2i1-plan-v2`**, 9 original migrations + separate explicit-grants supplement. |
| Plan SHA-256 | **`c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421`**. Local verify-plan pada I.2 tetap cocok. |
| Root CLI link | Local cache masih production, unchanged. **Jangan gunakan CLI untuk query I.2.** |
| Owner-reported configuration | Migration history empty, automatic API grants off, automatic RLS on. Belum dianggap catalog-confirmed. |

Delapan files baru berada **di luar immutable bundle**:
`supabase/staging/baseline-select-only/`. Tidak mengubah source SQL, config, hashes,
target registry atau approval flags plan. Semua approval tetap NOT_GRANTED.

## 2. Verified state, assumptions, unverified checks

### Verified pada fase ini — lokal saja

- Target registry dan immutable plan/config/source hashes cocok; execution steps 10,
  seed disabled, approval false, remote_actions false.
- Root CLI link lokal masih production dan tidak dimodifikasi.
- Paket baru terdiri dari 8 statements, masing-masing **SELECT**; tidak ada transaction
  controls, DDL/DML, SET/DO/RPC execution, locking atau role-provisioning command.

### Verified actual database state saat I.2

**Belum ada hasil SQL pemilik. Tidak ada database baseline aktual yang dinyatakan
PASS pada I.2.** Metadata cloud I.1 bukan pengganti catalog/permissions/row-count
evidence dari sesi SQL Editor yang benar.

### Assumptions / expected, bukan hasil observasi

- Project masih fresh, tanpa app schema/types/functions/history/Auth users/objects.
- PostgreSQL major 17 sesuai pinned configuration; metadata I.1 menyebut build
  `17.12.0.000`, tetapi SQL version string dapat berbeda format/patch.
- Automatic grants/RLS configuration masih sesuai laporan pemilik.
- Native managed Auth/Storage schemas dan required role permissions tersedia.

### Tetap unverified sampai owner results direview

Actual SQL execution context/version, object inventory, history, effective prospective
defaults, RLS/trigger behavior, Storage metadata/grants, empty counts dan conflicts.
Row-policy outcomes/native JWT/SMS/Storage bytes/transactions/E2E tetap test terpisah,
bukan sesuatu yang dibuktikan oleh SELECT metadata.

## 3. Cara pemilik menjalankan — satu query per langkah

1. Buka Supabase Dashboard → **agriguard-staging** → SQL Editor.
   Cocokkan URL project **`/project/zlluhylmykoymynnjxjs/…`**, nama dan region.
   Jangan hanya mengandalkan judul tab atau connection label `postgres`.
2. Pilih existing owner/admin SQL Editor context dan **primary** database. Tidak
   membuat role, tidak menggunakan CLI/link, tidak menempel credential/connection URI.
   Jika tidak punya izin metadata/count, laporkan error; jangan mengubah GRANT/roles.
3. Koordinasikan agar tidak ada pihak lain menjalankan migration/seed/app writes
   selama pengambilan baseline. SELECT terpisah **bukan satu snapshot atomik**.
4. Jalankan Q01→Q08 satu per satu, dengan conditional gate Q03/Q06/Q07. Jangan Run
   All jika ledger belum ada. Simpan safe results/timestamp/SQLSTATE, bukan rows PII.
5. Opsional rerun **Q01 yang sama** setelah selesai untuk mencatat akhir window.
   Tidak memakai BEGIN/SET/ROLLBACK agar packet benar-benar SELECT-only.

Nama database `postgres`, current SQL role, IP/host pattern atau constant project-ref
yang ditulis dalam query **tidak membuktikan identitas cloud**. Bukti context utama
adalah project/ref Dashboard yang dipilih; Q01 memberi actual SQL connection facts.
Packet tidak memalsukan expected ref sebagai observed database value.

## 4. Delapan query, expected outputs dan gate

### Q01 — actual SQL identity/version

File: [`01-identity.sql`](../supabase/staging/baseline-select-only/01-identity.sql).

Output 1 row:

- `observed_at`: timestamp aktual dari server; catat timezone/offset.
- `database_name`: umumnya `postgres`, **tidak unik antar Supabase projects**.
- `execution_role`/`session_role`: existing owner/admin context, bukan role yang
  dibuat/dipromosikan untuk audit ini.
- `postgres_major`: **17**; `primary_connection`: **true**.
- `optional_configured_project_ref`: boleh **NULL** bila runtime setting tidak
  diekspos. Bila ada, harus `zlluhylmykoymynnjxjs`; mismatch = STOP.

Optional value diekstrak dari exact HTTPS Supabase URL setting, tidak mencetak raw
setting/URL bercredential. Custom setting dapat diedit dan **bukan attestation**.
NULL bukan otomatis failure bila Dashboard target sudah dikonfirmasi. Jangan SET
setting agar terlihat cocok. Bila target context meragukan, **NO-GO**.

SQL patch version misalnya 17.12 versus metadata build 17.12.0.000 bukan mismatch
otomatis. Major berbeda/replica/context salah harus direview sebelum migration.

### Q02 — schemas, public objects, managed dependencies, history discovery

File: [`02-inventory.sql`](../supabase/staging/baseline-select-only/02-inventory.sql).

Expected:

- Non-system schema list mencakup **public/auth/storage**. Managed extension/system
  schemas lain normal; packet tidak membaca isinya.
- Tidak ada 7 app relations `profiles/poktan/lahan/damage_reports/water_levels/
  audit_logs/ai_analyses`. Fresh project lazimnya `public_relations:[]`.
- `managed_relations` untuk auth.users/storage.objects/storage.buckets = **true**.
- Required anon/authenticated/service_role/postgres roles dan `gen_random_uuid` present.
- Ledger boleh absent atau present. Bila present, `migration_version_column_present`
  harus true. Simpan kedua boolean untuk menentukan apakah Q03 boleh dijalankan.

Unrelated public relations harus diidentifikasi pemilik sebagai known platform/
extension objects atau dijelaskan; jangan menganggap data kosong dari metadata.
Reserved names/partial schema ditangkap lagi pada Q08. Missing dependencies/error
metadata = unverified/NO-GO, bukan instruksi membuat/grant objects.

### Q03 — migration history, conditional

File: [`03-history-if-present.sql`](../supabase/staging/baseline-select-only/03-history-if-present.sql).

| Q02 | Tindakan / hasil yang diharapkan |
|---|---|
| Ledger false | **SKIP Q03**, record `NOT_INITIALIZED`; ini bukan observed count 0. Harus tetap cocok dengan absence app objects/types/conflicts. |
| Ledger true + version-column true | Run Q03. Expected `unfiltered_history_context:true`, `migration_count:0`, `applied_versions:[]`. |
| Ledger true + version-column false | **STOP/NO-GO**, unexpected ledger structure; jangan menebak query atau repair history. |

Query tidak mengambil `statements`/SQL bodies atau whole ledger rows. Jika query
gagal/permission denied, itu **UNKNOWN**, bukan empty history. Count > 0 tidak cocok
dengan fresh immutable plan; jangan reset/repair/skip versions.
Jika counting context dapat terkena RLS, query mengembalikan flag false dan count/
versions NULL, bukan misleading 0. Zero rows atau NULL juga bukan empty-history proof.

### Q04 — default privileges anon/authenticated + managed prerequisites

File: [`04-privileges.sql`](../supabase/staging/baseline-select-only/04-privileges.sql).

Output membedakan **current declared default ACL facts** dari **computed prospective
rights** untuk creator postgres/supabase_admin/current SQL role:

- `global_default_overridden`: configured global entry atau PostgreSQL built-in fallback.
- `public_default_entry_present`: additive per-public-schema entry ada/tidak.
- `global_or_builtin_rights`, `public_schema_additions`, `combined_prospective_rights`
  dihitung untuk anon/authenticated, termasuk **PUBLIC + immediately inherited roles**.

Expected untuk owner configuration API-grants off: **TABLES combined rights kosong**
untuk anon/authenticated pada intended migration creator. Raw default ACL row yang
tidak ada **tidak cukup** sebagai bukti: global/default/PUBLIC/inheritance juga dihitung.
Schema defaults bersifat additive; tidak membatalkan global grants.

FUNCTIONS boleh masih memperlihatkan built-in PUBLIC **EXECUTE** atau configured
empty grants. Jangan salah menafsirkan built-in EXECUTE sebagai automatic-table-
grants setting ON, dan jangan menganggap empty table rights berarti RPC aman.
0010/0011/0012 memiliki explicit RPC revokes/grants yang diperiksa sesudah migration.

Computed rights bukan effective grants pada future tables yang belum ada, bukan
catalog proof untuk temporary CLI creator yang belum ada, dan bukan screenshot
setting UI. Record actual creator role/context; explicit 9+1 grants tidak bergantung
pada menyalakan automatic API grants.

Managed prerequisites:

- Authenticated USAGE auth/storage; EXECUTE auth.uid(), auth.jwt(), storage.foldername(text)
  harus true; missing/null values = unresolved blocker.
- Service-role Storage schema usage diperlukan untuk intended server Storage path.
- Public-schema USAGE direstorasi secara explicit oleh planned supplement bila
  diperlukan; tidak menggunakan schema usage saja sebagai bukti akses data.
- Other native function permissions yang ditampilkan tidak otomatis required untuk
  semua roles; cocokkan dengan exact application/supplement requirements I.1.

Unexpected broad TABLE defaults yang bertentangan dengan owner-reported setting
harus direkonsiliasi; jangan klik automatic fix atau mengubah default privileges.

### Q05 — existing RLS/policy/automatic-trigger metadata

File: [`05-rls.sql`](../supabase/staging/baseline-select-only/05-rls.sql).

Expected fresh baseline:

- No app tables/public app policies; managed **storage.objects RLS true**.
- Anon/authenticated bukan superuser dan tidak BYPASSRLS; service_role BYPASSRLS true
  untuk intended trusted-server operations. Postgres owner/bypass posture dicatat
  untuk security-definer compatibility, bukan diubah.
- Automatic RLS setting tetap dikonfirmasi pemilik di Dashboard. Event trigger
  metadata dapat mendukung observasi: **O/A** aktif pada primary, **D** disabled,
  **R** replica-only. Nama implementasi tidak diasumsikan.

Function bodies/policy predicates **tidak ditampilkan**. Hanya fingerprint dan
keyword flags enable/force RLS. Nama/keyword/hash saja **tidak membuktikan** trigger
scope/behavior; absence keyword/trigger juga bukan bukti universal setting OFF
(implementasi dapat berbeda). Jika perlu, pemilik meninjau definisi **secara lokal
di Dashboard**, lalu melaporkan apakah applicable to public tables dan apakah ada
FORCE-RLS/additional-policy effects, tanpa menyalin secrets/body ke chat.

Table RLS enabled saja bukan proof row access/role authorization. Fresh future tables
belum ada; package tetap mempunyai explicit ENABLE RLS. Unknown/extra policies atau
untrusted definer/force behavior harus direview, tidak diasumsikan PASS.

### Q06 — Storage buckets dan required native object rights

File: [`06-storage.sql`](../supabase/staging/baseline-select-only/06-storage.sql).
Run setelah Q02 confirms Storage relations. Tidak mengambil object paths/owners/bytes.

Expected fresh baseline: **`unfiltered_bucket_context:true`, `bucket_count:0`,
`buckets:[]`**. Bucket `photos` absent normal: 0001 kelak membuatnya. Jika sudah ada,
record dan review compatibility **tanpa update**:

- `photos.public:false`;
- `file_size_limit:5242880`;
- MIME includes image/jpeg dan image/png;
- No object data berdasarkan Q07.

Photos public/wrong limit/missing MIME = **NO-GO**: original ON CONFLICT tidak
memperbaikinya otomatis dan supplement akan menolak. Extra buckets/MIME metadata
harus dijelaskan; jangan delete objects/buckets untuk memaksa fresh baseline.

Required `managed_object_rights`: authenticated SELECT true, service_role SELECT true
dan INSERT true. Missing rights bukan ditambal pada managed schema dalam audit ini.
Authenticated INSERT ACL bisa true dari platform; itu **bukan proof upload boleh**:
RLS/policies tetap menentukan, dan 0010 menghapus browser insert policy untuk photos.
Bucket list/count hanya diberikan bila context tidak terfilter RLS. Flag false/
NULL/no result bukan bukti tidak ada bucket; gunakan existing authorized owner
context, tanpa membuat role atau mengubah grants untuk audit.

### Q07 — empty Auth/Storage aggregate counts

File: [`07-empty-counts.sql`](../supabase/staging/baseline-select-only/07-empty-counts.sql).
Run hanya bila Q02 managed relations present dan existing owner context berizin.

Expected **`unfiltered_auth_context:true`, `unfiltered_objects_context:true`,
`auth_user_count:0`, `storage_object_count:0`**. Tidak mengambil phone,
email, UUID, raw_user_meta_data, object path atau file contents.

Context flags memeriksa RLS-off, superuser/BYPASSRLS, atau exact non-forced table
owner. Jika tidak dapat memastikan unfiltered counting, count NULL — tidak mengubah
RLS, tidak menganggap role-visible 0 sebagai actual empty table. Flags ini juga
bukan pemberian SELECT privilege; permission error tetap UNKNOWN/NO-GO.

Nonzero, termasuk pre-created synthetic users, = **NO-GO untuk current fresh 9+1**:
supplement mensyaratkan empty state, dan pre-existing Auth users tidak otomatis
dibackfill oleh trigger yang belum dipasang. Jangan membuat user baru, menghapus
users/objects, atau mengubah guard package untuk melewati hasil ini.

### Q08 — reserved-name/overwrite conflicts

File: [`08-conflicts.sql`](../supabase/staging/baseline-select-only/08-conflicts.sql).

Expected **zero rows** setelah successful execution. Checks mencakup:

- Both reserved public enum/type names;
- 7 app relation names + 4 explicit index/unique names;
- 9 planned function names, termasuk overloads;
- Auth `on_auth_user_created` yang akan di-drop/replace base migration;
- Reserved Storage photos/phone-OTP policy names;
- D2 geometry schema yang di luar package.

Any row = **STOP/NO-GO pending review**, bukan izin auto-drop/replace. Empty history
saja tidak cukup: partial/manual schema objects dapat ada tanpa ledger. Existing
compatible bucket tidak dianggap hard-name conflict di Q08 karena 0001 memakai ON
CONFLICT; compatibility tetap dinilai di Q06.

## 5. Redaksi / hasil yang boleh dibagikan

Queries sengaja hanya metadata, safe configuration dan aggregate counts. Pemilik
tetap meninjau hasil sebelum membagikan:

| Pertahankan untuk review | Jangan kirim / redaksi |
|---|---|
| Exact staging ref, project-name/region confirmation, SQL major/version/timestamp/primary flag. | Password, keys, bearer/refresh tokens, OTP, connection URI, cookies, signed URL query. Jangan screenshot API Keys/Auth users page. |
| Known managed schemas/roles, planned object names, privilege booleans/lists, RLS flags, actual history versions/count 0. | Unexpected customer/personal schema/table/bucket/role names boleh dipetakan ke `<private_object_1>`; pertahankan jumlah/kind dan apakah cocok reserved names. Redaction yang menghilangkan conflict evidence tetap UNKNOWN. |
| Photos bucket config; required managed permission flags. | Object paths/names/owner IDs/content. Packet tidak memilihnya; jangan menambahkan wildcard selects. |
| Auth/storage counts 0. | Jika nonzero sensitif, cukup `NONZERO` untuk keputusan NO-GO; tidak perlu membagikan identities atau exact positive count. |
| Error code/SQLSTATE dan query number jika gagal. | Raw stack/headers/URLs yang bercredential, function bodies, policy predicates dan migration SQL statements. |

Gunakan safe text/JSON results atau cropped result-only screenshot. Jangan commit
raw exports ke repository atau menambahkan credential agar query dapat berjalan.
Project ref publik bukan credential dan perlu dipertahankan untuk target review.

Format balasan minimal:

```text
Dashboard target confirmed: zlluhylmykoymynnjxjs / agriguard-staging / ap-southeast-1
Q01: actual role/version/primary/time; optional ref NULL or observed value
Q02: schemas + public relations + managed/role presence + ledger/version booleans
Q03: SKIPPED_NOT_INITIALIZED, or unfiltered flag + actual count/versions (not assumed)
Q04: actual default-rights/schema/function results; redact only private labels
Q05: actual RLS/policy/trigger/role metadata + owner automatic-RLS context review
Q06: unfiltered bucket flag + actual bucket config + managed object rights
Q07: unfiltered count flags + observed 0/0, NONZERO, or ERROR/UNKNOWN
Q08: observed zero rows, conflict metadata, or ERROR/UNKNOWN
Errors/redactions: list which evidence is unavailable
```

Jangan mengisi format dengan expected values sebelum query dijalankan.

## 6. Definitive GO / NO-GO untuk immutable package

**NOW: NO-GO untuk mengeksekusi 9+1.** Tidak ada hasil owner SQL untuk mengonfirmasi
live identity context, clean schema/history, required defaults/RLS/Storage rights
atau empty data. Local hashes/metadata terdahulu tidak menutup gap tersebut.

Baseline baru dapat direkomendasikan GO untuk **controlled staging migration**
setelah seluruh required evidence direview:

1. Dashboard target/actual SQL context pasti staging, major 17/primary, no ref mismatch.
2. Required managed schemas/roles/built-in functions present dan managed privileges
   cukup; no unresolved owner/definer/RLS/default-ACL mismatch.
3. Ledger absent + no partial objects, atau ledger present count 0; no reserved conflicts.
4. Count/list unfiltered flags true, Auth users 0 dan Storage objects 0; bucket absent
   atau explicitly compatible review. Role-filtered 0/NULL bukan evidence empty.
5. Exact immutable plan digest tetap
   `c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421`.
6. Tidak ada error, missing output atau redaction yang menyembunyikan blocker.

Any required UNKNOWN/FAIL/conflict tetap **NO-GO**. Bahkan baseline PASS tidak
mengotorisasi write: explicit migration/link/bootstrap approval tetap fase terpisah.
Tidak menjalankan CLI link/dry-run, migrations, fixtures, users atau seed pada I.2.

## 7. Verifikasi lokal yang benar-benar dilakukan

- Immutable 9+1 verify-plan **PASS**, digest unchanged; original schema/compat/config
  dan bundle tidak diedit. Root link hanya diinspeksi lokal dan tetap production.
- **8/8 local lexical checks PASS:** satu top-level SELECT per file, no write/
  transaction-control commands, reviewed pg_catalog getters, no wildcard row reads,
  balanced delimiters dan clean whitespace. Ini **bukan PostgreSQL parser/runtime**.
- Local environment tidak memiliki pglast/sqlparse/sqlglot; tidak memasang dependency
  atau menggunakan online/remote SQL parser. SQL execution/type-resolution tetap
  belum dibuktikan sampai pemilik menjalankan queries pada staging.
- App/TypeScript/model/migration code tidak berubah; full build/267 regression result
  I.1 tidak diklaim sebagai run I.2. I.2 hanya menambahkan packet SELECT dan dokumen ini.
- Tidak ada Supabase/Management request, remote SQL/role provisioning, CLI link change,
  migration/seed, production access, deploy, commit atau push pada I.2.
