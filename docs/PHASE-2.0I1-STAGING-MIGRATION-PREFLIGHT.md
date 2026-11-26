# PHASE 2.0I.1 — Staging Target Validation & Migration Preflight

Tanggal: **24 November 2026**. Status: **IDENTITY_VERIFIED / LOCAL_PLAN_TESTED /
REMOTE_EXECUTION_NOT_APPROVED**. Tidak ada remote migration, link baru, Auth user
creation, upload atau seed yang dijalankan pada I.1.

## 1. Verified target — actual configuration, bukan tebakan

| Field | Hasil dan evidence |
|---|---|
| Staging ref | **`zlluhylmykoymynnjxjs`** |
| Staging name | **`agriguard-staging`** |
| Region | **`ap-southeast-1`** |
| Health | **`ACTIVE_HEALTHY`** |
| Database version | **`17.12.0.000`**, engine/major17 dari actual project metadata. |
| Production ref | **`gvrwzfwybvyqlvbqxebe`** |
| Refs different | **YES**, exact-string comparison. |
| Identity source | Existing authenticated Supabase **projects/list metadata**, exact-name match unique, kemudian exact-ref lookup. Hanya selected project fields dicetak, tidak ada keys. |
| Root CLI link | Tetap **production `gvrwzfwybvyqlvbqxebe`**, dibaca dari `supabase/.temp/project-ref`. Tidak direlink. |
| Application staging env | Hanya template; `.env.staging.local` dan actual native UUID mapping belum ditemukan saat preflight. |

Metadata publik tersebut dipin di [`supabase/staging/target.json`](../supabase/staging/target.json).
CLI/ref validators sekarang menerima **hanya verified staging ref**, selain explicit
production denylist. Nama project tidak dipakai untuk merekonstruksi ID.

### Configuration yang diberikan pemilik versus yang diverifikasi

- **Owner-reported:** migration history empty, automatic API grants **disabled**,
  automatic RLS defaults **enabled**. Dicatat dengan provenance itu di target registry.
- **Verified live metadata:** ref/name/region/health/database version di atas.
- **Belum verified via DB catalog:** default ACL/event trigger implementation,
  actual history count, Auth user count, Storage managed grants. Direct read-only
  audit terblokir oleh credential availability, dijelaskan §2. Tidak mengarang hasil
  SQL dari nama project atau Node test mocks.

Dokumen ini memperbarui status fase I yang masih STAGING_NOT_PROVISIONED. Arsip fase
I tetap dipertahankan, bukan dianggap keadaan terbaru setelah project dibuat.

## 2. Read-only audit boundary dan failure yang ditemukan

I.1 **tidak** menjalankan `supabase db query --linked`, `link`, `db push`, `db reset`,
`config push`, atau SQL test fixtures pada remote. Cached CLI hanya dipakai untuk
projects-list metadata dan `--help`. Jalur CLI db-query fase I yang dapat mint
temporary login role tidak dijadikan fallback.

Reader baru [`scripts/audit-staging-target.mjs`](../scripts/audit-staging-target.mjs):

- Fixed host `https://api.supabase.com`, pinned staging ref; production/other refs
  ditolak sebelum HTTP request.
- GET selected project/Auth configuration dan, bila `--catalog`, POST **fixed
  catalog query** dengan `read_only:true` serta explicit SQL READ ONLY/ROLLBACK.
- Tidak ada temporary-role endpoint, arbitrary SQL argument, login/token creation,
  Auth/Storage/business writes atau source/client credential output.
- Menggunakan explicit `SUPABASE_ACCESS_TOKEN` dari pemilik, bukan application key.
  Token tidak disimpan/di-print. Tidak melakukan Keychain/login discovery otomatis
  pada versi final reader.

Actual initial read-only attempt gagal dengan
`EXISTING_MANAGEMENT_CREDENTIAL_UNAVAILABLE_NO_LOGIN_ATTEMPTED`; setelah reader
dibuat explicit-token-only, hasilnya:

```text
EXPLICIT_MANAGEMENT_ACCESS_TOKEN_REQUIRED_NO_LOGIN_ATTEMPTED
```

Kegagalan terjadi **sebelum database query**; tidak mencoba jalur CLI yang mempunyai
bootstrap writes. Ini **BLOCKED**, bukan catalog PASS atau bukti project unhealthy.

Untuk read-only audit bila pemilik menyediakan akses, simpan token hanya di ignored
file privat `.env.staging.audit.local` (mode0600), **terpisah dari app env**, lalu:

```sh
node --env-file=.env.staging.audit.local scripts/audit-staging-target.mjs --catalog
```

Jangan kirim token di chat/repo. Pemilik juga dapat menjalankan fixed
[`platform-preflight-readonly.sql`](../supabase/staging/platform-preflight-readonly.sql)
di Dashboard SQL Editor staging dengan target yang dicocokkan. Query hanya
metadata + aggregate counts, bukan phone/user/report/photo values.

## 3. Audit sembilan migrations dalam urutan

**Source/dependency order reviewed; remote execution NOT_RUN.** Original files
tidak ditulis ulang atau direnumber di repository.

| Urutan | Source migration | Readiness/compatibility |
|---|---|---|
| 1 | `0001_init.sql` | Creates enums,6 tables/indexes, Auth trigger, bucket private dan base policies. Explicit ENABLE RLS ada. **Tidak memberikan API grants untuk land/water/audit**; policy bukan grant. Intermediate trigger masih historical, jadi tidak membuat Auth users/app traffic sebelum seluruh profile selesai. |
| 2 | `0003_fix_rls_recursion.sql` | Depends on base; creates definer helpers dan replaces recursive policies. Later0011 fixes search_path/EXECUTE exposure. |
| 3 | `0004_unique_water_level_district.sql` | Unique district index; fresh table tidak membawa duplicate rows. |
| 4 | `0005_water_levels_unique.sql` | Converts/ensures unique district constraint untuk PostgREST upsert. |
| 5 | `0007_fix_signup_and_poktan_rls.sql` | Creates intermediate Poktan SELECT policy yang di-drop0010; forces new rolepetani. Harus mendahului0010. |
| 6 | `0008_fix_handle_new_user.sql` | Historical trigger compatibility; final behavior diganti0010. Tidak membutuhkan legacy seed rows. |
| 7 | `0009_fix_onboarding_full_name.sql` | Historical fullname correction; final native trigger tetap0010. |
| 8 | `0010_phase0a_security.sql` | Creates native phone-OTP/pin gate, restrictive policies, receipt/evidence schema, onboarding/review RPC, scoped Storage reads. Explicit profile/report/AI grants/RPC EXECUTE tersedia, tetapi belum melengkapi land/water/audit grants. |
| 9 | `0011_phase0a_effective_grants.sql` | Effective table/column/PUBLIC hardening, protected profile/report/poktan/AI grants, helper EXECUTE. **Bukan positive access grants untuk seluruh business tables.** |

Tidak memasukkan `0002_seed.sql`, `0006_seed_auth.sql`, `supabase/seed.sql`, D2 PoC,
custom roles atau prepared seed data. `gen_random_uuid()` tersedia pada target
major17; tidak membutuhkan legacy auth-seed extension/password flow.

### Automatic RLS enabled

Jika setting meng-enable RLS pada new public tables seperti yang dinyatakan pemilik,
explicit ENABLE RLS pada6 base tables dan `ai_analyses` tetap kompatibel/idempotent.
I.1 **tidak mematikan automatic RLS, RLS, atau policies**. Automatic RLS tidak
menciptakan izin aplikasi, verified ownership atau row-policy correctness otomatis.

Definer functions memerlukan trusted owner + appropriate bypass/table-owner behavior
dan fixed search_path. Actual event-trigger definition, FORCE-RLS behavior dan role
attributes harus dikonfirmasi di read-only baseline/postchecks, tidak diasumsikan.

## 4. Blocker nyata: automatic API grants disabled

Dengan new tables tanpa implicit API grants, source policies saja tidak cukup:

- `writeLahan` membutuhkan authenticated SELECT, INSERT dan UPDATE pada supplied columns.
- Water API memakai authenticated upsert; memerlukan SELECT/INSERT/UPDATE, termasuk
  **`district` pada UPDATE** karena PostgREST meng-update supplied conflict key juga.
- Officer audit view membutuhkan authenticated SELECT; server submit/water audit
  membutuhkan service_role INSERT dan SELECT.
- `service_role` BYPASSRLS **tidak bypass SQL ACL**.

Karena itu **NO-GO untuk sembilan migrations as-is sebagai functional app profile**.
DDL mungkin terpasang, tetapi land/water/audit operations dapat permission-denied.
Tidak mengatasi ini dengan mengaktifkan blanket automatic grants.

### Supplement kandidat — langkah10, terpisah dari original nine

Source: [`supabase/staging/explicit-api-grants.sql`](../supabase/staging/explicit-api-grants.sql).
Generated execution name: **`0012_staging_explicit_api_grants.sql`** dalam isolated
workspace saja, **tidak** ditambah ke root `supabase/migrations` production.

| Object | authenticated | service_role | anon |
|---|---|---|---|
| schema `public`; app enum types | Explicit USAGE | Explicit USAGE | Tidak diberi app-object rights tambahan. |
| `profiles` |0011 SELECT + UPDATE(full_name) only. |0011 SELECT/INSERT/UPDATE. |0011 denies. |
| `poktan` |0011 SELECT safe columns, bukan invite_code. |0011 SELECT. |0011 denies. |
| `lahan` | **SELECT; INSERT(name,area,polygon,owner_id,poktan_id); UPDATE(name,area,polygon)**. |Explicit SELECT. |None. |
| `water_levels` | **SELECT; INSERT/UPDATE(district,river_level_m,updated_by,updated_at)**; actual officer RLS tetap. |Explicit SELECT. |None. |
| `audit_logs` | **SELECT** with existing officer/OTP RLS. No INSERT/UPDATE/DELETE. |**SELECT/INSERT**, no mutable-history grants. |None. |
| `damage_reports` |0011 SELECT; no direct INSERT/UPDATE/DELETE/TRUNCATE. |0011 SELECT/INSERT/UPDATE for validated server path. |0011 denies. |
| `ai_analyses` |0011 own-receipt SELECT; no client writes. |0011 SELECT/INSERT, no UPDATE/DELETE. |0011 denies. |

Supplement first requires nine contracts present, empty app/Auth/Storage-object
state, no D2 schema, RLS enabled, correct private photos bucket and required managed
Auth/Storage rights. It resets table+column ACLs only for three app-owned tables
`lahan/water_levels/audit_logs`, then grants narrow operations. It does not change
default privileges, automatic-grants setting, policies, managed-schema grants,
Auth identities, model weights or user data.

No client DELETE grant for `lahan`: original profile has no owner DELETE policy.
This does not silently introduce destructive deletion or claim it works; any future
delete/archival workflow requires separate review.

## 5. RPC, RLS dan Storage checks

### RPC permissions

0010/0011 explicitly grant authenticated EXECUTE and revoke PUBLIC/anon for:

- `has_phone_otp_session()`;
- `complete_onboarding(text,text)`;
- `can_review_lahan(uuid)`;
- `verify_damage_report(uuid,boolean,text)`;
- `current_user_role()`, `is_ppl_dinas()`, `user_belongs_to_poktan(uuid)`,
  `user_shares_lahan(uuid)`.

Trigger `handle_new_user` tidak memerlukan public normal-RPC execution; supplement
mencabut unnecessary client EXECUTE. It remains a security-definer trigger. No
self-registration officer role, direct client verification atau fake AI receipt.

### Storage boundary

-0001 creates `photos` private,5MiB,JPEG/PNG. Existing wrong bucket configuration is
  not silently fixed by ON CONFLICT; guards/postchecks must reject it.
-0010 removes browser insert policy; actual upload remains trusted server path.
-0010 own-photo/assigned-officer reads and restrictive phone-OTP policy remain.
-Managed `auth`/`storage` schema usage, `auth.uid/jwt`, `storage.foldername`,
  authenticated object SELECT, service_role object SELECT/INSERT are required.
  Their actual live grants are **not yet inspected** because catalog access blocked.
-Supplement **asserts** managed rights, does not repair platform schemas by broad grants.
  Signed URLs/real RLS row outcomes require subsequent authorized tests.

[`assert-api-access.sql`](../supabase/staging/assert-api-access.sql) provides
post-migration READ ONLY permission metadata assertions: positive required grants,
negative protected-column/destructive rights, RPC EXECUTE, RLS flags and bucket.
Metadata PASS is not a native Auth/RLS row/Storage-byte/E2E proof.

## 6. Synthetic Auth users dan seed references

Existing generation profile still has2 petani,1 PPL,1 Dinas;2 Poktan/valid synthetic
polygons;3 distinct PNG/manual pending reports. All user UUIDs must come from actual
NEW staging native Auth responses, not from production or invented IDs.

Validated locally:

-4 distinct UUID shape, no extra role/phone fields in UUID mapping;
-native payload markers pin project ref; trigger starts all profiles as petani;
-administrative officer assignment separate from user metadata;
-report parcel/GPS containment, object path/SHA and v1 submission hash agree;
-no fake `ai_analyses`, verification decision/current water readings;
-seed template rejects production **and every ref except pinned staging**;
-fresh-data/4 native phone-marker-UUID checks before seed writes.

Not verified remotely: current Auth user count/actual4 UUIDs/provider/Phone OTP/
uploaded files. `.staging/identities.local.json` is not available. **No remote Auth
creation, upload, seed, or rollback-fixture SQL test is authorized by I.1.** Existing
rollback suite writes temporary fixtures even though it rolls back; request separate
approval before running it. No guessed native IDs or readiness claims.

## 7. Prepared local execution plan / identity safeguards

Active reviewed bundle:

```text
.staging/phase2i1-plan-v2/
  manifest.json
  target.json
  migrations/                     # nine originals, byte-identical review copies
  explicit-api-grants.sql
  platform-preflight-readonly.sql
  fresh-project-check.sql
  assert-api-access.sql
  phase0a_security.dashboard.sql    # future WRITE fixtures: separate approval
  native-auth-create.json          # payload only; NOT executed
  workspace/supabase/
    config.toml                    # project_id pinned, PG17, seed=false, paths=[]
    migrations/                    # nine originals + staging0012 supplement
```

Execution plan SHA-256:

```text
c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421
```

Older `.staging/phase2i1-plan/` is preserved as an earlier local draft; use **v2**.
Do not overwrite old bundles. Any reviewed SQL/config change requires a NEW bundle/
digest and re-review; verifier compares SQL bytes with both manifest hashes and
current reviewed sources.

Safeguards added:

1. Verified ref/name/region registry; independent hardcoded production denylist.
2. `.env.staging.example` now pins actual public staging URL/ref; credentials remain
   placeholders. Environment check rejects mixed-ref/wrong-role keys/production origins.
3. Exact nine-source allowlist and separate supplement, no legacy seeds/D2/roles.
4. Sealed ordered10-step plan, config digest, no extra SQL files/changed order/hash.
5. Isolated CLI workdir, seeddisabled, no root-cache fallback.
6. Workspace verifier checks its project-ref/name metadata and optional pooler
   project binding without printing DSN passwords; conflicting inherited project/
   database-routing environment overrides rejected.
7. Root production CLI link is only read/recorded; never changed by preparation.
8. Preparation CLI still has **no apply/execute mode**. Local approval flags are not
   authorization: target registry and manifest retain approvalfalse/NOT_GRANTED.

Local commands already executed safely:

```sh
node --import ./tests/register.mjs scripts/prepare-staging.ts inspect-link
node --import ./tests/register.mjs scripts/prepare-staging.ts plan \
  --project-ref zlluhylmykoymynnjxjs --output .staging/phase2i1-plan-v2
node --import ./tests/register.mjs scripts/prepare-staging.ts verify-plan \
  --plan .staging/phase2i1-plan-v2
```

Actual verify-plan:10 steps, seedsfalse, approvalfalse, remote_actionsfalse. The
workspace is **not linked**; verifier intentionally returns
`STAGING_WORKSPACE_NOT_LINKED_NO_ROOT_FALLBACK`, rather than using production link.

## 8. Exact proposed commands — NOT EXECUTED, require explicit approval

**STOP LINE: approval is required BEFORE the following `link` command.** Cached CLI
can mint temporary login roles while linking/connecting. Even `db push --dry-run`
must not be treated as zero-side-effect before approval. CLI2.120 also updates Vault
before migrations unless **`--skip-vault`**; include it on dry-run AND actual push.

Scope proposed: **staging CLI/link bootstrap + schema9+1 + migration history/bucket
metadata only**, zero Auth users/photos/report seed. Root production untouched.

### A. After explicit approval: prepare variables/check immutable local plan

```sh
STAGING_REF='zlluhylmykoymynnjxjs'
SUPABASE_CLI='/Users/macbook/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js'
PLAN="$PWD/.staging/phase2i1-plan-v2"
WORKSPACE="$PLAN/workspace"
node --import ./tests/register.mjs scripts/prepare-staging.ts verify-plan --plan "$PLAN"
```

Use cached2.120 already inspected or separately reviewed installed equivalent.
Do not install/upgrade or change credentials automatically. Clear/review conflicting
`SUPABASE_PROJECT_ID`, database URL/PG routing env overrides before proceeding;
do not expose their values. Never replace `WORKSPACE` with repository root.

### B. First possible remote write: stage-only link bootstrap

```sh
node "$SUPABASE_CLI" link --project-ref "$STAGING_REF" --workdir "$WORKSPACE"
node --import ./tests/register.mjs scripts/prepare-staging.ts verify-workspace --workspace "$WORKSPACE"
```

Verifier must show stage link `zlluhylmykoymynnjxjs` and unchanged root production
link. Missing/mismatched cache, wrong pooler ref, environment override or changed
config/SQL = **STOP**. Do not relink root, copy its `.temp`, use branch-name lookup,
or pass a production `--db-url`/password argument.

### C. Pre-migration baseline, fixed READ ONLY SQL (same approved staging context)

```sh
node "$SUPABASE_CLI" db query --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --file "$PLAN/platform-preflight-readonly.sql" --output json
node "$SUPABASE_CLI" db query --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --file "$PLAN/fresh-project-check.sql" --output json
```

Confirm READ ONLYon; no7 app tables; Auth/storage-object counts0; targetPG17;
owner-reported automatic settings match default-ACL/event-trigger evidence; required
managed schema/function/object rights available. If migration ledger exists, check
count with this additional read-only command; **only if ledger_presenttrue**:

```sh
node "$SUPABASE_CLI" db query --linked --project-ref "$STAGING_REF" --workdir "$WORKSPACE" \
  'begin transaction read only; select count(*) as migration_count from supabase_migrations.schema_migrations; rollback;' --output json
```

Require count0 or an uninitialized ledger plus empty app schema. Nonempty/partial
state = stop and inspect; no reset/repair/seed cleanup. If CLI version rewrites a
local config/link format, re-review and regenerate a NEW manifest rather than
waiving hash verification. These queries have not been run on remote in I.1.

### D. Reviewed dry-run, then migration push only when baseline/identity pass

```sh
node --import ./tests/register.mjs scripts/prepare-staging.ts verify-workspace --workspace "$WORKSPACE" && \
node "$SUPABASE_CLI" db push --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --skip-vault --dry-run
```

The printed list must be **exactly**0001,0003,0004,0005,0007,0008,0009,0010,0011,
0012 staging grants, in that order. No0002/0006, native seed, roles, D2 or Vault.
Stop if CLI rejects source version format or proposes any additional operation;
do not use `--include-all`/`--include-seed` to hide a discrepancy.

Source CLI2.120 migration reader diperiksa: pattern
`^([0-9]+)_(.*)\.sql$` menerima source versions0001…0012; tidak mengharuskan rename
menjadi14digit hanya untuk preflight ini. Actual remote dry-run tetap belum dijalankan.
Referensi: [migration/file.go](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/migration/file.go).

After the same explicit approval and exact dry-run review:

```sh
node --import ./tests/register.mjs scripts/prepare-staging.ts verify-workspace --workspace "$WORKSPACE" && \
node "$SUPABASE_CLI" db push --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --skip-vault
```

CLI will record applied history for the isolated migration profile. Do not claim
entire batch atomic; each migration has its own transaction semantics. Any failure
stops the run; inspect stage history/state before a new attempt, never auto-reset.

### E. Postchecks READ ONLY, then stop again before fixtures/seed

```sh
node "$SUPABASE_CLI" db query --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --file "$PLAN/read-only-audit.sql" --output json
node "$SUPABASE_CLI" db query --linked --project-ref "$STAGING_REF" \
  --workdir "$WORKSPACE" --file "$PLAN/assert-api-access.sql" --output json
```

Confirm10 applied versions, correct protected/evidence schema, RPC permissions,
positive API grants and negative mutation rights. Metadata-only PASS is not E2E.
**Do not run `phase0a_security.dashboard.sql`, native-user creation, uploads or seed**
under schema-only approval; those write fixtures/data and need separate approval.

## 9. Required application/platform configuration after schema phase

-Keep automatic API grants OFF and automatic RLS ON. Expose only intended Data API
  schemas (public app objects); do not expose auth/storage internal schemas as an
  ACL workaround. Actual Data API exposure is a pending owner/catalognative check.
-Native Phone Auth/provider/test-number/OTP/redirect setup requires its own approval;
  no application mock/password bypass. App `AUTH_PHONE_OTP_ENABLED` staysfalse until
  readiness proven; `AGRIGUARD_YOLO_ENABLED=false` remains.
-Use `.env.staging.local`, pinned staging URL and matching stage-only keys; never
  load default production `.env.local` as staging. Management audit token goes in a
  separate private `.env.staging.audit.local`, not the app/client bundle.
-Native Auth IDs must be obtained after authorized creation and matched to seed
  phones/markers; do not guess/reconstruct or borrow production UUIDs.
-Existing EfficientNet/model weights, report receipt/hash contracts, server actor
  authorization and existing RLS policies remain. No AI training or D2 expansion.

## 10. Actual tests, failures dan limitations

| Check | Result/evidence |
|---|---|
| Actual projects-list identity lookup |**PASS**, unique name → actual ref/region/health/PGmajor; no ref reconstruction. |
| Actual root-link inspect |**PASS**, remains production; no relink. |
| Direct read-only Management catalog |**BLOCKED**: explicit credential unavailable. No CLI db-query fallback or query executed. |
| Verify isolated workspace before link |**EXPECTED BLOCK**, no root production fallback. |
| New/updated staging tests |**21/21PASS** focused;8 I1 target/manifest/cache/audit transport cases +13 existing staging cases. Only local/fake transport. |
| Full `npm run test:security` |**267/267PASS**,259 previous +8 I1. |
| `npm run build` with localhost placeholder credentials/flags |**PASS**; expected cookie-dependent dynamic diagnostics. |
| Standalone TypeScript after build |**PASS**. Initial new test JS typing errors (optional token/fetch mock/result shape) were fixed; no type failure waived. |
| Independent Python `tomllib` parse |**PASS**, actual prepared config pins stage/PG17 and seeddisabled/paths empty. |
| Immutable plan verification |**PASS**, active v2 digest §7; original9 byte-identical; supplement included separately. |
| Existing original migrations/PRD/models/D2 preservation |Targeted diff/hash checks pass; existing work preserved. |
| Actual migration execution/SQL engine validation/RLS row tests/Auth/Storage/E2E |**NOT_RUN**. No new PostgreSQL/container dependency installed or cloud write used as a test shortcut. |

Configuration-default compatibility is source-reviewed and conditional on owner
settings; **not** independently engine-proven. The new SQL files are prepared
candidates, not applied migrations. Legacy rows/data/keys were not copied.

Changed/added I1 artifacts: target registry/module, pinned env example, staging plan/
workspace verifiers and CLI modes, explicit-grants candidate, read-only checks/auditor,
seed target pin,8 new regression cases and this document. Root migration files,
root CLI link, production, datasets and model weights are not changed by I.1.

## 11. GO / NO-GO dan explicit approval request

-**GO:** verified target identity + production protection + sealed local preparation.
-**NO-GO:** nine migrations **as-is** for a functional app with auto API grantsoff.
-**CONDITIONAL GO:** reviewed **nine originals + one narrow grants supplement** on
  pinned staging, after actual fresh/catalog baseline and explicit owner approval.
-**NO-GO for remote execution now:** approval not granted, workspace not linked,
  catalog/managed grants/history/user counts not independently confirmed. No remote
  write is attempted merely because local tests/build passed.

**Request approval before the first remote write:** authorize only stage-specific
CLI/link temporary-access bootstrap and conditional schema9+1 execution for
`zlluhylmykoymynnjxjs`, plan SHA
`c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421`,
with stop-on-any-precheck-failure, `--skip-vault`, no Auth/data seed, no production
operations, deploy, commit or push. Fixture/RLS-write tests and seed stay a separate
approval. No local boolean/manifest edit substitutes for that explicit approval.
