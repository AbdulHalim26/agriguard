# PHASE 2.0D.1 — Validasi geometri lahan dan inventaris read-only

Tanggal: **17 November 2026**. Implementasi lokal, regresi, TypeScript dan build
**IMPLEMENTED_AND_TESTED**. DB/browser/deployed integration tetap **IMPLEMENTED_BUT_UNVERIFIED** atau
**BLOCKED** oleh lingkungan/otorisasi. Versioning/overlap/PostGIS adalah **PROPOSED /
REQUIRES_APPROVAL**, bukan migrasi yang diterapkan.

## 1. Findings source aktual

- `lahan.polygon` adalah JSONB, konvensi flat `[[longitude,latitude],…]`.
  Seed mempunyai lima ring tertutup eksplisit; editor Leaflet mengirim open ring.
- Sebelum fase ini, create/update server action hanya memeriksa tuple/minimum
  panjang; PATCH terpisah hanya menerima nama/area dan dapat mengabaikan polygon
  unknown. Validasi topologi belum menjadi aturan shared server.
- Form/list mempunyai shoelace dalam derajat ×111000². Luas tersimpan berasal dari
  `area_hectares` yang dideklarasikan pengguna, bukan survei/geodesic calculation.
- RLS owner/same-Poktan/Dinas, restrictive phone-OTP, pinned identity dan grants
  0010/0011 tersedia pada source. Tidak ada klaim sudah diterapkan di produksi.
- `damage_reports.lahan_id` FK menunjuk current lahan, tanpa geometry version.
  Geofence sebelumnya ray-casting dengan perlakuan tepi tidak konsisten.
- `owner_id`, Poktan membership, posisi GPS dan polygon valid bukan legal title,
  verified cultivator mandate atau claim authorization.

Referensi yang dibaca: dokumen 2.0A-05/06/08/09, migrasi `0001`, `0002`, `0010`,
`0011`, land CRUD/Leaflet, report submission serta auth/session contracts.

## 2. Actual files changed

**Baru:**

- `lib/land/geometry.ts` — validator, geodesic area, derived assessment, containment.
- `lib/land/server.ts` — shared create/update server operation, tanpa service-role bypass.
- `lib/land/inventory.ts` — read-only per-record diagnostics dan narrow demo SQL reader.
- `scripts/land-geometry-inventory.ts` — local-only JSON/seed CLI, redacted stdout/private export.
- `components/features/LandGeometrySummary.tsx` — declared/computed/UNVERIFIED presentation.
- `tests/land-geometry.test.ts` — geometry, reference, registration, report dan inventory regressions.
- `tests/fixtures/land-area-reference.json` — independent analytic/published reference values.
- Dokumen ini.

**Existing diubah:**

- `package.json`, `package-lock.json` — pinned `geographiclib-geodesic@2.2.0` dan
  `land:inventory`; script/security changes fase terdahulu tetap dipertahankan.
- `app/(app)/lahan/actions.ts` — create/update memakai shared server operation;
  list read tetap non-destructive dan account-scoped.
- `app/api/lahan/[id]/route.ts` — PATCH memakai operation yang sama; DELETE existing
  tidak diubah menjadi cascade/privileged deletion.
- `app/(app)/lahan/LahanForm.tsx`, `LahanList.tsx` — shared preview/validation,
  deklarasi terpisah, tanpa simplified planar formula.
- `lib/geo.ts` — existing boolean geofence memakai validated containment.
- `lib/reports/submit.ts` — invalid stored geometry menghasilkan explicit error
  sebelum upload/new report, tanpa mengubah receipt/idempotency.
- `app/(app)/scan/page.tsx`, `ScanMap.tsx` — pesan invalid boundary serta safe rendering.
- `app/(app)/peta/PetaMap.tsx` — invalid legacy boundaries tidak digambar sebagai
  geometri valid; record asli tetap ada dan diberi penjelasan.

Tidak ada perubahan SQL, historical records, report FKs/coordinates, model, YOLO,
training data/review, authentication contract, production env, commit/push/deploy.

## 3. Geometry API contract implemented

### Input

Hanya **satu flat ring 2D** `[[lon,lat],…]`, angka finite. Open maupun explicitly
closed ring diterima. GeoJSON object, nested rings/holes/MultiPolygon, text JSON,
altitude tuple atau numeric strings pada posisi ditolak; tidak ditebak/dikonversi.

`validatePolygon(unknown)` mengembalikan discriminated result:

- Invalid: `valid:false`, stable `errors[{code,message,vertices?/edges?}]` dan
  diagnostics. Maksimum 16 issue untuk bounded error payload.
- Valid: `valid:true`, `original_ring`, `normalized_ring`, normalization action,
  diagnostics dan area metrics. **`verification_status:UNVERIFIED`** tetap.
- `assessLandGeometry(input, declared)` menambahkan declared/computed m²/ha,
  signed difference (computed−declared), relative difference, method dan status.
  Tidak ada ownership/affected-area approval.
- `calculateGeodesicArea(input)` selalu memvalidasi dahulu; invalid input throw
  dengan code/message, bukan area nol yang seolah sah.

### Closure, precision dan bounds

| Kebijakan `land-geometry-v1` | Implementasi |
|---|---|
| Posisi | Tepat dua angka `[longitude,latitude]`; tidak auto-swap atau clamp. |
| Rentang | Longitude −180…180, latitude −90…90; setelah itu unsupported-domain checks. |
| Vertex | ≥3 distinct; maksimum 500, di luar satu closing position sah. |
| Explicit closure | First/last numerically equal; satu closing point tidak dihitung sebagai vertex tambahan. |
| Open ring | Derived copy menambahkan first point; **stored polygon tetap original open ring**. |
| Near closure/duplicates | `1e-10°` numerical comparison per axis; near-coincident atau repeated interior/consecutive vertices ditolak, tidak dihapus/snap. |
| Topology | Crossing, non-adjacent touching, collinear overlap, adjacent backtracking dan degeneracy ditolak. Concave simple polygons/straight continuation dapat valid. |
| Luas minimum | >0,01 m² dalam model; zero/tiny/near-collinear geometry tidak menjadi luas andal. |
| Global cases | Antimeridian, `|latitude| ≥85°`, atau bbox span >5° per axis ditolak eksplisit. Bukan verifikasi region administratif Karawang. |

EPS adalah batas komputasi, kira-kira **0,011 mm per axis lintang**, bukan GPS
uncertainty atau geofence buffer meter. Orientation memakai local coordinate
differences dan scale-aware floating roundoff allowance. Tidak ada rounding,
reorientation, vertex deletion atau penyederhanaan boundary dalam write path.

Normalisasi deterministik mempertahankan urutan/winding/angka dan hanya membuat
closure dalam **salinan turunan**. Preservasi original berarti coordinate values/
ordering pada JSON, bukan lexical whitespace request body yang tidak disimpan JSONB.

### Stable geometry codes

`MISSING_GEOMETRY`, `UNSUPPORTED_FORMAT`, `INVALID_POSITION`,
`NON_FINITE_COORDINATE`, `COORDINATE_OUT_OF_RANGE`, `TOO_MANY_VERTICES`,
`INSUFFICIENT_DISTINCT_VERTICES`, `CONSECUTIVE_DUPLICATE`, `DUPLICATE_VERTEX`,
`UNSUPPORTED_ANTIMERIDIAN`, `UNSUPPORTED_POLAR`, `UNSUPPORTED_EXTENT`,
`SELF_INTERSECTION`, `SELF_TOUCH`, `OVERLAPPING_EDGES`, `EDGE_BACKTRACK`,
`DEGENERATE_POLYGON`, `AREA_CALCULATION_FAILED`.

Diagnostics membedakan checked/unchecked; `self_intersection:null` ketika input
belum aman untuk diperiksa bukan klaim tidak ada intersection.

## 4. Metode luas dan independent references

Existing dependency tidak menyediakan polygon area ellipsoidal yang cocok untuk
server/client. Ditambahkan hanya **GeographicLib geodesic 2.2.0**, MIT, tanpa runtime
dependency transitif (npm metadata: 293.960 bytes unpacked termasuk sources/tests).
Bukan framework GIS, PostGIS, atau paket ML; paket DMS tidak dipasang.

- Algoritme geodesic Karney, **WGS84 ellipsoid**, `a=6378137 m`,
  `f=1/298.257223563`, surface height model zero.
- Sisi area adalah shortest WGS84 geodesics antar vertex. GeographicLib menerima
  lat/lon; adapter secara eksplisit memasukkan `AddPoint(lat,lon)` dari stored lon/lat.
- Signed winding area diambil absolute; `ha=m²/10000`. Perimeter juga tersedia.
- Validation topologi/containment adalah local lon/lat linear-ring model, seperti
  JSON geometry. Projected Leaflet lines dan geodesic edges bukan definisi identik
  pada extent besar. API mengungkap kedua edge models; dukungan global dibatasi.
- Raw calculations double precision dan **tidak dibulatkan** sebelum comparison/
  return. UI biasanya membulatkan ha ke ≤4 decimals dan m² ≤2, dengan significant
  digits fallback agar nilai positif sangat kecil tidak menjadi tampilan nol.
- Ini luas **model polygon**, bukan survey/topografi, legal/cadastral certification,
  atau measured affected area. GPS/boundary input uncertainty dapat jauh lebih besar
  daripada numeric error algoritme.

Independent fixtures tidak dihasilkan dari output aplikasi:

| Analytic WGS84 meridian/parallel surface integral | Reference m² | Toleransi |
|---|---:|---:|
| Karawang 0,001° box | 12236.422579571597 | 0,01 m² |
| Karawang 0,0001° box | 122.36432929802905 | 0,01 m² |
| Equator 0,001° box | 12309.072078686677 | 0,01 m² |
| Latitude 45°, 0,001° box | 8762.313487978268 | 0,01 m² |

Formula surface-element integral dan bounds disimpan di reference JSON; nilainya
dihitung memakai Python stdlib math, bukan GeographicLib/aplikasi. Parallel edges
sedikit berbeda dari geodesic edges; toleransi berlaku untuk short boxes tersebut,
**bukan** general accuracy guarantee atau survey tolerance.

Published GeographicLib non-polar Planimeter diamond juga diuji: area
**24619419146 m² ±1 m²**, perimeter **627598,2731 m ±0,0001 m**. Winding reversal,
closure/units dan invalid-input rejection diuji terpisah. Tidak memakai self-output
sebagai satu-satunya expected value.

Referensi yang ditinjau: [GeographicLib JS docs](https://geographiclib.sourceforge.io/JavaScript/doc/index.html),
[geodesic package source](https://github.com/geographiclib/geographiclib-js/tree/main/geodesic),
Karney, *Algorithms for geodesics*, J. Geodesy 87 (2013), DOI
[10.1007/s00190-012-0578-z](https://doi.org/10.1007/s00190-012-0578-z).

## 5. Integrasi server, auth dan kompatibilitas legacy

Create server action, update server action dan PATCH memakai `writeLahan` yang sama:

1. Hardened authenticated `getUser`; create group berasal dari profile server.
2. Update menuntut valid target UUID, row terlihat oleh RLS, `owner_id` cocok,
   profile/Poktan tersedia dan konteks Poktan tetap cocok. Same-Poktan reader/PPL/
   Dinas tidak memperoleh hak mengedit bidang orang lain.
3. Hanya nama, declared area, polygon yang diterima; owner/Poktan/computed area/
   verification payload tidak dipercaya. Error Bahasa Indonesia dan stable code.
4. New/supplied polygon divalidasi **sebelum** satu INSERT/UPDATE. Invalid geometry
   422; invalid input 400; no auth 401; forbidden/profile/group mismatch 403;
   missing record 404; changed-owner race 409; service error 503.
5. UPDATE kembali memfilter ID+owner+Poktan pada statement. Race identitas/akses
   tidak memperbarui row yang sudah pindah owner. Boundary/head-version concurrency
   masih memerlukan future versioning RPC.
6. Persist **original ring dan declared area**, bukan normalized closure atau computed
   area. Metadata hasil hitung hanya tambahan response, tidak ditulis sebagai survey.

**Transition:** valid legacy open/closed rings tetap diterima. Metadata-only update
yang tidak menyertakan `polygon` boleh memperbaiki nama/deklarasi milik sendiri
tanpa memaksa repair ring lama invalid; assessment tetap menunjukkan invalid.
Jika polygon secara eksplisit dikirim ulang, aturan baru berlaku. Poktan mismatch
perlu koreksi relasi oleh operator berwenang, bukan auto-move/self-rebind.

List/inventory/render tidak menulis ulang ring/area. Invalid legacy map shapes tidak
digambar sebagai shape valid dan diberi penjelasan, bukan dihapus dari registry.

**Batas enforcement:** ini validasi **jalur aplikasi**, bukan constraint DB baru.
Existing direct Supabase table grants/policies tidak dimigrasikan. Direct REST/SQL
writers yang masih mempunyai privilege tidak otomatis melalui validator ini.
DB-level guarantee membutuhkan approved RPC/constraints/restricted writes dan
isolated tests; tidak diklaim complete/deployed pada fase ini.

## 6. Geofence dan report compatibility

- `classifyPointInPolygon` mengembalikan INSIDE/BOUNDARY/OUTSIDE/INVALID_POINT/
  INVALID_GEOMETRY. Existing boolean wrappers tetap tersedia.
- Interior/exterior valid legacy behavior dipertahankan; tepi/vertex sekarang
  konsisten inclusive **hanya dengan numeric EPS**, bukan GPS uncertainty approval.
- Invalid stored ring menolak **new** report sebelum photo upload/insert dengan
  `INVALID_FIELD_GEOMETRY` (422), bukan “klaim ditolak”. UI mengarahkan pemeriksaan
  boundary dan tidak mengubah foto/koordinat.
- Existing durable report retry tetap mengakui key/receipt/ref yang sudah ada;
  tidak me-reassign parcel/coordinates berdasarkan batas current yang berubah.
  Blocked offline entries tetap dipertahankan oleh recovery/sync existing.
- Valid explicit owner geometry update dapat mengganti **current** boundary, tetapi
  tidak mengubah `damage_reports.lahan_id`, AI/receipt/hash, atau report coordinates.
  Fase ini belum merekam immutable geometry versions—jangan mengklaim mengetahui
  batas historis yang tidak pernah disimpan.
- Geofence valid bukan proof legal ownership, cultivation authorization atau klaim.
  Existing owner/same-Poktan report-access semantics belum menjadi verified parcel grant.

## 7. Read-only inventory: hasil yang benar-benar dijalankan

Sumber yang digunakan: **lima record demo** dalam
`supabase/migrations/0002_seed.sql`, dibaca sebagai literals dengan parser sempit;
**SQL tidak dieksekusi**. Input SHA-256 sebelum/sesudah:
`1b16c7f94e7021741b15f5f9555892619a4f217eff305d4886118daf60cf57dd`.
Tidak ada data Supabase live/produksi diinventarisasi atau diekspor.

| Urutan seed, bukan identitas petani nyata | Deklarasi ha | Hitung WGS84 ha | Hitung−deklarasi ha | Inventory status |
|---|---:|---:|---:|---|
| 1 | 0,75 | 1,223642258 | +0,473642258 | AREA_DISCREPANCY_REVIEW |
| 2 | 0,50 | 1,223644558 | +0,723644558 | AREA_DISCREPANCY_REVIEW |
| 3 | 1,00 | 1,223637657 | +0,223637657 | AREA_DISCREPANCY_REVIEW |
| 4 | 0,60 | 1,223646857 | +0,623646857 | AREA_DISCREPANCY_REVIEW |
| 5 | 1,20 | 1,223633055 | +0,023633055 | VALID_GEOMETRY |

**Semua lima ring valid secara struktur**: explicit closure, 4 distinct vertices,
tanpa topology defect yang terdeteksi. Inventory categories: INVALID=0,
VALID_GEOMETRY=1, AREA_DISCREPANCY_REVIEW=4, INSUFFICIENT_DATA=0. Kategori review
selisih tidak mengubah geometric validity dan **bukan fraud/ownership verdict**.

Engineering triage provisional: absolute difference **>0,01 ha AND >20% dari
declared area**. Tidak memblokir registration atau menetapkan actual land area.
Relative overflow tidak menghasilkan Infinity/false-safe: ratio unavailable
diberi reason; comparison memakai multiplication yang aman.

Tool melaporkan parcel/owner/Poktan references, format/counts/closure, error codes,
checked-vs-unknown diagnostics, declared/computed/difference dan concerns. Missing
geometry/declaration/references adalah INSUFFICIENT_DATA; explicit malformed shape
INVALID_GEOMETRY. Tidak ada automatic repair/approval/claim authorization.

### Menjalankan secara lokal

```sh
npm run land:inventory -- --seed
npm run land:inventory -- --input /authorized/local/fixtures.json
npm run land:inventory -- --input /authorized/local/fixtures.json --output /private/NEW-inventory.json
```

Input JSON adalah array dengan minimal `id, owner_id, poktan_id, polygon,
area_hectares` jika tersedia; missing fields tetap didiagnosis. Maksimum 2000 rows/
10 MiB, filesystem regular file/non-symlink; remote URL tidak diterima. Parser SQL
hanya untuk demo seed layout yang diketahui; perubahan INSERT lahan fail-closed,
bukan dieksekusi atau dilewati diam-diam.

Stdout hanya aggregate counts/source hash. Export detail hanya opt-in ke file NEW,
exclusive `wx`, mode **0600**; tidak menimpa input/output atau mencetak nama,
telepon, coordinates, owner/Poktan references ke public logs. Error CLI tidak
mencetak JSON fragments, stack atau source paths. Private refs tetap sensitive.
Label source `AUTHORIZED_LOCAL_JSON` adalah asumsi/prosedur operator, bukan bukti
bahwa tool mengautentikasi mandat, hak lahan, atau izin penggunaan data tersebut.

Artefak seed aktual dibuat di approved TMPDIR:
`/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode/land-geometry-seed-d1.json`.
Mode **600** diperiksa. Sumber unchanged; output tidak mengganti seed/DB.

### Prosedur staging berikutnya — REQUIRES_APPROVAL

1. Operator menyetujui isolated project, scope petani/Poktan dan tujuan inventory.
   Jangan menunjuk project produksi atau menyalin credentials ke command/chat.
2. Dengan identity/role scoped dan RLS tetap aktif, export minimal columns di
   lingkungan tersebut: `id,owner_id,poktan_id,polygon,area_hectares`. Tidak perlu
   nama/telepon/Auth records/photos. Dinas/admin scope lebih luas perlu mandat jelas.
3. Simpan export JSON privat 0600 dan input hash; jalankan tool **offline/local**.
   CLI tidak punya Supabase client, network/credential loading atau UPDATE capability.
4. Review counts, geometry concerns dan discrepancy secara manusia. Tidak auto-fix,
   auto-merge, rebind ownership, atau mengganti data historis.
5. Simpan source+report hash/protocol dan retention/access policy; setiap koreksi
   kelak command terpisah oleh pihak berwenang, dengan versioning/audit yang disetujui.

## 8. Immutable geometry versioning design — PROPOSED / REQUIRES_APPROVAL

Tidak ada table/column/version ID baru dibuat pada fase ini.

Proposed `lahan_geometry_versions` (nama final memerlukan review):

- `geometry_version_id` UUID immutable; `parcel_id` FK existing `lahan.id`.
- `version_number`, unique `(parcel_id,version_number)`; previous-version reference
  harus parcel yang sama. Head advancement memakai expected previous head.
- Original JSON coordinate snapshot+format, derived closed ring, semantic geometry
  hash, validation policy/errors, computed m²/ha, declared-area snapshot dan method/
  ellipsoid/package version. Raw request bytes jika diperlukan disimpan sebagai
  evidence tersendiri, tidak mengklaim JSONB mempertahankan lexical formatting.
- DB `recorded_at/effective_at`, authenticated actor, required reason for material
  change, source/evidence refs dan provenance origin.
- Geometry review status at creation UNVERIFIED; later review decisions berupa
  **append-only events**, bukan mutasi frozen coordinates/calculation. Ownership/
  cultivation/claim authorization tetap relationship/workflow terpisah.

Proposed current head pointer di `lahan` dan nullable geometry-version FK pada
**new** `damage_reports`; original `lahan_id` FK tetap. DB constraint/RPC harus
memastikan version parcel sama dengan report parcel. Atomic submission membaca/
mengunci head, mengecek geofence+authorization terhadap snapshot itu, lalu insert
report dengan version ID yang sama agar boundary-update race tidak salah bind.

Boundary update: transaction lock parcel, expected-head check, insert new immutable
version+change/review event, advance current head dan compatibility JSON current
view secara atomik. Derive previous validity end dari next effective event, bukan
menulis ulang koordinat/version lama. Concurrent changes fail/retry explicit;
service-role bypass bukan validasi bisnis.

### Strategi legacy dan rollback

- Pre-versioning reports tetap `geometry_version_id:null`, provenance
  **LEGACY_BOUNDARY_UNKNOWN**. Tidak mengisi current boundary sebagai historical fact.
- Optional current baseline capture memakai waktu capture sebenarnya dan tag
  **BASELINE_CAPTURED_NOT_HISTORICAL**; tidak diberi timestamp masa lalu.
- Jika historical authoritative evidence benar-benar ada, association proposal
  direview sebagai event tersendiri; tidak rewrite FK/coordinates/report evidence.
- Invalid legacy geometry tidak di-MakeValid/snap otomatis untuk meloloskan backfill.
- Additive migration di isolated DB, shadow compare + reconciliation counts/hashes,
  native OTP/RLS/effective ACL tests dan legacy-reader compatibility dahulu.
- Rollback aplikasi ke compatible current JSON read tanpa menghapus versions/
  association/audit evidence, mereassign old reports atau melemahkan RLS. No cascade
  drop untuk merapikan migration yang belum diverifikasi.

## 9. Overlap, rights dan PostGIS — defined, NOT enforced

Future candidate index boleh bbox, tetapi bbox overlap tidak membuktikan interior
overlap; concave/disjoint polygons dapat punya bbox beririsan. Exact checks harus
membedakan edge/vertex touch, partial interior overlap, equality dan full containment
dua arah. `ST_Overlaps` saja tidak mencakup seluruh kasus containment/equality.

Numerical EPS fase ini bukan GPS uncertainty. Future policy menyimpan device/source
accuracy dalam meter, precision/metode, geometry versions dan evidence; tolerance
review bukan snap/buffer yang membuktikan hak. Positive-area overlap memicu conflict
review yang menjaga bukti kedua pihak, bukan theft/fraud verdict atau auto-reject claim.

Registered landholder/legal owner/authorized cultivator/Poktan member/representative
dibedakan. Shared cultivation/mandate/transfer mempunyai scope, time dan evidence;
first registration tidak memenangkan hak secara permanen. User lain tetap bisa
mengajukan koreksi/keberatan; data parcel existing tidak diganti diam-diam.

PostGIS cocok sebagai **future option** pada Supabase PostgreSQL untuk topology,
exact overlap/containment, geodesic area dan spatial indexing. PRD v1 mengatakan
tanpa PostGIS: deviation memerlukan approval. Tidak di-enable pada fase ini.

Isolated plan: reviewed extension version/non-exposed schema → additive geometry/
version tables dengan SRID/coordinate checks → dry-run invalid-row quarantine tanpa
repair → exact-predicate/reference-area parity tests → RPC/ACL restrictions. Matrix
anon/password-only/owner/same-Poktan/PPL lintas scope/Dinas dan direct REST bypass
harus diuji, termasuk redacted cross-group conflict results, concurrent overlapping
registrations dan head/report version races. Rollback mempertahankan evidence;
tidak `DROP EXTENSION ... CASCADE` terhadap data penting atau production migration.

## 10. Verification ledger

Lingkungan lokal: Node **26.8.1**, Python **3.12.15**, Next.js **15.5.28**.
Release-engine Node 24/container Python 3.11 belum diverifikasi ulang.

| Check yang benar-benar dijalankan | Hasil dan batas |
|---|---|
| Focused `node --import ./tests/register.mjs --test tests/land-geometry.test.ts` | **51/51 PASS** pada run focused; full suite juga memuat assertion terakhir. |
| `npm run test:security` | **199/199 PASS**: 51 geometry/land/inventory baru + 148 existing security, advisory, EWS, offline, detector dan review tests. |
| Python `unittest discover -s ai-service/tests -p 'test_*.py' -v` | **73/73 PASS**, termasuk real EfficientNet contract dan synthetic detector/QA/readiness. Bukan training/accuracy evaluation. |
| `npm run build` dengan local placeholder env | **PASS**, 25 static pages. Cookie-dependent `/dashboard` dan `/lahan` dynamic diagnostics adalah expected, bukan build failure. |
| `./node_modules/.bin/tsc --noEmit --incremental false` setelah build | **PASS**. Tidak berjalan paralel dengan regenerasi `.next/types`. |
| `git diff --check` | **PASS**. |
| Demo inventory, source SHA-256 dan private output mode | **PASS**, hasil aktual §7; sumber tidak diubah, mode 600. |
| `git diff --exit-code -- PRD.md README.md supabase/migrations/0001_init.sql supabase/migrations/0002_seed.sql ai-service/predict.py ai-service/model/model.onnx ai-service/model/model_v2.onnx ai-service/model/model_v2.metadata.json` | **PASS**, historical references, seed/schema dan classifier artifacts tersebut tidak berubah. |
| `npm view geographiclib-geodesic ...`, `npm install --no-audit --no-fund`, `npm ls --depth=0 geographiclib-geodesic` | Satu related package **2.2.0** dipasang; lock diff hanya paket itu. Node engine warning 26 vs target 24 dicatat; tidak memasang paket ML/Geo framework lain. |

Tes mencakup independent references, raw-input immutability, finite/range/type/closure/
duplicate/crossing/touch/backtrack/concavity/polar/extent/complexity, numeric tolerance,
owner/group filters, invalid prewrite rejection, access-change race, original report
references, legacy metadata-only update, seed parser dan CLI privacy/no-overwrite.
Transport fakes **bukan RLS emulator**; tidak mengklaim transaksi DB/deployed grants
atau survey accuracy dari hasil unit tests.

Perintah verifikasi aktual dari repo root:

```sh
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" node --import ./tests/register.mjs --test tests/land-geometry.test.ts
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" npm run test:security
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v
```

Build memakai environment proses saja, bukan perubahan file credentials:

```sh
env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder AI_API_URL=http://127.0.0.1:1 OPENWEATHER_API_KEY= NEXT_PUBLIC_APP_URL=http://127.0.0.1:1 AUTH_PHONE_OTP_ENABLED=false EWS_DEMO_ENABLED=false npm run build
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

Browser/Leaflet device tests, deployed SQL/RLS, staging inventory/DB transactions:
**UNVERIFIED**. Tidak ada real parcel export, production connection, PostGIS enable,
SQL execution/migration, model training, credentials change atau deployment.

## 11. Batas dan blockers

- Application validation bukan DB constraint; global direct-write enforcement,
  immutable boundary/report binding dan atomic version/audit memerlukan approved
  schema/RPC work.
- Supabase native OTP/RLS/grants/legacy-account gates 0A/0A.1 tetap; fakes tidak
  membuktikan enforcement di deployment.
- Numerical topology local lon/lat dan geodesic area model tidak menjadi surveyed
  boundary, legal ownership, station/admin mapping, affected area atau insurance eligibility.
- Unsupported formats/global regions/complexity membutuhkan explicit reviewed
  format/method change, bukan silent conversion/simplification.
- Valid current boundary updates belum menghasilkan historical snapshot. Old report
  FK/coords tetap; correct historical boundary tidak dapat direkonstruksi tanpa bukti.
- Browser/Leaflet actual interaction dan DB concurrency tetap belum diverifikasi.

**PHASE 2.0D.1 selesai untuk local implementation + deterministic regression + build.**
GO untuk review lokal; staging/versioning/PostGIS memerlukan approval dan bukti
integration terisolasi. Tidak ada authorization/insurance verification tersirat.

Exact next milestone yang disarankan: **PHASE 2.0D.2 — Immutable Geometry Versioning
Proof di Isolated Staging**, setelah schema/ACL/rollback plan disetujui. Mulai dengan
append-only snapshots/head concurrency dan new-report version binding; jangan
retroassign legacy reports, mengaktifkan ownership verification, atau menerapkan
inter-parcel claim rejection sebagai efek samping.
