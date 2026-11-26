# PHASE 2.0A — Geometri bidang dan integritas hubungan pengelolaan

Tanggal: **16 November 2026**. Status: **PROPOSED / REQUIRES_APPROVAL**.
Tidak ada migrasi atau verifikasi kepemilikan yang dijalankan oleh dokumen ini.

## 1. Audit EXISTING

- `supabase/migrations/0001_init.sql::lahan`: UUID, Poktan, `owner_id`, nama,
  `area_hectares numeric`, `polygon jsonb`, waktu dibuat. Belum ada version,
  topology, area-derived, overlap atau verification lifecycle.
- `app/(app)/lahan/actions.ts`: nama, input luas positif ≤1000 ha, array ≥3
  tuple angka; tidak menetapkan batas lat/lon/topology/overlap pada polygon.
  Create mengikat owner ke sesi dan Poktan dari profile. Update owner dapat
  mengganti polygon tanpa snapshot yang dipakai laporan lama.
- Leaflet `LahanForm.tsx`: klik/drag titik (UI max 50), storage `[lng,lat]`,
  render Leaflet `[lat,lng]`, OSM/Esri. Ring yang ditulis tidak wajib closed.
- `calculateArea`: shoelace derajat ×111000²/10000, hanya estimasi UI; tidak
  memperhitungkan spheroid/longitude scale dan tidak menjadi area server-derived.
  Area tersimpan berasal dari input pengguna terpisah.
- `lib/geo.ts`: ray-casting untuk geofence laporan. Tidak ada tolerance/GPS
  accuracy/topology; titik tepat di tepi tidak mempunyai kebijakan eksplisit.
- RLS existing owner/same Poktan, Dinas serta restrictive phone-OTP dari `0010`;
  kebijakan INSERT/UPDATE `lahan` lama berbasis owner, bukan proof geometri/hak.
  Tidak menganggap grants/policies sudah terpasang di produksi.

`owner_id` di UI/DB adalah relasi pendaftar existing. **Bukan sertifikat legal**.
GPS, polygon, undangan Poktan atau metadata pengguna tidak membuktikan kepemilikan.

## 2. Model konseptual PROPOSED (nama tabel belum merupakan schema final)

| Entity | Identitas dan tanggung jawab |
|---|---|
| Parcel | Stable `parcel_id`; pertahankan existing `lahan.id` sebagai alias/mapping berjejak, jangan mengganti UUID/FK laporan. |
| Geometry version | Immutable version ID, canonical WGS84 geometry, raw JSON/hash, method/source, derived m²/ha, validation result/version dan effective time. |
| Party relationship | Subject profile, type, valid-from/to, season/scope, evidence references, verification events; tidak melekat permanen pada satu `owner_id`. |
| Parcel verification | Aktor berwenang, assigned area, time, reason, evidence dan previous/new lifecycle state. Append-only. |
| Conflict case | Pairs/geometry versions, relation/metrics, private evidence, objections, adjudicator, resolution; tidak auto-merge/replace. |

Jenis hubungan dibedakan:

1. **Registered landholder**: pendaftar/penanggung jawab record aplikasi.
2. **Legal owner**: klaim hak legal dengan sumber dokumen/otoritas yang applicable;
   AgriGuard mencatat verifikasi administratif, bukan menetapkan hak tanah secara hukum.
3. **Authorized cultivator**: penggarap dengan izin, rentang waktu dan porsi/scope.
4. **Poktan member**: keanggotaan kelompok; tidak otomatis punya mandat semua lahan.
5. **Authorized representative**: principal, mandat, action scope, expiry dan revocation.

Legal owner dan cultivator dapat berbeda. Multi-cultivator memerlukan pembagian
interest/area/waktu yang diverifikasi; tidak membagi atau menggandakan seluruh
bidang secara otomatis. Bukti sensitif disimpan privat dengan akses tujuan terbatas.

## 3. Spesifikasi geometri server

**PROPOSED**, diterapkan konsisten pada create/update/import dan direct DB writes
yang kelak diizinkan; validasi client hanya bantuan UX.

| Pemeriksaan | Aturan dan hasil |
|---|---|
| CRS/axis | WGS84 EPSG:4326, canonical GeoJSON `[longitude,latitude]`; finite angka, lon −180…180, lat −90…90; tidak auto-swap bila ragu. |
| Tipe | Pilot canonical single Polygon 2D; holes/MultiPolygon memerlukan dukungan eksplisit dan review. Unsupported shape disimpan sebagai draft evidence, tidak VERIFIED. |
| Ring | ≥3 vertex unik/non-collinear; ring canonical ≥4 positions termasuk first=last. Legacy open ring boleh dinormalisasi pada NEW version dengan ledger explicit closing, raw tidak diubah. |
| Repetisi | Closing vertex yang sama normal. Duplicate interior/consecutive vertices, zero-length edges dan near-coincident points ditolak atau diminta koreksi; tidak dihapus/di-snap diam-diam. |
| Topology | Positive area, valid simple ring; reject self-crossing, bow-tie, spike, degenerate edge dan ring/hole invalid. Catat reason+lokasi masalah. Jangan auto `MakeValid` lalu menganggap boundary disetujui. |
| Kompleksitas | Server limits untuk bytes/vertex/extent/version ditetapkan sebelum implementasi; UI max 50 existing bukan enforcement server. Extremely large/antimeridian/polar parcel di luar pilot masuk explicit review, bukan geometri planar palsu. |
| Precision | Raw precision dipertahankan; rounding tampilan tidak mengubah canonical geometry/hash. Area dihitung sebelum pembulatan display. Precision grid/snap hanya proposal versioned dengan reviewer approval. |
| Area | Server-derived geodesic m² pada spheroid WGS84, `ha=m²/10000`. Simpan declared area terpisah, jangan memperlakukannya sebagai measured area. Discrepancy tolerance perlu agronomy/survey approval. |
| Lokasi administratif | Spatial mapping pada geometry/admin-boundary dataset versioned; tidak menganggap district Poktan sama dengan district setiap bidang. Parcel lintas batas memerlukan assignment eksplisit. |
| GPS uncertainty | Simpan capture time, accuracy meter jika tersedia, source device/manual dan uncertainty. Missing/spoofable GPS bukan ownership proof. |
| Geofence laporan | Inside / boundary-uncertain / outside. Nominal inside tidak menjamin akurasi; uncertainty circle yang melintasi tepi perlu review. Boundary tolerance dalam meter, disetujui/versioned; tanpa accuracy jangan mengarang radius. |

Point-on-boundary dapat dianggap covered untuk pemeriksaan posisi, tetapi flag
uncertainty dan human checks tetap terpisah dari hak/klaim. Titik jelas di luar
tidak diubah paksa ke titik tengah. Evidence dipertahankan untuk koreksi/triage,
bukan disahkan sebagai kejadian parcel tersebut.

## 4. Overlap dan containment

Server mencari kandidat bbox/index kemudian **exact topology** pada geometri valid:

- equal/coincident, partial overlap, full containment A-in-B dan B-in-A;
- touching edge/vertex tanpa intersection area;
- small sliver/near-touch akibat GPS/precision uncertainty;
- disjoint yang jelas.

Simpan intersection m², `intersection/area(A)` **dan** `intersection/area(B)`,
jenis relasi, distance/boundary uncertainty serta geometry version IDs. IoU saja
dapat melewatkan parcel kecil yang sepenuhnya di dalam parcel besar. `ST_Overlaps`
saja juga tidak mencakup equality/containment. Bbox overlap bukan bukti konflik.

Threshold tolerance meter/m²/rasio **REQUIRES_APPROVAL**; tidak ada angka otomatis
untuk menyatakan fraud. Pure boundary touch tidak otomatis sengketa luas; beri
quality flag bila uncertainty belum jelas. Positive-area overlap yang belum
terselesaikan memicu validation/conflict workflow, tidak memverifikasi kedua
record secara diam-diam.

Cross-user/cross-Poktan conflict search harus mencakup parcel tersembunyi dari
pemohon. Privileged narrow operation hanya mengembalikan conflict token/status
yang diizinkan; tidak membocorkan pemilik, dokumen, exact polygon atau daftar
registrasi pihak lain kepada pengguna tanpa akses.

Klaim awal oleh pendaftar pertama tidak mengalahkan bukti petani sah. Registrasi
konflik baru disimpan sebagai request/evidence terpisah, existing parcel tidak
ditimpa. Human adjudicator mengoreksi boundary/relasi/version dengan audit; jangan
hapus laporan asli atau mengunci petani sah selamanya karena first registration.

## 5. Lifecycle parcel

```text
DRAFT → PENDING_VERIFICATION → VERIFIED
                    ↘ CONFLICT_REVIEW ↗ (hanya setelah resolusi)
VERIFIED → CONFLICT_REVIEW (bukti sengketa/perubahan material)
status aktif → ARCHIVED (alasan dan otoritas, tanpa hard-delete bukti)
```

- DRAFT: user menggambar/memperbaiki; tidak ada verified ownership/claim authority.
- PENDING_VERIFICATION: geometri formal valid dan permohonan bukti masuk; belum
  berhak dipromosikan dari metadata sendiri.
- VERIFIED: assigned reviewer memvalidasi geometry version dan scope relationship
  menurut protocol, tidak ada unresolved blocking conflict, audit atomik.
- CONFLICT_REVIEW: case terbuka; claim preparation tertahan, **evidence intake dan
  keberatan tetap tersedia**. Record VERIFIED sebelumnya tidak diam-diam dihapus.
- ARCHIVED: historical identity/geometry/authorization dan report FKs dipertahankan;
  penambahan laporan baru bergantung effective-time policy, bukan hard cascade delete.

Material boundary/authorization change membuat version baru dan re-review; tidak
menimpa geometry snapshot laporan lama. Transition final memakai expected version,
scope reviewer, timestamp server dan transaksi. Tidak membolehkan self-verification
atau role berasal dari client metadata.

## 6. PostGIS sebagai opsi — REQUIRES_APPROVAL

PRD v1 §5 secara eksplisit **tanpa PostGIS**. Rekomendasi v2: uji PostGIS pada
Supabase terisolasi karena topology/containment/geodesic area/GiST queries dekat
dengan sumber data dan mengurangi duplikasi geometri client/server. Ini bukan
persetujuan migrasi atau bukti extension telah aktif.

### Rencana additive dan kompatibilitas

1. Persetujuan perubahan locked technology decision, versi extension dan resource
   budget. Inspeksi deployment/schema aktual di lingkungan yang diotorisasi dahulu.
2. DB terisolasi dari migration history yang ada; pasang extension dalam dedicated
   non-exposed schema sesuai panduan Supabase, bukan mengekspos objek extension ke
   Data API. Fully-qualified names dan `search_path=''` untuk privileged routines.
3. Tambah geometry version/validation/relationship/conflict entities dan optional
   `geometry(Polygon,4326)`; original JSON/area/FKs tetap ada. `ST_IsValid`, non-null
   canonical geometry dan positive area sebagai syarat VERIFIED, bukan memaksa
   legacy invalid rows hilang agar migration lulus.
4. Dry-run backfill ke staging tables: valid/invalid/ambiguous per row, original
   hash dan comparison counts. Tidak auto-correct invalid polygon, auto-verify
   owner, menulis ulang historical reports, atau mengubah declared hectares.
5. Geodesic area `ST_Area(geom::geography)/10000` (spheroid default); bukan
   `ST_Area(geom)` pada derajat. Spatial GiST sebagai candidate index lalu exact
   predicates/intersection. Gunakan `ST_Covers`/boundary policy yang disetujui.
6. Feature-gated server adapter menghasilkan JSON `[lng,lat]` kompatibel Leaflet;
   comparison/shadow read sebelum switch. Snapshot geometry version untuk report
   baru dan kembali ke legacy read bila perlu, tanpa kehilangan new history.

### RLS, transaksi dan rollback

- Preserve pinned-phone OTP, officer scope, column grants dan receipt immutability.
  Same-Poktan read tidak berarti write/claim/ownership verification grant.
- Cabut direct mutation atas canonical geometry/verified state/authorization;
  pakai narrow transactional operation dengan caller identity, expected version,
  audit dan privilege checks. Service-role bypass bukan validasi bisnis.
- Cegah race dua overlapping registrations/approvals: untuk pilot, semua canonical
  registration/verification melewati satu **transaction-level advisory lock**
  konservatif yang sama, query exact candidates ulang, lalu insert/version/audit.
  Row lock saja tidak mengunci parcel yang belum ada. Partitioned locks kelak
  harus membuktikan tidak melewatkan parcel lintas cell/admin boundary.
- Jangan pakai exclusion constraint bbox `&&` sebagai keputusan overlap; dapat
  memblokir parcel sah dengan bbox beririsan tetapi polygon disjoint.
- Rollback aplikasi: disable new writes/read flag ke compatible JSON view, simpan
  seluruh version/conflict/grant evidence dan export backup. Jangan revert RLS,
  hapus new cases atau `DROP EXTENSION ... CASCADE`. Penghapusan additive schema
  hanya setelah dependency/backup audit dan persetujuan terpisah.

### Strategi tes aman

Isolated DB saja: rollback fixtures untuk bow-tie, collinear, duplicate, open/closed,
NaN/range/axis, holes unsupported, positive area, identical/contained/partial overlap,
edge/vertex touch, narrow sliver, disjoint-bbox-overlap, GPS near-boundary,
geodesic known reference dan precision. Dua transaksi competing membuktikan satu
approval konsisten. Petani/same Poktan/unrelated PPL/Dinas/password-only/anon
matrix menguji RLS, effective ACL, conflict redaction dan immutable history.

## 7. Acceptance criteria

- **LAND-AC1**: semua write paths divalidasi server/DB; invalid topology/range,
  degeneracy dan unsupported bentuk tidak dapat menjadi VERIFIED.
- **LAND-AC2**: area geodesik dari geometry version dan declared area terpisah;
  output hektar konsisten dan tidak menghitung square degrees sebagai m².
- **LAND-AC3**: equal/containment/partial overlap serta batas/tolerance teruji;
  concurrent registrations tidak diam-diam mengganti/memverifikasi konflik.
- **LAND-AC4**: actor, relationship scope/expiry/evidence dan lifecycle transisi
  dicatat atomik; undangan/GPS/self metadata tidak menjadi legal ownership proof.
- **LAND-AC5**: petani sah dapat mengajukan keberatan/evidence ketika conflict,
  sementara claim preparation tidak melewati unresolved authorization.
- **LAND-AC6**: migration/rollback/RLS compatibility dibuktikan di staging dengan
  approved plan; tidak ada production migration sebagai hasil PHASE 2.0A.

Referensi resmi diakses 16 November 2026:
[Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis),
[ST_IsValid](https://postgis.net/docs/ST_IsValid.html),
[ST_Area](https://postgis.net/docs/ST_Area.html).
