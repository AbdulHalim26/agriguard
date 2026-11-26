# PHASE 2.0D.2 — Immutable Geometry Versioning: Local PoC

Tanggal verifikasi lokal: **24 November 2026**.

**Hasil:** reference model dan **34 test D2 UNIT_TESTED**; regresi lengkap
**233/233 Node**, **73/73 Python**, build dan TypeScript **PASS**.
Candidate SQL dan harness transaksi sudah ditulis, tetapi **AUTHORED_NOT_EXECUTED /
DATABASE_TRANSACTION_UNVERIFIED**: PostgreSQL disposable tidak tersedia. Fase ini
**belum fully validated**, belum mengaktifkan versioning pada aplikasi, dan bukan
bukti staging/produksi.

## 1. Scope dan source aktual

D1 menghasilkan validasi geometri, perhitungan WGS84, shared application write
path dan inventaris read-only. Source DB existing masih menyimpan hanya current
`lahan.polygon`/declared `area_hectares`; `damage_reports.lahan_id` belum merekam
boundary historis. Native OTP, pinned profile, restrictive RLS dan effective grants
0010/0011 tersedia pada source, bukan diasumsikan sudah dibuktikan di deployment.

D2 menambahkan PoC terisolasi untuk:

- Append-only geometry snapshots dengan version number, previous pointer dan
  current head per parcel; optimistic expected-head check.
- New report binding ke snapshot yang dipakai geofence; boundary/report race
  mempunyai hasil eksplisit, bukan silent rebind.
- Durable idempotency, actor/scope checks, baseline observed-now dan legacy unknown.
- Candidate schema/RPC/RLS/triggers serta rencana bukti transaksi PostgreSQL nyata.

**Status integrasi:** land actions/PATCH, `lib/land/server.ts`, active report
submission, IndexedDB queue dan sync tetap memakai kontrak D1. Tidak ada endpoint
yang mengimpor reference store atau memanggil RPC D2. `actor.ts` hanya adapter
candidate yang dites dengan transport fake. SQL berada di `supabase/poc/`, **di luar
`supabase/migrations/`**, sehingga bukan migrasi auto-discovered.

## 2. File D2 yang benar-benar ditambahkan

| File | Peran |
|---|---|
| [`lib/land/versioning/contracts.ts`](../lib/land/versioning/contracts.ts) | Strict geometry/report commands, stable errors, legacy context dan recovery guidance. |
| [`lib/land/versioning/actor.ts`](../lib/land/versioning/actor.ts) | Reuse native OTP validator dan pinned profile/Poktan lookup; belum dipasang di routes. |
| [`lib/land/versioning/reference-model.ts`](../lib/land/versioning/reference-model.ts) | Synthetic fixture-only state transitions; bukan DB adapter/RLS emulator. |
| [`tests/geometry-versioning.test.ts`](../tests/geometry-versioning.test.ts) | 34 deterministic unit tests, termasuk rollback/replay/stale queue/raw evidence. |
| [`supabase/poc/geometry-versioning/candidate.sql`](../supabase/poc/geometry-versioning/candidate.sql) | Draft schema, nullable pointers/FKs, guards, RPCs, grants dan scoped read view. **Belum diterapkan.** |
| [`supabase/poc/geometry-versioning/bootstrap.sql`](../supabase/poc/geometry-versioning/bootstrap.sql) | Minimal synthetic Auth/Storage stand-ins untuk cluster baru milik runner. |
| [`supabase/poc/geometry-versioning/fixtures.sql`](../supabase/poc/geometry-versioning/fixtures.sql) | Synthetic identities, parcels, receipt dan pre-versioning report. Bukan export petani. |
| [`supabase/poc/geometry-versioning/assertions.sql`](../supabase/poc/geometry-versioning/assertions.sql) | Effective ACL/owner/RLS/FK/view checks; belum dieksekusi pada PostgreSQL. |
| [`scripts/test-geometry-versioning-db.py`](../scripts/test-geometry-versioning-db.py) | Stdlib-only runner: cluster disposable sendiri, no DSN/env loader, actual lock barriers. |
| Dokumen ini | Verification ledger, limitations, rollout/rollback dan next gate. |

Tidak ada paket/runtime service baru dipasang pada D2. D1 tetap memakai pinned
`geographiclib-geodesic@2.2.0`; bukan PostGIS.

## 3. Local reference model: apa yang dibuktikan unit tests

`createGeometryVersioningReference({fixture_only:true,...})` menerima synthetic
parcels/photo bytes/AI receipts serta injected clock/ID/auth/fault callbacks.
`purpose` selalu **UNIT_REFERENCE_NOT_DATABASE_PROOF**. Clock fixture
`2026-11-18T04:00:00Z` adalah waktu sintetis, bukan timestamp data nyata.

Satu FIFO process-local dan copy-on-commit menjaga transisi reference state. Inspect,
version view dan hasil operasi adalah salinan. Mengedit view tidak menulis snapshot.
Throw setelah version insert/head advance/report insert membuang working copy;
state committed dan audit tidak berubah. Ini membuktikan **reference transitions**,
bukan PostgreSQL isolation, lock, rollback, durable storage atau security policies.

### Geometry commands

- `BASELINE`: command UUID, parcel UUID, expected head **null**, required trimmed
  reason 1–500 karakter. Polygon/deklarasi diambil dari current fixture parcel.
- `CHANGE`: command/parcel UUID, non-null expected version UUID, supplied original
  polygon, optional finite declared ha >0 dan ≤1000, required reason.
- Strict schemas menolak client actor/owner/role/created-at/provenance/computed-area
  fields; actor berasal dari injected auth boundary, bukan command.
- Owner **dan** matching Poktan diperlukan untuk geometry changes. Same-Poktan
  reader, PPL atau Dinas tidak otomatis boleh mengedit milik pihak lain.
- D1 `assessLandGeometry` benar-benar dijalankan sebelum validation artifact dibuat.
  Invalid geometry gagal sebelum insert; original ring/deklarasi dipertahankan.
- Exact actor+command replay mengembalikan artifact yang sama. Changed command
  dengan identity sama menghasilkan `COMMAND_REPLAY_CONFLICT`.
- Artifact berlaku lima menit. Unconsumed expired artifact ditolak. Successful
  receipt replay mengembalikan versi original, bahkan setelah head lebih baru,
  tanpa memundurkan head atau menambah audit/version.

Commit mengecek actor/scope lagi, expected head, baseline snapshot dan same-parcel
predecessor. Satu transisi menghasilkan version N+1, previous link, current pointer,
compatibility polygon/declared area serta audit. Stale expectation menghasilkan
`VERSION_CONFLICT`, bukan overwrite/auto-merge.

### Report commands dan evidence

Input hanya command/key/parcel/captured-version IDs, coordinates, client timestamp,
1–3 photo references dan mode `manual`, `server_ai` atau `pending`. Client numeric AI,
verification atau caller polygon fields ditolak. Captured UUID **bukan** bukti waktu
capture atau mandat kepemilikan; server tetap mengecek parcel/current version.

Reference model menghash synthetic photo bytes, memeriksa actor/MIME/size, serta
AI receipt actor + exact first-photo hash. Raw confidence/damage/status dipertahankan;
new report `is_verified:false`. Ini bukan implementasi Storage upload baru.

Existing v1 submission hash dipertahankan:

```ts
SHA256(JSON.stringify({
  lahan: parcel_id, latitude, longitude,
  photos: photoHashes,
  manual: evidence_source === 'manual' ? manual_status : null
}))
```

Geometry binding dicek **terpisah**; hash v1 tidak diubah untuk menambahkan version.
Command replay memakai fingerprint seluruh parsed command, sehingga perubahan
client timestamp/evidence mode tetap konflik walau hash v1 kebetulan sama. Durable
report-key replay mengikuti kontrak lama dan mengembalikan report/version original.

Uncommitted report intent berlaku lima menit. Successful durable replay diperiksa
sebelum TTL/head/geofence terkini: report lama tidak gagal diakui hanya karena batas
berubah atau preflight expired. Reused accepted key dengan changed payload atau
changed non-null version menimbulkan explicit idempotency conflict.

## 4. Candidate schema — ditulis, BELUM diterapkan

Instalasi candidate memerlukan ketiganya: database bernama
`agriguard_geometry_poc_[a-z0-9]+`, session marker
`agriguard.geometry_poc_install=LOCAL_DISPOSABLE_ONLY`, dan Unix socket
(`inet_server_addr() IS NULL`). PostgreSQL **15+** diperlukan untuk security-invoker
view. Marker/name check adalah install guard, **bukan** credential/authorization
atau bukti bahwa database yang dipilih operator benar-benar disposable. Runner
menambahkan batas yang lebih kuat: selalu menciptakan cluster baru sendiri.

### Tables dan references

| Candidate object | Isi/invariant yang ditargetkan |
|---|---|
| Private `agriguard_geometry.validation_receipts` | Original JSON polygon **sekali**, computed m², declared-ha snapshot, validator metadata, actor/command/parcel, expected head, reason, DB time dan expiry. |
| Private `agriguard_geometry.versions` | Immutable ID/parcel/version number/previous/receipt/actor/recorded time/provenance. Polygon tidak diduplikasi lagi. |
| Private `agriguard_geometry.report_intents` | Immutable trusted staged report payload, actor/parcel/captured version, DB time dan expiry. |
| `lahan.current_geometry_version_id` | Nullable same-parcel current head; compatibility polygon/deklarasi tetap ada. |
| `damage_reports.geometry_version_id` | Nullable same-parcel FK; original `lahan_id`, photos, coordinates, hashes/receipt IDs/times tetap. |
| `damage_report_geometry_context` | Authenticated SELECT-only security-invoker view: `VERSION_BOUND` atau `LEGACY_BOUNDARY_UNKNOWN`; underlying report RLS tetap berlaku. |

Unique `(parcel_id,version_number)`, `(parcel_id,previous_version_id)`, receipt ID dan
composite same-parcel FKs mendukung satu chain. Baseline hanya N=1/previous null/
`BASELINE_CAPTURED_NOT_HISTORICAL`; berikutnya previous non-null/
`EXPLICIT_BOUNDARY_CHANGE`. Trigger/RPC menyelaraskan expected pointer, N+1 dan
compatibility snapshot.

`created_at` versi diisi DB `clock_timestamp()` ketika insert; ini **recorded time**,
bukan survey time atau exact commit timestamp. Tidak ada backdated effective-at API.
Current baseline berarti boundary yang diamati **sekarang**, bukan rekonstruksi
batas ketika report lama dibuat. Review status pada read view selalu `UNVERIFIED`,
`ownership_verified:false`; append-only review-decision workflow belum dibuat.
Standalone canonical geometry hash/derived-ring storage, retention policy untuk
unused expired artifacts, dan external evidence provenance belum diimplementasikan.

### Append-only dan protection boundaries

Candidate memakai statement triggers untuk menolak **UPDATE/DELETE/TRUNCATE** pada
private receipts/versions/intents, termasuk statement zero-row. Client/service tidak
mendapat schema usage atau table/column privileges pada schema private. Writer
hanya mempunyai SELECT/INSERT pada history, bukan UPDATE/DELETE/TRUNCATE.

Head guard menolak adopted geometry/declared/head writes selain dedicated function
owner; pointer tidak boleh dihapus, dilewati atau diarahkan ulang tanpa next version.
Adopted parcel owner/Poktan transfer memerlukan separate reviewed workflow. Normal
name-only update tetap mungkin. Unadopted legacy parcel tetap memakai jalur lama;
**global D1 validation untuk semua legacy direct writers belum dijamin candidate**.

Report guard membekukan version/parcel/coordinates/user/key/photo refs/hash/
submission hash/client+server timestamp. Bound report DELETE dan whole-table
TRUNCATE ditolak. Existing officer verification dan authorized pending-AI evidence
completion tidak dimodelkan sebagai boundary rewrite. Reserved geometry/report audit
actions dilindungi dari forged insert/mutation dan audit TRUNCATE ditolak.

Ini desain enforcement untuk normal roles dengan triggers aktif. Privileged DB
administrators masih dapat menonaktifkan trigger/mengubah owner; bukan absolute
admin-proof immutability atau cryptographic authenticity guarantee. Semua klaim
enforcement SQL tetap memerlukan engine/effective-permission tests.

## 5. RPC, RLS dan trusted-server boundary

Dedicated owner `agriguard_geometry_writer`: **NOLOGIN, NOINHERIT, NOSUPERUSER,
NOBYPASSRLS**; tidak diberikan sebagai membership ke anon/authenticated/service/
authenticator. Fixed empty `search_path`, schema-qualified table names, targeted
grants dan writer policies. Tidak ada user-settable GUC yang menjadi write bypass.

Writer memiliki SELECT pada profiles/land/reports/receipts dan minimal writes untuk
operasi terkait. `UPDATE(full_name)` pada profile diperlukan oleh PostgreSQL untuk
`FOR SHARE` row lock; RPC tidak melakukan profile UPDATE, dan tidak memperoleh
UPDATE phone/role/Poktan. Profile lock/recheck menahan perubahan konteks saat new
mutation berlangsung; parcel row lock mengurutkan head/report operations.

| RPC | Caller dan tanggung jawab |
|---|---|
| `stage_geometry_validation(...)` | **service_role only**. Scope owner+Poktan, original ring, bounded DB shape/range check dan metadata version/method. Backend **harus** sudah menjalankan D1 topology/WGS84 validation. |
| `advance_lahan_geometry(receipt_id)` | **authenticated native OTP**, actor dari `auth.uid()`. Recheck profile/owner/Poktan, lock parcel, expected head, version+head+audit dalam satu fungsi transaksi. |
| `stage_report_geometry_intent(...)` | **service_role only**. Strict staged payload allowlist, actor/parcel/capture/photo-path/hash-shape/evidence checks. Backend **harus** memvalidasi upload bytes/hash/receipt sebelumnya. |
| `commit_report_with_geometry(intent_id)` | **authenticated native OTP**. Report key lock → durable replay; untuk insert baru profile/parcel lock → current snapshot/geofence/receipt → report+audit. |
| `get_lahan_geometry_version(version_id)` | **authenticated native OTP**, scoped owner/same-Poktan/Dinas atau own report memakai versi itu. Tidak mengekspos schema private sebagai unrestricted history API. |

Issuance replay diserialisasi dengan transaction advisory lock per actor+geometry
command atau report-intent ID. Exact payload mengembalikan ID yang sama; changed
payload konflik. Commit report memakai global key advisory lock sebelum parcel
lock; UNIQUE report idempotency key tetap menjadi constraint final. Hash collision
pada advisory key hanya menambah serialization, bukan memberikan authorization.

Metadata shape diselaraskan dengan model:
`{policy:{version:'land-geometry-v1',...},method:'GEOGRAPHICLIB_2.2.0_KARNEY_WGS84_GEODESIC'}`.
SQL `ring_sane` **bukan** full topology validator/independent geodesic calculator;
SQL tidak membuktikan computed area atau keberadaan/hash object Storage hanya dari
string. Method/version tag bukan attestation signature. Compromised trusted issuer
masih dapat berbohong tentang hasil validasi; native backend orchestration belum
diimplementasikan di fase ini.

### Candidate integration protocol — belum wired

1. Server memvalidasi native OTP dengan existing hardened auth dan pinned profile,
   memuat scope/current state, lalu memvalidasi command. Actor tidak berasal dari form.
2. Geometry: D1 validator menghitung original-ring assessment; server service client
   menerbitkan receipt. Report: existing byte/upload/receipt validation menghasilkan
   trusted payload dan intent. Client tidak menerima service credentials.
3. Native authenticated session memanggil narrow commit RPC hanya dengan receipt/
   intent ID. DB mengambil actor/current scope dan mengulang head/geofence checks.
4. Retry meneruskan same artifact/payload/command/key; new validation setelah expiry
   adalah explicit fresh command, bukan overwriting artifact/head.

Belum ada server adapter yang menghubungkan langkah ini ke active endpoints,
Storage, IndexedDB atau browser recovery. Reference model memeriksa hashes dari
synthetic bytes; SQL harness hanya memakai trusted synthetic payload fixtures.
Keduanya tidak membuktikan end-to-end parity atau Supabase HTTP permission behavior.

## 6. Report/head race, legacy dan offline recovery

### Ordering yang ditargetkan pada PostgreSQL

- **Report mendapat parcel lock dahulu:** commit report dengan captured current
  snapshot Vn; boundary berikutnya boleh advance Vn+1. Report tetap terikat Vn.
- **Boundary mendapat lock dahulu:** head menjadi Vn+1; new report captured Vn gagal
  `GEOMETRY_VERSION_STALE`, tanpa report/audit partial. Tidak mengecek terhadap Vn+1
  lalu diam-diam mengikat atau mengganti coordinates.
- **Dua expected-head writers:** satu advance; writer kedua mendapat explicit
  `VERSION_CONFLICT`, tidak ada orphan version. Exact accepted receipt replay tidak
  mengembalikan head ke versi sebelumnya.
- **Dua same-key reports:** satu durable row; exact retry mengakui ID/version/hash
  yang sama. Changed association tidak diterima sebagai duplicate yang sukses.

Reference FIFO cases hanya menguji logical outcomes. Actual SQL lock schedule,
constraint interaction, rollback dan effective roles **belum dijalankan**. Harness
menarget default **READ COMMITTED**; SERIALIZABLE/REPEATABLE READ, deadlock/serialization
retry policy, cancellation/reconnect dan production load belum dibuktikan. Future
retry tidak boleh mengganti expected/captured head secara otomatis.

### Legacy

- Pre-existing reports tetap null/absent version ⇒ **LEGACY_BOUNDARY_UNKNOWN**.
  Candidate tidak berisi historical UPDATE/backfill; baseline tidak mereassign
  original report FK, coordinates, photos, hashes, receipts, times atau verification.
- Current baseline adalah **BASELINE_CAPTURED_NOT_HISTORICAL** pada actual DB record
  time, bukan boundary ketika foto lama diambil. Invalid legacy geometry memerlukan
  explicit correction/evidence workflow, bukan automatic repair untuk lolos baseline.
- Durable legacy report retry tetap dapat diakui tanpa menambahkan boundary terkini.
- Adopted parcel tidak menerima new null-version report. Unadopted parcel masih
  dapat menyimpan legacy/unknown-protocol report; ini transisi, bukan version-bound.

### Offline

Active `OfflineReport` belum mempunyai captured version; helper recovery **belum**
merupakan perubahan persisted queue schema/UI. Missing/invalid capture atau stale
version menghasilkan **HUMAN_REVIEW_REQUIRED**, menjaga original key/photos/
coordinates dan `automatically_rebind:false`. UUID yang valid hanya memberi
`SERVER_VALIDATION_REQUIRED`, bukan trusted capture proof.

Old queue tidak boleh diberi current head saat sync agar terlihat valid. Recovery
UI/append-only review events dan prosedur membuat revised submission setelah review
masih perlu dirancang; evidence/key original tidak dibuang atau diganti otomatis.
Karena itu **jangan baseline/adopt parcel sebelum semua writer dan offline client
protocol siap**: legacy intake akan ditolak setelah adoption.

## 7. Database harness dan bukti yang masih belum tersedia

Perintah dari repo root:

```sh
PYTHONDONTWRITEBYTECODE=1 ai-service/.venv/bin/python scripts/test-geometry-versioning-db.py --check
PYTHONDONTWRITEBYTECODE=1 ai-service/.venv/bin/python scripts/test-geometry-versioning-db.py --run
```

- `--check` hanya binary/version discovery, tidak membuat atau menghubungi DB.
- `--run` memerlukan existing matching `initdb`, `pg_ctl`, `postgres`, `psql` **15+**.
  Runner tidak memasang PostgreSQL/Docker/services atau menerima DSN/host/db argument.
- Saat prerequisites tersedia: fresh cluster di private temp directory, private Unix
  socket, `listen_addresses=''`, host auth reject, generated DB name. Process env
  di-whitelist; `PGHOST/PGDATABASE/PGSERVICE/PGOPTIONS`/password dari caller diabaikan,
  HOME baru dan psql `-X`/no-password. Tidak membaca `.env`/real credentials.
- Hanya actual schema/security migrations yang diperlukan; **seed 0002/0006 tidak
  dijalankan**. Existing rollback-only `phase0a_security.sql` dijalankan sebelum D2.
  Semua identities/rows adalah synthetic. Minimal Auth/Storage functions meniru
  claims/table interface, **bukan** JWT signature/GoTrue/Storage/PostgREST.
- New cluster adalah satu-satunya cleanup target; session/process dihentikan sebelum
  owned temp directory dihapus. Shutdown failure mempertahankan directory untuk
  pemeriksaan. Assertions harus enabled; optimized Python ditolak pada run branch.

Harness **ditulis untuk** guarded-install negative, effective ACL/RLS/owner checks,
same-parcel FK/head rules, OTP/owner/Poktan scopes, append-only/direct write attempts,
legacy preservation, report/geofence/idempotency, expiry, dan injected audit error
setelah version/head/report writes untuk membuktikan real statement rollback.

Concurrency suite menyiapkan **delapan** overlapping transaction pairs: geometry
issuer replay/conflict, report issuer replay/conflict, competing heads, duplicate
report commit, report-before-head dan head-before-report. Supervisor gate harus
terlihat di `pg_blocking_pids(A)` dan A di `pg_blocking_pids(B)` sebelum release.
Gagal mencapai barrier adalah FAIL, bukan concurrency PASS dari sleep/timing atau
Promise. Cancellation hanya melepas data-free supervisor; writer A tetap commit
normal. **Ini deskripsi test code, bukan hasil eksekusi.**

### Hasil aktual di mesin ini

Discovery PATH dan Homebrew tidak menemukan executable PostgreSQL lengkap; Docker/
Podman juga tidak tersedia. `--check` dan `--run` benar-benar dijalankan, keduanya
berakhir **exit 2** dengan:

```text
NOT_RUN / DATABASE_TRANSACTION_UNVERIFIED: complete matching PostgreSQL 15+ initdb/pg_ctl/postgres/psql installation unavailable; no database contacted
```

`--help` berhasil. Tidak ada database di-bootstrap, SQL yang di-apply atau transaksi
yang dieksekusi. SQL belum mendapat engine syntax/constraint/RLS verification.
Dependency install atau memakai shared Supabase sebagai pengganti tidak dilakukan.

## 8. Verification ledger aktual

Local Node **26.8.1**, Python **3.12.15**, Next.js **15.5.28**. Target release
Node24/container Python3.11 belum diverifikasi ulang.

| Check | Evidence/status |
|---|---|
| D2 unit cases | **34/34 PASS** di full Node suite; snapshot, actor, replay, stale head/queue, rollback model, AI/raw evidence dan legacy cases. |
| `npm run test:security` | **233/233 PASS**, 34 D2 + 199 regression existing. |
| Python unittest discovery | **73/73 PASS**; existing classifier contract/detector/QA/review/readiness, bukan training/accuracy evaluation. |
| `npm run build`, local placeholder env | **PASS**, compiled/type-check dan 25-page generation selesai. `/dashboard` dan `/lahan` cookie-dependent `DYNAMIC_SERVER_USAGE` adalah expected diagnostics. |
| `tsc --noEmit --incremental false` sesudah build | **PASS**, tidak paralel dengan regenerasi `.next/types`. |
| `git diff --check` | **PASS**. |
| Historical/schema/seed/classifier preservation diff | **PASS** untuk `PRD.md`, `README.md`, `0001_init.sql`, `0002_seed.sql`, `predict.py`, `model.onnx`, `model_v2.onnx`, metadata v2. |
| Database runner CLI/discovery | `--help` sukses; `--check`/`--run` **NOT_RUN/exit2**, no DB available/contacted. |
| SQL install/RLS/effective ACL/real rollback/concurrency | **AUTHORED_NOT_EXECUTED / DATABASE_TRANSACTION_UNVERIFIED**. |
| Active land/report/offline integration | **PROPOSED / NOT_WIRED**; candidate actor function hanya unit-tested. |
| Native Supabase Auth/Storage/REST, browser/mobile, connected staging | **UNVERIFIED**, memerlukan separate isolated integration gate. |
| Production | **UNVERIFIED / NOT_DEPLOYED**. |

Initial focused test sempat gagal load karena generic `async <T>` dibaca TSX oleh
existing `transpileModule` loader. Diperbaiki menjadi unambiguous `<T,>`; focused
31 lalu33 cases lulus. Test terakhir ditambahkan dan seluruh34 cases lulus dalam
run lengkap233. Tidak menyatakan initial file-load failure sebagai assertion PASS.

Perintah regresi yang benar-benar dijalankan:

```sh
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" npm run test:security
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v
env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder AI_API_URL=http://127.0.0.1:1 OPENWEATHER_API_KEY= NEXT_PUBLIC_APP_URL=http://127.0.0.1:1 AUTH_PHONE_OTP_ENABLED=false EWS_DEMO_ENABLED=false npm run build
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
git diff --exit-code -- PRD.md README.md supabase/migrations/0001_init.sql supabase/migrations/0002_seed.sql ai-service/predict.py ai-service/model/model.onnx ai-service/model/model_v2.onnx ai-service/model/model_v2.metadata.json
```

No live farmer export/DB connection, production credential change, PostGIS enable,
training/conversion, classifier replacement, YOLO activation, review approvals,
commit/push atau deployment dilakukan pada D2. Existing prior-phase working tree
dipertahankan; passing transport fakes bukan bukti effective deployed RLS.

## 9. Rollout plan — PROPOSED / belum dijalankan

1. **Disposable DB proof:** sediakan existing PostgreSQL15+ yang disetujui untuk
   runner terisolasi. Jalankan harness; simpan actual version/exit/results, periksa
   SQL errors, effective ACL, real rollback dan kedelapan lock schedules. Belum
   boleh menaikkan status DATABASE_TRANSACTION_TESTED sebelum semuanya sukses.
2. **Review schema/privileges/provenance:** review dedicated role, grants, RLS,
   append-only/FK/sequence constraints, trusted issuance boundary, unused artifact
   retention, cancellation/isolation behavior dan error-to-HTTP/recovery mapping.
   Candidate tidak merupakan approved production migration.
3. **Native platform integration:** di isolated Supabase environment yang explicit
   approved, uji actual OTP signatures/phone pin/expiry, PostgREST exposed schemas,
   Storage byte/hash checks, anon/password-only/owner/same-group/PPL/Dinas/cross-group
   effective permissions. Minimal bootstrap bukan pengganti bukti tersebut.
4. **Client/server protocol:** buat actual server orchestration, capture-version
   read contract, queue schema migration/recovery UI dan durable acknowledgements.
   Uji app/browser/offline, lost response, duplicate upload, account switch serta
   report/head races. Jangan auto-fill old queue dengan current version.
5. **Reviewed additive migration/shadow reads:** setelah gate sebelumnya, siapkan
   migration baru dan rollback plan yang disetujui. Read-only counts/hashes sebelum/
   sesudah; existing report values/version null harus tetap. Baseline hanya explicit
   authorized parcel dengan valid current geometry, observed-now provenance.
6. **Cohort activation:** semua writer dalam cohort memakai versioned protocol
   sebelum adoption. Pantau VERSION_CONFLICT/GEOMETRY_VERSION_STALE, permission
   failures, retry/expiry, orphan/head reconciliation dan legacy/null-version rate.
   Logs aggregate/redacted, bukan polygons/phones/private photo URLs.

## 10. Rollback dan evidence preservation

- Local PoC: tidak ada production schema activation yang perlu di-rollback. Runner
  hanya membuang cluster sintetis miliknya setelah stop; tidak menyentuh other DB.
- Sebelum candidate transaction commit, error instalasi harus rollback transaksi
  tersebut; skenario ini masih memerlukan engine proof.
- Setelah future adoption: hentikan **new adoption/write path** pada cohort yang
  bermasalah; pertahankan compatible read/report-receipt acknowledgement. Aplikasi
  lama boleh membaca compatibility polygon, tetapi direct polygon/declared writes
  pada adopted parcel tetap ditolak. Rollback ke writer lama tanpa protocol support
  tidak aman; jangan melemahkan guards untuk membuat rollback tampak berhasil.
- Simpan semua versions/receipts/report associations/audits. Jangan DROP CASCADE,
  reset head ke old version, mass-null report FK, rewrite coordinates/hash/photo/
  timestamps atau delete failed/stale queue evidence.
- Boundary correction setelah commit adalah **new version dengan expected current
  head**, reason dan evidence, bukan UPDATE versi lama. Ownership/Poktan transfer,
  historical evidence association dan human review event adalah separate reviewed
  workflows yang belum ada di PoC.

## 11. Kesimpulan dan exact next milestone

| Keputusan | Lingkup |
|---|---|
| **GO** | Review local reference implementation, 34 unit cases, green regressions/build dan candidate/harness design. |
| **CONDITIONAL GO** | **D2 follow-up: Disposable PostgreSQL Transaction Proof** setelah existing PG15+ tersedia/disetujui; kemudian native Supabase integration dan client/offline protocol gate. |
| **NO-GO** | Apply candidate ke shared/staging/produksi, baseline/adopt live parcels, claim fully validated/deployed versioning, atau gunakan output sebagai ownership/insurance approval. |

Exact next milestone adalah menjalankan **actual D2 disposable PostgreSQL harness**
dan menyelesaikan engine/RLS/transaction/concurrency findings, bukan langsung
overlap/claims rollout. Setelah itu baru approved native-platform/client integration.

`VALID_GEOMETRY` tetap bukan `VERIFIED_OWNERSHIP`; geofence/version binding bukan
legal/cultivation authorization, overlap prevention atau claim anti-fraud. PPL report
verification bukan insurer decision. Luas polygon bukan measured affected area,
confidence bukan persentase kerugian. D2 tidak mengubah batas-batas interpretasi itu.
