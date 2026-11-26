# PRD — AgriGuard 2.0 (PROPOSAL, belum disetujui)

Versi proposal: **2.0-draft-2.0A**, 16 November 2026.
Pemilik produk: Tim Duo Shinobi — ICONFEST 2026. Pilot: Kabupaten Karawang.
Status: **PROPOSED / REQUIRES_APPROVAL**, bukan pengganti [`PRD.md`](../PRD.md).

## 1. Visi dan tujuan

AgriGuard membantu petani, PPL dan Dinas memantau indikator risiko banjir pada
bidang pertanian, merekam bukti kerusakan, menjalankan triage AI, memverifikasi
laporan secara aman, dan menyiapkan dokumen pendukung AUTP. Platform bukan sekadar
classifier penyakit padi dan bukan otoritas penentu hak tanah atau klaim asuransi.

Empat pilar: **AI localization**, **verified parcel/authorization**, **secure
report/incident integrity**, dan **location-aware multi-field EWS**.

Outcome yang kelak diukur: keterlacakan sumber/timestamp, salah-indikasi aman saat
data gagal, durasi triage, completeness evidence, duplicate-case/conflict resolution,
false blocking petani sah dan kebutuhan kunjungan lapangan menurut reviewer.
Baseline/target numerik outcome belum tersedia; tidak mengklaim semua inspeksi
fisik dapat dihilangkan atau peningkatan model telah terbukti.

## 2. Dasar historis dan status implementasi

- PRD v1 §1/FR-00–FR-05 tersedia, dipertahankan. Proposal kompetisi asli berjudul
  “AgriGuard — Smart Flood Alert & AI Crop Damage Assessment” **MISSING**; penyelarasan
  terhadap proposal masih **BLOCKED** sampai arsip diberikan.
- Tiga fase produk menurut brief pemilik: Flood Early Warning → AI Crop Damage
  Assessment → Agricultural Report Verification and AUTP Claim Preparation.
- Existing source/security/AI/offline/review foundation terinci pada
  [audit inventaris](PHASE-2.0A-01-PRODUCT-ALIGNMENT.md). Label EXISTING pada bagian
  ini tidak mempromosikan seluruh fitur v2 menjadi implemented.
- AI baseline adalah EfficientNet-B0 ONNX **v2 tiga kelas visual** pada source
  aktual; artefak v1 delapan penyakit tetap ada. Metadata/README drift dan unsupported
  percentage adalah gap; tidak diganti pada fase ini.
- Review dataset internal, PPL report verification dan insurance approval tetap
  terpisah. Rice-v1 mixed annotations belum approved untuk production training.

## 3. Aktor dan otoritas

| Aktor | Kewenangan proposed |
|---|---|
| Petani/registered landholder | Registrasi draft parcel, bukti hubungan, melihat EWS field yang diizinkan, capture dan submit damage evidence. |
| Authorized cultivator | Tindakan pada parcel/season/scope yang grant-nya diverifikasi, bukan semua parcel satu Poktan. |
| Authorized representative | Atas principal dan mandate yang explicit/valid; actor dan principal sama-sama tercatat. |
| PPL | Review pada assigned scope, meminta evidence, verifikasi laporan/administrasi sesuai mandat; bukan insurer approval. |
| Dinas | Review/escalation/rekap sesuai kebijakan kewenangan, konflik dan audit; tidak otomatis otoritas penanggung. |
| Reviewer dataset/ahli agronomi | QA/mapping/diagnosis/calibration sesuai protocol; annotation ACCEPT bukan izin klaim atau training otomatis. |
| Penanggung/otoritas asuransi | Keputusan akhir klaim menurut policy berlaku; integrasi teknis/kontrak belum ada. |

Tidak ada role petugas yang bisa dipilih sendiri saat signup. Poktan membership
bukan legal title, cultivation mandate, atau insurance coverage.

## 4. Workflow dan state boundaries

```text
Petani → pilih bidang → capture evidence → AI preliminary/advisory atau manual
  → submit report aman → PPL/Dinas scoped verification
  → verified report summary → human AUTP supporting-document preparation
  → proses/keputusan penanggung di luar AI AgriGuard
```

### State machine laporan — PROPOSED

| State | Arti dan transisi |
|---|---|
| `DRAFT` | Lokal/server draft, bukti belum diajukan; edit eksplisit. |
| `SUBMITTED` | Server menerima durable payload/receipt, timestamp dan idempotency acknowledgement. |
| `PENDING_PPL_VERIFICATION` | Menunggu reviewer yang berwenang, tidak disahkan AI. |
| `ADDITIONAL_EVIDENCE_REQUIRED` | Request scoped/reason dari reviewer, evidence tambahan append-only; kembali pending setelah resubmit. |
| `VERIFIED` | Laporan telah ditinjau manusia berwenang; bukan claim approved atau seluruh area pasti rusak. |
| `INVALID` | Laporan dinyatakan tidak valid oleh reviewer dengan alasan; bukan otomatis claim rejected. Banding/version baru terpisah. |

Dokumen **`AUTP_DOCUMENTS_PREPARED`** adalah state/versi dossier terpisah, bukan
perubahan arti VERIFIED. `INSURER_DECISION` adalah catatan eksternal verified-origin
jika mekanismenya kelak disetujui, bukan inference atau simulasi persetujuan.

Existing `is_verified/verified_at` dipertahankan sebagai historical state: true
menandai verified; false+dengan verified_at menandai keputusan penolakan laporan;
false+null belum finalized. Mapping ke v2 perlu explicit migration/view dan audit,
tidak membuat ulang reviewer/time atau membuka immutable final report lama.

Parcel lifecycle: **DRAFT → PENDING_VERIFICATION → VERIFIED**, dengan
**CONFLICT_REVIEW** dan **ARCHIVED** sesuai [land design](PHASE-2.0A-05-LAND-INTEGRITY.md).
Claim preparation blocked oleh unresolved parcel/authorization; damage intake/
keberatan tetap diperbolehkan tanpa fabricated rights. AI failure tidak membatalkan
kejadian nyata atau menjadi keputusan asuransi.

## 5. Persyaratan fungsional dan acceptance criteria

Seluruh baris berikut **PROPOSED** kecuali fondasi existing yang ditunjuk. P0/P1/P2
menunjukkan prioritas, bukan tanggal komitmen. AC adalah syarat implementasi kelak,
**belum lulus hanya karena dokumen ini dibuat**.

| ID / prioritas | Requirement | Acceptance criteria yang dapat diverifikasi |
|---|---|---|
| V2-PROD-01 / P0 | Klaim produk jujur dan pemisahan otoritas. | UI/rekap/docs membedakan QA ACCEPT, report VERIFIED, AUTP docs dan insurer decision; tidak ada keluaran AI yang mengotorisasi/menolak klaim atau mengklaim Jasindo integration tanpa bukti. |
| V2-AUTH-01 / P0 | Pertahankan hardened native phone-OTP, pinned identity dan scope. | Tes anon/password-only/forged role/phone mismatch fail-closed; UUID petani/PPL/Dinas existing tidak dibuat ulang; tidak ada auth fallback mock/password. Integration SMS/legacy cutover membutuhkan approval terpisah. |
| V2-DB-01 / P0 | Effective RLS/ACL dan atomic human verification. | Suite rollback `phase0a_security.sql` dan cross-group/concurrency tests lulus di isolated DB; tidak ada direct report/receipt/final-state mutation atau privilege escalation. Produksi tetap UNVERIFIED sampai authorized release evidence ada. |
| V2-AI-01 / P0 | EfficientNet baseline dan kontrak existing dipertahankan. | `/predict` tiga keys dan report receipts/manual/pending tetap kompatibel; model/hash/labels/preprocessing/gates tercatat; v1/v2 tidak disamakan atau diganti tanpa experiment+approval. |
| V2-AI-02 / P0 | Unsupported/uncalibrated assessment advisory. | UI menampilkan “Perlu ditinjau petugas”/REVIEW_REQUIRED; legacy confidence-scaled `damage_pct` tidak disajikan sebagai factual crop loss/ha/insurance severity; no-detection bukan sehat. Historical raw receipt tidak ditimpa. |
| V2-AI-03 / P1 | Comparable B0–MobileNetV3 comparison. | BENCH-AC1–5 lulus: same reviewed dataset/split/K/transform/target environment, accuracy/macro-F1/class precision-recall/confusion, latency/peak RSS/size dan raw artifacts. Tanpa prasyarat hasil NOT_MEASURED/BLOCKED. |
| V2-AI-04 / P1 | Lokalisasi gejala menggunakan detector gated. | LOC-AC1–5: valid xyxy/version/dimensions/confidence/provenance dan REVIEW_REQUIRED; actual trained-model gates sebelum activation; default YOLO OFF dan legacy receipt tidak menerima fake detector severity. |
| V2-AI-05 / P2 | Evaluasi segmentasi conditional. | Reviewed lesion/leaf masks dan protokol denominator, IoU/Dice/field slices serta CPU/RSS dibandingkan; tanpa evidence tidak mengganti detection atau menyebut polygon QA sebagai mask approved. |
| V2-DATA-01 / P0 | Raw data/review immutable dan training approvals terpisah. | Fingerprints/IDs/exports/conflict tests tetap valid; converter hanya NEW approved derived copy berledger; no fabricated review/source/license/group approval. |
| V2-LAND-01 / P1 | Server geometry validation dan geodesic area. | LAND-AC1–2: range/finite, closed ring, ≥3 unique non-collinear, self-intersection/duplicates/precision checks; declared vs calculated ha terpisah; invalid geometry tidak VERIFIED. |
| V2-LAND-02 / P1 | Stable parcel identity dan versioned boundaries. | Existing report/lahan FKs dipertahankan; material update membuat geometry version+re-review; laporan mengikat snapshot, tidak berubah akibat edit polygon berikutnya. |
| V2-LAND-03 / P1 | Verified relationship/authorization lifecycle. | LAND-AC4: pendaftar/legal owner/cultivator/Poktan/representative terpisah; evidence, actor, expiry dan scope; user metadata sendiri tidak dapat set VERIFIED. |
| V2-LAND-04 / P1 | Overlap/containment/conflict process. | LAND-AC3/5: equal/partial/full containment/boundary/GPS uncertainty dan competing registrations diuji; existing parcel tidak ditimpa; petani sah dapat keberatan. |
| V2-LAND-05 / P1 | Evaluasi opsi PostGIS additive. | LAND-AC6: approval deviasi v1, staged backfill validation, RLS/effective grants, JSON/Leaflet compatibility, rollback dan isolated tests; tidak otomatis production migration. |
| V2-REPORT-01 / P0 | Evidence submission terikat sesi, foto, waktu dan receipt. | Existing security tests tetap lulus; client AI/verified metadata diabaikan; immutable storage/hash/user/photo binding dan server timestamp preserved. AI outage tetap mempunyai durable pending/manual recovery. |
| V2-REPORT-02 / P1 | Lifecycle review dan evidence requests. | Keenam state laporan dan transitions diuji scoped actor+expected version; additional evidence append-only; no self-verification dan finalized report lama tidak overwrite. |
| V2-REPORT-03 / P1 | Evidence intake saat AI/administrasi belum siap. | 422/timeout/offline/disputed parcel tidak menghilangkan foto atau incident; draft/intake diberi state belum verified; claim preparation tetap digate verified parcel+grant. |
| V2-OFFLINE-01 / P1 | Account-safe IndexedDB dan recovery. | Matching user/key/UUID acknowledgement sebelum sync dianggap sukses; blocked item/blobs retained; account switching, browser restart, cold offline behavior diuji nyata dan batas app-shell dicatat. Tidak menganggap manifest sebagai service worker. |
| V2-CASE-01 / P1 | Canonical season+incident case. | CLAIM-AC1–2: case mengikat verified parcel/geometry, authorized party, season, canonical incident, reports/evidence/history; concurrent commands satu canonical case, genuine new incident tetap dapat dilaporkan. |
| V2-CASE-02 / P1 | Anti-duplikasi multi-signal dan resolution. | CLAIM-AC3/4/6: foto berbeda/akun berbeda/same event/overlap/aliases/mandate/transfer ditangani server, tidak hanya SHA pertama; false-positive punya jalur human review tanpa private-data leak. |
| V2-CASE-03 / P1 | Atomic audit/idempotency/recovery. | CLAIM-AC5: case/state/audit/outbox satu transaksi, storage partial/lost-response replay aman, uniqueness tidak hanya application SELECT; existing contracts tidak dilemahkan. |
| V2-EWS-01 / P0 | Truthful data-quality/risk states. | EWS-AC2/5: UNKNOWN/STALE/invalid/mock tidak AMAN; sumber/periode/time/freshness tampil; missing≠0; partial positive signal tidak dihapus tanpa alasan. |
| V2-EWS-02 / P1 | Lokasi registered fields, multi-field. | EWS-AC1/4: field Karawang Timur tetap memakai konteks Timur saat telepon di Barat; per-field identity/geometry/admin/water mapping, akses server dan card/notification sama. |
| V2-EWS-03 / P1 | BMKG official source candidate dan OWM continuity. | EWS-AC3/6/7: adapter/schema/legal attribution/rate limits/live reliability diuji; forecast desa tidak disebut exact field measurement; OWM tidak diganti tanpa justification. |
| V2-EWS-04 / P1 | Time-valid water/forecast/warning rules. | Observed/issued/valid/fetched dibedakan; station datum/relevance dan rule version ada; stale/expired/update/cancel/window boundaries diuji frozen-clock. Ambang prototype bukan hydrologic guarantee. |
| V2-AUTP-01 / P0 | Rekap area/evidence tidak menyesatkan. | Total luas lahan terdaftar, surveyed affected area dan area unknown terpisah; multiple reports field/event sama tidak menggandakan ha; ≤200-row cap bukan silently complete authoritative total. |
| V2-AUTP-02 / P1 | Human-prepared supporting dossier. | Snapshot verified report/parcel/season/incident/authorization/evidence/AI advisory/reviewer/time; missing policy items ditandai, version/export/audit dapat direproduksi. VERIFIED tidak mengisi insurer approval. |
| V2-AUTP-03 / P1 | Policy applicability dikonfirmasi. | Registry policy/version/effective dates/source/authority memuat syarat yang benar-benar diverifikasi; coverage, batas waktu, loss thresholds, beneficiaries dan form unknown ditandai REQUIRES_CONFIRMATION; tidak membuat eligibility otomatis. |
| V2-UX-01 / P1 | Bahasa Indonesia dan konvensi lokal. | UI mobile 360px, target sentuh ≥48px, label/focus/kontras, +62, ha, WIB eksplisit, region Indonesia dan loading/error/empty/stale states; keyboard/screen-reader/manual device tests dicatat. |
| V2-OPS-01 / P0 | Release/experiment gates terpisah. | GO dokumentasi tidak mengaktifkan flags, training, credential changes, migration atau deploy; artifact rollback dan release-engine validation diperlukan sebelum rilis terotorisasi. |

## 6. AUTP dossier: definisi minimum dan hal yang belum diketahui

**PROPOSED**, bukan form resmi Jasindo:

- Identitas kasus, submitter/principal dan verified authorization snapshot.
- Stable parcel dan version geometry; declared/derived area, surveyed affected area
  dengan method/reviewer/uncertainty, bukan box coverage ×ha.
- Season/crop/event time/location serta status dugaan/confirmed cause.
- Foto/receipts/hash/capture source/server timestamp, laporan dan evidence additions.
- AI model/version/review-required dan limitation, tidak sebagai verdict penanggung.
- Human verification history, alasan, evidence requests/resolution, conflicts/appeals.
- Checklist dokumen berdasarkan **policy yang applicable**, source/effective date,
  unknown/missing items dan human preparer/sign-off time.
- Export snapshot version/hash, audit record dan status “Dokumen pendukung disiapkan”.

Coverage risks, kriteria peserta/penggarap, porsi pertanggungan, premium/subsidi,
ambang kerusakan, tenggat, assessment protocol, format dokumen dan alur penanggung
memerlukan konfirmasi pihak berwenang. Tidak mengasumsikan angka/aturan AUTP yang
berlaku umum untuk setiap petani atau periode, dan tidak menamai print recap existing
sebagai aplikasi klaim resmi yang lengkap.

## 7. Arsitektur dan locked-technology deviations

Retain Next.js App Router, TypeScript, Tailwind/shadcn, Supabase Auth/PostgreSQL/RLS/
Storage, Leaflet/OSM dan compatible Esri layer, FastAPI/Python/ONNX Runtime,
IndexedDB dan Vercel→AI service existing. Tidak membutuhkan framework/backend/native
app baru. Heavy ML dependencies hanya di environment eksperimen terpisah approved.

| Keputusan v1 | Existing/proposal v2 | Status approval |
|---|---|---|
| YOLOv8n-cls 3 status | Existing B0/ONNX; YOLO26 detector independent; MobileNet candidate. | Existing drift dicatat; model baru memerlukan experiment/approval, bukan overwrite v1. |
| HF Spaces | Render blueprint/documented hosting existing. | Tidak memverifikasi service live atau harga/provider claim historis. |
| TANPA PostGIS/ray-casting | Opsi additive PostGIS untuk geometry integrity. | **REQUIRES_APPROVAL**, rollback/staging/RLS gates, bukan migration aktif. |
| OTP mock/WA + email/password alias | Existing native Supabase phone SMS + transport OFF/pinned UUID. | Aktivasi/cutover eksternal masih BLOCKED, tidak menghidupkan login mock untuk memenuhi demo. |
| Timeout scan 15 detik | Existing scan 85/90 detik untuk cold start; submission default 15 detik. | Target UX/SLO final perlu konfirmasi dan actual deployment benchmark. |

## 8. Non-functional acceptance

| ID | Requirement/AC |
|---|---|
| V2-NFR-01 | Immutable audit/evidence: future final state+audit atomik, version/hash/time/actor dapat ditelusuri; tidak ada silent overwrite/last-write-wins pada critical decisions. |
| V2-NFR-02 | Privacy: private Storage, bounded signed URLs, exact officer/party scope dan conflict redaction; retention/consent/shared-device recovery policy disetujui sebelum penghapusan otomatis. Local blobs existing belum encrypted-at-rest. |
| V2-NFR-03 | Reproducibility: source/checkpoint/dataset/rule/geometry version dan actual commands/env tercatat; mock, stub, scientific metrics dan live integration dibedakan. |
| V2-NFR-04 | Availability: no-data/error/offline/stale state eksplisit, durable queue tidak hilang; network outage tidak dianggap aman atau klaim gagal. |
| V2-NFR-05 | Maintainability/performance: dependency tambahan beralasan dan approved, serving tanpa heavy training packages; CPU/RAM/latency/budget SLO ditetapkan sebelum model promotion. |

## 9. Di luar lingkup proposal implementasi langsung

Phase ini hanya audit/specification. Tidak ada production migrations, model swap,
training, raw annotation conversion, deployment, payment, native app baru, atau
auto-claim decisions. IoT realtime, insurer API dan full segmentation memerlukan
evidence/approval/milestone tersendiri. Offline annotation review tetap internal.

## 10. Definition of Ready dan approval

Requirement prioritas menjadi Ready bila owner produk menyetujui scope/AC,
dependencies/data/otoritas tersedia, migration/RLS/rollback plan bila perlu,
serta negative/security tests direncanakan. Menjadi Done hanya setelah actual code,
relevant tests dan integration evidence selesai; tanda **PROPOSED** tidak dihapus
oleh sekadar penulisan dokumen.

Persetujuan yang dibutuhkan: pemilik produk, agronomy reviewer untuk taxonomy/
severity/thresholds, operator keamanan/DB untuk isolated integration/release, dan
otoritas AUTP/penanggung untuk policy/business process. Semua masih **belum
dicatat sebagai diberikan** dalam fase ini.
