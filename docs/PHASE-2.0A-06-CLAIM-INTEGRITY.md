# PHASE 2.0A — Integritas incident, laporan, dan pencegahan duplikasi klaim

Tanggal: **16 November 2026**. Status: **PROPOSED / REQUIRES_APPROVAL**.
AgriGuard menyiapkan bukti/laporan; keputusan klaim ada pada penanggung berwenang.
Tidak ada integrasi resmi Jasindo atau claim submission API yang diverifikasi.

## 1. Baseline EXISTING dan batasnya

`lib/reports/submit.ts` dipakai server action dan `/api/sync`:

- Session/pinned-phone guard, claimed user cocok, input UUID/koordinat valid.
- User dapat submit bila owner **atau satu Poktan**; ini bukan per-parcel legal/
  cultivator authorization.
- Geofence ray-casting; foto 1–3 JPG/PNG ≤5MB; hash bytes dihitung server.
- Global unique UUID `idempotency_key`, submission payload hash dan lookup user+
  key. Retry sama mengembalikan row sama; beda payload conflict, tidak overwrite.
- Foto immutable content-addressed; interrupted retry memeriksa stored hash.
- Dedupe hanya **foto pertama, user yang sama, 24 jam**. Dua foto berbeda atau
  dua akun berbeda pada incident sama tidak dicegah oleh ini.
- AI receipt user+foto server-written; manual/pending/legacy dipisahkan. AI yang
  terlambat tidak mengubah laporan yang finalized.
- Verification RPC mengunci row dan mencatat audit atomik. Submission report dan
  audit submit masih operasi terpisah/best-effort; storage+DB bukan satu transaksi.
- Tidak ada season, incident, stable canonical parcel resolution, representative
  mandate, verified interest/share, atau claim-case uniqueness.

Local stub tests memverifikasi idempotent retries/receipt/offline; bukan bukti
constraint baru atau RLS/grants di production.

## 2. Batas objek dan workflow yang diusulkan

| Objek | Definisi |
|---|---|
| Damage report | Evidence/intake petani yang dapat berupa draft, submitted, pending review, additional evidence, verified atau invalid. Tidak otomatis klaim. |
| Verified parcel | Stable parcel ID + immutable geometry version dan hubungan/otorisasi pada waktu relevan; lihat [land design](PHASE-2.0A-05-LAND-INTEGRITY.md). |
| Agricultural season | ID stabil, interval tanam/panen dan crop cycle yang diverifikasi; bukan string bebas dari klien. Bukan membuktikan policy coverage. |
| Incident | Kejadian dugaan kerusakan, event time range/region/cause status, evidence dan canonical/alias identity. Incident ID bukan bukti banjir confirmed. |
| Incident case | Satu konteks canonical `(parcel_id, season_id, canonical_incident_id)` dengan banyak evidence reports dan authorized parties. |
| AUTP preparation | Snapshot versi bukti/laporan verified dan persyaratan policy yang applicable; human-prepared, bukan insurer decision. |
| Insurer decision | Keputusan eksternal oleh otoritas penanggung; tidak diturunkan AI atau tombol verifikasi PPL. Belum ada integration implementation. |

**Claim preparation memerlukan verified parcel, authorized submitter, verified
season/incident linkage dan evidence review.** Petani dengan parcel disputed/
unverified tetap dapat menyimpan draft atau mengirim **damage evidence intake**
untuk peninjauan tanpa mengklaim verified ownership/eligibility. Jangan membuang
kejadian asli atau memblokir laporan darurat hanya karena administrasi belum selesai.

Untuk banyak penggarap sah, satu incident case dapat memuat beberapa interest/
share yang diverifikasi; jangan otomatis memberi setiap akun satu klaim seluruh
bidang. Tata cara beneficiaries/coverage harus dikonfirmasi dari policy/otoritas.

## 3. Identitas dan constraints konseptual

**PROPOSED**, belum migration:

- Pertahankan existing report UUID/idempotency dan receipts. Tambahkan immutable
  links `parcel_id`, `geometry_version_id`, `season_id`, `incident_id/case_id`,
  submitter/principal/authorization-grant snapshot setelah verifikasi.
- Satu canonical incident case per `(parcel, season, canonical incident)` dengan
  DB unique constraint. Banyak report/evidence updates boleh terhubung ke case
  sama; constraint tidak diletakkan pada `(parcel)` saja atau `(parcel,year)`.
- Withdrawal/rejection tidak membuka duplikasi case baru untuk incident yang sama;
  lanjutkan case/appeal dengan version/event baru. Kejadian baru mempunyai incident
  identity yang benar-benar berbeda setelah pemeriksaan, bukan hanya UUID baru.
- Grant menyimpan principal/representative, action scope, parcel/season, valid-from/
  to, proof, verified actor dan revocation. Request identity diambil dari sesi
  server, bukan `owner_id/role/representative=true` dari klien.
- Claim-related commands punya idempotency record actor+operation+key dan payload
  hash. Same key+payload replay memberi acknowledgement yang sama; beda payload
  409 tanpa mutasi. Existing global report key semantics tidak diganti.
- FK dan state/valid-time constraints menjaga case geometry/grant references.
  Final transitions memerlukan expected version dan append-only audit.

## 4. Duplicate detection server-side: banyak bukti, bukan hash saja

| Sinyal | Tindakan yang diusulkan |
|---|---|
| Retry request key sama | Acknowledge existing result; bukan duplikasi kejadian. |
| Canonical parcel+season+incident sama | Resolve/join case yang diizinkan, atau private conflict response bila submitter tidak berwenang; jangan membuat claim case ganda. |
| Incident IDs berbeda tetapi time-window/location/cause berdekatan | Candidate duplicate incident review. Identifier baru tidak membypass integrity; link/alias hanya setelah adjudication. |
| Parcel geometries overlap/contain/equal | Cross-case conflict workflow dengan exact geometry version overlap; jangan memblokir ownership permanen atau mengganti parcel otomatis. |
| SHA semua foto sama lintas report/akun | Evidence reuse flag, akses terbatas petugas. Duplikat foto bukan selalu fraud; boleh jadi bukti kejadian bersama/perwakilan sah. |
| Foto berbeda, parcel/event sama | Tetap one case dengan evidence tambahan bila authorized. SHA berbeda tidak membuktikan new incident. |
| Near-duplicate crop/rotate/recompress | Optional perceptual-hash hint yang direview; false positives tidak auto-reject. |
| Waktu client/EXIF/GPS berbeda | Untrusted capture metadata untuk triage; waktu server dan checked event range terpisah. Tidak menjadikan posisi device ownership proof. |
| New incident pada parcel yang sama | Tetap reportable setelah cek temporal/season/context; tidak ada blacklist parcel permanen. |

Time window, overlap tolerance dan kebijakan linked incident perlu konfigurasi
versioned yang disetujui pihak agronomi/operasional. Jangan menggunakan 24 jam
foto existing sebagai masa pertanggungan/pengajuan AUTP.

## 5. Transaksi dan concurrency

Alur finalisasi case/claim preparation yang diusulkan:

1. Autentikasi, validate payload dan receipt/photo provenance; upload immutable
   evidence lebih dahulu ke slot intent yang dapat direcover. Network/AI call
   tidak dijalankan sambil menahan lock DB.
2. Dalam **satu transaksi DB**: ambil deterministic parcel/season case-creation lock
   (urutan konsisten), baca ulang parcel version, effective authorization, season,
   incident aliases dan conflicts. Row lock untuk existing case; advisory/scope
   lock atau serializable+retry untuk phantom/new-case races.
3. Resolve candidate incident duplicates sebelum membuat canonical linked case.
   Unresolved candidate → pending/conflict state, bukan auto-approve case kedua.
   Mengunci hanya UUID incident baru tidak cukup karena UUID dapat berbeda.
4. Insert/upsert melalui unique constraint, compare expected version/payload hash,
   record evidence links, state event, **audit dan outbox** secara atomik.
5. Commit lalu return durable acknowledgement (report/case ID, actor/key, version).
   Lost response → safe replay; tidak hapus local blobs sampai matching ack.

Supabase Storage dan Postgres tidak mempunyai cross-service transaction otomatis.
Gunakan recoverable upload intents/outbox, deterministic paths dan explicit orphan
retention/recovery. Jangan menjanjikan atomicity dari beberapa REST insert. Tidak
menghapus orphan/local evidence otomatis pada perubahan fase ini.

Revoke direct writes pada future canonical case/grant/final states. RPC sempit
harus memeriksa phone-OTP, principal/mandate, officer scope, expiry/revocation dan
review status di server/DB. Service-role bypass RLS bukan pengganti authorization.

## 6. Konflik dan proses banding

| Skenario | Resolusi yang menjaga kejadian asli |
|---|---|
| Unauthorized duplicate case | Tolak command privileged; simpan intake/keberatan sesuai policy. Pesan tidak membocorkan identitas/berkas pemegang lain. |
| Authorized evidence tambahan | Attach ke case yang sama dengan actor/provenance; bukan duplikasi claim slot. |
| Dua registrasi polygon bertentangan | Conflict case, kedua bukti dipertahankan, reviewer scoped; tidak first-come-wins. |
| Banyak penggarap sah | Verifikasi interest/share/time/mandate; satu case dan party links, total area tidak dihitung berulang. Policy insurer perlu konfirmasi. |
| Peralihan hak/garapan | Effective-dated relationships dan geometry/case snapshots; pengalihan tidak memindahkan klaim lama otomatis atau mengganti actor sejarah. |
| Perwakilan | Explicit verified mandate, principal, purpose dan expiry; perubahan mandate dicatat, self-claim metadata ditolak. |
| Salah registrasi | Human correction version dan alias/supersession; report/receipt/audit lama tetap utuh, tidak silently reassigned. |
| Kejadian baru | New incident dengan evidence/waktu/context terpisah, dapat diajukan; konflik sebelumnya bukan larangan seumur hidup. |
| Final report dipersoalkan | Append appeal/revision case; jangan membuka ulang immutable verification RPC lama atau menimpa keputusan historis. |

Pembatasan akses: petani melihat kasus/bukti yang diotorisasi; PPL assigned Poktan/
wilayah, Dinas sesuai mandat. Cross-group anti-fraud search bisa privileged tetapi
hasilnya harus ter-redact. Bukti ownership/beneficiary tidak otomatis dibaca semua
anggota Poktan hanya karena report summary existing terlihat.

## 7. Pengujian dan acceptance criteria

- **CLAIM-AC1**: claim preparation ditolak/ditahan bila parcel belum VERIFIED,
  grant expired/revoked/salah principal/season, atau konflik otorisasi belum selesai;
  evidence intake tetap mungkin tanpa fabricated rights.
- **CLAIM-AC2**: dua request concurrent untuk canonical key sama menghasilkan
  satu case, banyak evidence yang sah, dan ack idempotent; key reused beda payload
  tidak overwrite. Tes wajib DB nyata terisolasi, bukan mock uniqueness saja.
- **CLAIM-AC3**: dua incident UUID untuk event mirip, dua akun, dua foto berbeda,
  overlap/containment dan rotated photo diarahkan ke duplicate/conflict review;
  tidak dibuktikan hanya dengan hash file pertama.
- **CLAIM-AC4**: new incident/season yang sah di bidang sama tetap reportable;
  ownership transition/representative/multiple cultivators punya effective-time tests.
- **CLAIM-AC5**: state mutation+audit/outbox atomik, lost-response/storage partial
  recovery mempertahankan evidence; immutable existing receipts tidak diubah.
- **CLAIM-AC6**: negative RLS/ACL dan redaction tests untuk anon, petani lain, same
  Poktan tanpa mandat, PPL lintas scope dan sesi legacy; klien tidak dapat approve
  claim/grant atau menulis trusted AI.
- **CLAIM-AC7**: UI/rekap membedakan report verified, dokumen disiapkan dan insurer
  decision; tidak ada otomatisasi eligibility/claim dari AI atau verification boolean.

Kasus uji memerlukan fixture synthetic dalam transaksi rollback di **DB terisolasi**.
Tidak ada constraints/entity/tes DB baru yang diimplementasikan pada PHASE 2.0A.
