# PHASE 2.0A — Product alignment, audit, dan gap analysis

Tanggal audit: **16 November 2026**. Tim: Duo Shinobi, ICONFEST 2026.
Status dokumen: **EXISTING** untuk temuan berkode sumber; **PROPOSED** untuk
persyaratan baru. Dokumen ini bukan persetujuan rilis/PRD atau sertifikasi asuransi.

## 1. Identitas dan batas produk

AgriGuard adalah platform pendukung peringatan dini banjir, dokumentasi kerusakan
tanaman, verifikasi laporan pertanian, dan penyiapan bukti pendukung AUTP untuk
petani, PPL, dan Dinas di Kabupaten Karawang. Empat kemampuan yang saling terkait:

1. Lokalisasi gejala/kerusakan dan penilaian awal AI.
2. Geometri bidang serta hubungan pengelolaan/otorisasi yang diverifikasi.
3. Pelaporan aman dan integritas kasus/duplikasi.
4. EWS berdasarkan lokasi **setiap bidang**, bukan semata posisi telepon.

AI bersifat advisory. Verifikasi laporan oleh petugas tidak sama dengan keputusan
klaim penanggung. Tidak ditemukan bukti integrasi resmi Jasindo dalam kode,
migrasi, atau dokumentasi yang diinspeksi. Tidak ada klaim integrasi tersebut.

## 2. Referensi historis yang benar-benar tersedia

| Referensi | Hasil pemeriksaan dan batasnya |
|---|---|
| [`PRD.md`](../PRD.md) | **EXISTING**, judul v1.0 mulai baris 17; isi masih memuat pembungkus instruksi/marker `CONTENT_START`, `SQL_START`, dsb. Dibaca sebagai arsip, tidak dieksekusi atau ditulis ulang. §1 menyebut empat kemampuan produk; §7 FR-00–FR-05 berisi AC. |
| Proposal **“AgriGuard — Smart Flood Alert & AI Crop Damage Assessment”** | **MISSING / BLOCKED**: dokumen asli tidak ditemukan. Pencarian nama proposal/ICONFEST/PRD, PDF/Office dan daftar referensi tracked tidak menemukan proposal kompetisi. File `sources/*.proposal.json` adalah kebijakan dataset, bukan proposal ICONFEST. |
| [`README.md`](../README.md), [`ai-service/README.md`](../ai-service/README.md) | **EXISTING**, beberapa keterangan model, auth mock, timeout, HF dan service worker tidak sesuai source terbaru. |
| [`DEPLOY.md`](DEPLOY.md), `render.yaml` | Arsitektur Vercel → FastAPI/ONNX di Render → Supabase didokumentasikan. Tidak menguji kondisi deployment aktual. Instruksi OTP demo lama bukan prosedur aktivasi keamanan terbaru. |
| [`PHASE-0A-SECURITY.md`](PHASE-0A-SECURITY.md), migrasi `0010`/`0011`, `supabase/tests/phase0a_security.sql` | Implementasi dan prasyarat PHASE 0A/0A.1 tersedia. Tidak ada laporan integrasi 0A.1 tersendiri yang membuktikan eksekusi DB/SMS. |
| [`PHASE-1A-YOLO.md`](PHASE-1A-YOLO.md), [`PHASE-1B0-READINESS.md`](PHASE-1B0-READINESS.md) | Fondasi deteksi, fail-closed, readiness, serta batas ML tersedia. |
| [`DATASET-SOURCES-1B01.md`](DATASET-SOURCES-1B01.md), [`MIXED-ANNOTATION-QA-1B003.md`](MIXED-ANNOTATION-QA-1B003.md) | Acquisition, hasil sumber nyata/ZIP, dan mixed QA tersedia. Tidak ditemukan dokumen khusus bernama PHASE 1B.0.2; fakta inspeksinya tersebar dalam tooling dan catatan QA. |
| [`OFFLINE-REVIEW-PILOT-1B004.md`](OFFLINE-REVIEW-PILOT-1B004.md), [`OFFLINE-REVIEW-UX-1B004A.md`](OFFLINE-REVIEW-UX-1B004A.md) | Review internal, revision-chain, serta penyempurnaan UX tersedia. Bukan workflow verifikasi laporan petani. |
| [`QA-REPORT.md`](QA-REPORT.md), [`MAINTENANCE-NOTES.md`](MAINTENANCE-NOTES.md) | Laporan historis, bukan bukti pengujian ulang source/security terbaru. Angka 42 gambar juga tercantum di AI README; data/prediksi evaluasi tersebut tidak ditemukan. |

Urutan tiga fase produk dan atribusi angka **73,8% kelas / 78,6% status dari 42
gambar** berasal dari instruksi pemilik dan referensi sekunder di repo. Karena
proposal asli tidak tersedia, audit tidak mengklaim telah memeriksa isi proposal
atau mereproduksi angka tersebut. Tiga fase yang akan ditelusuri kembali setelah
proposal disediakan: Flood Early Warning → AI Crop Damage Assessment → Agricultural
Report Verification and AUTP Claim Preparation.

## 3. Metode dan klasifikasi bukti

Audit membandingkan fungsi/route/schema aktual, bukan nama file saja. Dibaca:
seluruh migrasi `0001`–`0011` (seed ditinjau sebagai data demo), auth/middleware,
submission/receipt/sync, peta/lahan, EWS/notifications, FastAPI/ONNX, detector, dan
tooling/dokumen review. Tidak membaca nilai `.env`, mengakses Supabase, menjalankan
SQL, mengubah dataset, atau menguji akun produksi.

Kategori inventaris:

- **IMPLEMENTED_AND_TESTED**: source ada dan perilaku tertentu diuji lokal pada fase
  ini; bukan jaminan integrasi eksternal atau validitas ilmiah.
- **IMPLEMENTED_BUT_UNVERIFIED**: source ada, tetapi DB/browser/provider/hasil ilmiah
  terkait belum diuji pada lingkungan relevan.
- **MOCK_OR_DEMO**: nilai simulasi atau fixture, tidak boleh menjadi bukti nyata.
- **MISSING**: kontrak/implementasi terkait tidak ditemukan dalam area yang diaudit.
- **BLOCKED_BY_EXTERNAL_DEPENDENCY**: memerlukan data, akses, keputusan, atau
  infrastruktur yang tidak tersedia/diotorisasi.

Label lintas dokumen: **EXISTING**, **PROPOSED**, **UNVERIFIED**, **BLOCKED**, dan
**REQUIRES_APPROVAL**. Satu komponen bisa memiliki beberapa kategori pada aspek
berbeda. Lulus tes stub bukan bukti RLS telah diterapkan.

## 4. Inventaris faktual

| Kemampuan | Kategori | Bukti source/tes dan batas aktual |
|---|---|---|
| Next.js App Router/TS, Tailwind/shadcn, Leaflet/OSM/Esri | IMPLEMENTED_BUT_UNVERIFIED | `package.json`, `app/`, `components/`, `peta/PetaMap.tsx`; type-check lulus, browser end-to-end tidak dijalankan ulang. |
| EfficientNet `/predict` dan ONNX CPU | IMPLEMENTED_AND_TESTED | `ai-service/predict.py`, `main.py`, `test_detection.py::test_legacy_predict_still_runs_real_existing_classifier`; model nyata dijalankan untuk kontrak, bukan akurasi. Runtime sekarang **v2 tiga kelas**, bukan v1 delapan penyakit yang masih ditulis README. |
| Validitas diagnosis/severity/kalibrasi classifier | IMPLEMENTED_BUT_UNVERIFIED | `damage_pct` rumus confidence, metadata menyatakan tidak terkalibrasi; source memuat angka v2 tanpa dataset/metrics lengkap. Tidak cukup untuk estimasi kerugian panen. |
| MobileNetV3 atau perbandingan arsitektur fair | MISSING; BLOCKED_BY_EXTERNAL_DEPENDENCY | Factory `training/common.py::make_model` hanya B0; tidak ditemukan checkpoint MobileNet, reviewed comparison manifest atau benchmark runner. |
| YOLO26n/s ONNX adapter, proxy, overlay dan default OFF | IMPLEMENTED_AND_TESTED | `detection/adapter.py`, `contracts.py`, `lib/detection-server.ts`, tes Python/Node; graphs deteksi synthetic. Akurasi trained detector dan browser overlay tetap UNVERIFIED. |
| Segmentasi kerusakan | MISSING | Adapter membatasi task `detect`; polygon QA bukan model segmentasi. |
| Provenance, readiness, QA mixed, ekspor konflik offline | IMPLEMENTED_AND_TESTED | `training/yolo/`, `tests/review-dashboard.test.ts`, Python QA/export tests. Review nyata dan izin training tidak dihasilkan oleh tes. |
| OTP native, validasi AMR/phone pinned, onboarding | IMPLEMENTED_AND_TESTED; BLOCKED_BY_EXTERNAL_DEPENDENCY | `auth/session.ts`, `phone-otp.ts`, route auth, tes stub. Default transport OFF. SMS/penautan UUID akun lama dan penghentian akses legacy perlu operator. |
| RLS, column/effective grants, scoped PPL, transactional verification | IMPLEMENTED_BUT_UNVERIFIED | Migrasi `0010`, `0011`, SQL rollback tests ada; tidak dieksekusi di DB fase ini. Restrictive OTP policy bukan bukti sudah terpasang di produksi. |
| Lahan CRUD, relasi `owner_id`, JSON polygon | IMPLEMENTED_BUT_UNVERIFIED | `lahan/actions.ts`, API lahan dan `0001`; min 3 pasangan angka, area input >0 dan ≤1000 ha, tidak ada validasi topology/rentang polygon server atau overlap. |
| Geofence titik laporan | IMPLEMENTED_AND_TESTED | `geo.ts::validateGeofence`, tests submission; ray-casting tanpa kebijakan batas/GPS accuracy. Tidak membuktikan kepemilikan atau keaslian GPS. |
| Area geodesik, parcel lifecycle, izin penggarap/perwakilan | MISSING | `LahanForm.tsx::calculateArea` memakai shoelace derajat ×111000²; area tersimpan berasal dari input pengguna. Tidak ada tabel bukti hak/mandat atau status parcel. |
| Report receipts, immutable photos, retry/idempotency | IMPLEMENTED_AND_TESTED | `reports/submit.ts`, `evidence.ts`, tests laporan. Receipt terikat user+foto; dedupe foto pertama/user/24 jam; audit submit best-effort terpisah. |
| Claim-level parcel/season/incident integrity | MISSING | Tidak ada entity musim, incident, authorization grant atau case constraint. Same-Poktan saat ini cukup untuk submit ke lahan orang lain (`submit.ts:59–66`). |
| IndexedDB/account-scoped sync dan acknowledgement | IMPLEMENTED_AND_TESTED | `offline/db.ts`, `sync-core.ts`, tests stub; blobs dipertahankan, salah akun/key tidak diakui. Persistensi browser nyata/cold offline startup UNVERIFIED. |
| Service worker untuk cold-start offline | MISSING | `public/manifest.json` ada; tidak ditemukan worker atau registrasi `serviceWorker` pada app/components. IndexedDB pada tab terbuka bukan offline app-shell cache. |
| OpenWeather forecast, cache 10 menit, tinggi air manual | IMPLEMENTED_BUT_UNVERIFIED | `api/weather`, `dashboard/flood-actions`, `water-actions`; provider live tidak dipanggil. Cache Map per proses, key koordinat 2 desimal; tinggi air per district Poktan. |
| Fallback cuaca 15 mm, 28°C, 78% | MOCK_OR_DEMO | `api/weather/route.ts::MOCK_WEATHER`, dipakai juga saat error. UI menandai simulasi tetapi nilai tetap masuk risk calculation. |
| EWS per bidang, timestamp/freshness, BMKG | MISSING | `DashboardHero` meminta GPS perangkat; notifikasi memanggil tanpa koordinat (default Karawang). Tidak ada field ID pada EWS atau adapter BMKG. |
| Verifikasi PPL/Dinas | IMPLEMENTED_BUT_UNVERIFIED | `verification-actions.ts::setVerification` → locked RPC; UI pending/verified/rejected. Tidak ada state additional-evidence atau riwayat revisi multi-tahap. |
| Rekap print/PDF | IMPLEMENTED_BUT_UNVERIFIED | `RekapLaporan.tsx` memakai `window.print`, mengambil ≤200 laporan, menjumlahkan area lahan per laporan dengan label “Total Luas Terdampak”. Bukan pengukuran area rusak atau dossier AUTP terverifikasi. |
| Integrasi/keputusan Jasindo dan aturan AUTP berlaku | MISSING; BLOCKED_BY_EXTERNAL_DEPENDENCY | Tidak ditemukan API/adaptor/bukti kerja sama maupun policy registry yang applicable. Keputusan penanggung tidak tersedia. |

## 5. Gap terhadap PRD v1 dan prioritas v2

| Area historis | Kondisi aktual | Gap/prioritas v2 |
|---|---|---|
| FR-00 OTP + role/RLS | Native phone OTP hardening menggantikan mock/password lama di source. | **P0**: integrasi 0A.1 terisolasi, SMS/identity linking dan evidence grants sebelum rilis. Instruksi login demo README usang. |
| FR-01 cuaca + air | Forecast (bukan observasi 3 jam sebelumnya), lokasi device/default, air district Poktan. | **P0**: UNKNOWN/STALE terpisah dari AMAN; **P1**: multi-field geometry/admin/station mapping. |
| FR-02 scanner 3 status | Runtime v2 visual, percentage heuristic, 422 HSV gate; scan timeout 85 detik upstream/90 detik client, bukan AC v1 15 detik. | **P0**: label REVIEW_REQUIRED dan sembunyikan persen kerugian unsupported; benchmark/field evaluation sebelum model decision. |
| FR-03 offline/sync | Queue dan receipt hardened, retries aman dalam tes. | **P1**: browser/account-change/cold-offline verification, retention; manual evidence intake tidak bergantung keberhasilan AI. |
| FR-04 map/verifikasi | Scope petugas di RPC; `verified_at` menjaga finalitas. | **P1**: lifecycle laporan/evidence request, parcel grants, incident case; wording verifikasi bukan approval klaim. |
| FR-05 PDF | Print-friendly recap ada, area total raw per laporan. | **P0/P1**: jangan sajikan jumlah itu sebagai kerugian aktual; snapshot per parcel/event dan area terukur terpisah sebelum dossier. |
| No PostGIS (v1 §5) | JSON polygon, ray-casting dipertahankan. | **REQUIRES_APPROVAL**: opsi PostGIS additive untuk topology/area/overlap, tanpa migrasi sekarang. |
| YOLOv8n-cls/HF (v1 §2) | EfficientNet/ONNX + Render, detector YOLO26 opsional. | Catat deviasi existing; tidak mengganti stack/model berdasarkan novelty. |

## 6. Temuan integritas prioritas

- **EWS-01**: `calculateFloodStatus(null,null)` menghasilkan `status:'aman'`, warna
  hijau dan check icon meskipun label “Data Tidak Tersedia”. Mock di bawah threshold
  juga bisa menghasilkan AMAN. Angka invalid/NaN tidak divalidasi di fungsi ini.
- **EWS-02**: tidak ada freshness gate. Upsert air tidak mengisi `updated_at` saat
  update; migrasi yang dibaca tidak memiliki trigger update timestamp. Waktu cache
  bukan waktu observasi. Notifikasi membuat waktu “sekarang” saat render ulang.
- **AI-01**: UI scan menulis `kerusakan {damage_pct}%` walaupun metadata menyatakan
  uncalibrated. Gate HSV bisa menolak sawah tergenang/keruh dengan sedikit warna hijau.
- **LAND-01**: `owner_id` berarti relasi pendaftar di aplikasi, bukan bukti legal.
  Polygon bisa diubah owner tanpa versi/snapshot untuk laporan lama; kebijakan DB
  `lahan` belum memvalidasi geometri atau memverifikasi Poktan pada INSERT/UPDATE.
- **CLAIM-01**: idempotency melindungi retry payload yang sama, bukan beberapa akun,
  foto berbeda, atau kasus kejadian sama. Dedupe SELECT → INSERT tidak menjadi
  constraint incident-level atomik.
- **AUTP-01**: area lahan berulang dapat dihitung beberapa kali dalam rekap. Laporan
  terverifikasi bukan bukti seluruh bidang rusak atau klaim disetujui.

## 7. Verifikasi aktual fase ini

Perintah dan hasil lengkap diringkas dalam [roadmap §6](PHASE-2.0A-09-ROADMAP.md).
Pada source yang diaudit: **73 Python tests**, **56 Node tests**, type-check lulus;
ORT berhasil memuat v2 dengan input `[batch,3,224,224]`/output `[batch,3]` pada CPU.
SHA-256 v2 cocok metadata; hal ini tidak membuktikan diagnosis, split, atau metrik.
Node 26.8.1/Python 3.12.15 berbeda dari release engine Node 24/Docker Python 3.11.

Tidak ada production build, database test, SMS, browser end-to-end, benchmark
arsitektur, training, atau evaluasi akurasi baru pada fase ini.

## 8. Acceptance criteria fase alignment

- **ALIGN-AC1**: setiap status completion memiliki source dan ruang lingkup tes;
  draft SQL dan mock tidak dianggap bukti produksi.
- **ALIGN-AC2**: proposal yang hilang, angka historis, dan drift v1/v2 dicatat
  eksplisit; referensi historis tidak ditimpa.
- **ALIGN-AC3**: sembilan deliverable memiliki label status, AC, dan dependensi;
  requirement lintas AI/parcel/EWS/AUTP memakai istilah otoritas yang konsisten.
- **ALIGN-AC4**: perubahan fase ini hanya dokumentasi lokal; source, migrasi,
  receipt, model, raw dataset dan review manusia tidak dimutasi.

## 9. Indeks deliverable

1. Dokumen ini: audit dan product gap.
2. [AI architecture ADR](PHASE-2.0A-02-AI-ARCHITECTURE-ADR.md).
3. [EfficientNet–MobileNet benchmark plan](PHASE-2.0A-03-CLASSIFIER-BENCHMARK.md).
4. [Crop damage localization](PHASE-2.0A-04-DAMAGE-LOCALIZATION.md).
5. [Land geometry dan authorization](PHASE-2.0A-05-LAND-INTEGRITY.md).
6. [Incident dan duplicate claim prevention](PHASE-2.0A-06-CLAIM-INTEGRITY.md).
7. [Field-specific EWS](PHASE-2.0A-07-FIELD-EWS.md).
8. [PRD v2.0 proposal](PHASE-2.0A-08-PRD-V2-PROPOSAL.md).
9. [Roadmap, gates dan exact next milestone](PHASE-2.0A-09-ROADMAP.md).
