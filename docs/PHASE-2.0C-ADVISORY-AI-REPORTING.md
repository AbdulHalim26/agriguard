# PHASE 2.0C — Advisory AI dan pelaporan AUTP yang jujur

Tanggal: **17 November 2026**. Status: **IMPLEMENTED_AND_TESTED lokal**.
Browser/mobile, actual print-to-PDF, live Supabase dan insurance integrations tetap
**UNVERIFIED**. Dokumen ini tidak menyatakan persetujuan rilis atau klaim.

## 1. Tujuan dan keterbatasan AI yang dikonfirmasi

AgriGuard mendukung EWS, evidence capture, preliminary AI triage, human report
verification dan penyiapan informasi pendukung AUTP. AI bukan otoritas klaim.

Inspeksi source/runtime pada fase ini mengonfirmasi:

- `predict.py` memakai EfficientNet-B0 **v2 tiga kelas visual**, dengan mapping ke
  API `aman/rusak_ringan/rusak_berat`. Artefak v1 disease-proxy tetap tersimpan.
- ONNX sebenarnya mempunyai dimensi batch dinamis: input
  **`[batch,3,224,224]`**, output **`[batch,3]`**, digunakan batch 1 untuk satu foto.
- `damage_pct` berasal dari confidence-scaled status ranges, bukan pengukuran
  jaringan rusak, luas bidang, kehilangan hasil atau penyebab banjir.
- Metadata menyatakan `calibrated_against_measured_damage:false`.
- Confidence gate runtime **0,35**, metadata **0,50**. Perbedaan ini tetap dicatat,
  bukan diperbaiki dengan mengubah model/metadata atau threshold tanpa eksperimen.
- SHA-256 v2 tetap
  `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`.

Disease classification, visual damage indication, flood causality dan field damage
severity bukan hal yang sama. Angka evaluasi historis tidak direproduksi di fase
ini, dan tidak dipakai sebagai bukti calibration/field generalization. Proposal
ICONFEST asli tetap belum tersedia di repo; tidak mengarang isinya.

## 2. Perubahan kontrak: derived view, bukan migrasi

`lib/reports/advisory.ts` menyediakan `advisory-v1` sebagai interpretasi read-only:

| Field/aspek | Perilaku implemented |
|---|---|
| Origin | `SERVER_AI`, `USER_REPORTED`, `PENDING`, atau `LEGACY_UNVERIFIED`; manual tidak diberi label hasil AI. |
| Predicted visual status | Kode API existing dipertahankan; label Indonesia menunjukkan indikasi visual/pemetaan kompatibilitas. |
| Original model class/version | **null/unknown** pada derived view karena endpoint/receipt existing tidak mengikat kelas asli dan model version. Tidak mengarang diagnosis atau versi pada sejarah. |
| Confidence | Skor klasifikasi foto 0–1, terpisah dari loss. Invalid/missing tidak menjadi nol; nilai asal tetap ada di `raw`. |
| Calibration | `UNCALIBRATED` untuk preview, `LEGACY_UNCALIBRATED` untuk interpretasi hasil tersimpan, `NOT_APPLICABLE` bila tidak ada assessment AI/manual. |
| Review | `REVIEW_REQUIRED`, termasuk setelah laporan diverifikasi. Verifikasi laporan tidak mengkalibrasi model. |
| Severity assessment | Uncalibrated visual indication, user-reported unverified, atau no AI assessment. |
| Measured affected area / field damage percent | `UNKNOWN_AFFECTED_AREA` dan null; tidak dihitung dari class, confidence, bbox, mask, area pendaftaran atau verification boolean. |
| Insurer decision | `NOT_DETERMINED`; tidak ada eligibility/claim verdict otomatis. |
| Raw audit fields | Status, confidence, damage_pct, source, receipt/report ID asli dipertahankan tanpa coercion/write. |

`reportAdvisory()` mengadaptasi DTO laporan. `submissionEvidence()` memilih sumber
yang sama untuk form online dan IndexedDB. Tidak menambahkan derived advisory
fields ke trusted receipt atau payload hash sebagai cara mengesahkan hasil.

### Kompatibilitas yang dipertahankan

- FastAPI `/predict` tetap tiga keys `status, confidence, damage_pct`.
- `/api/ai/analyze` dan receipt `analysis_id` tetap kompatibel, tanpa perubahan
  kontrak inference atau model selection.
- Nilai historis `ai_status/ai_confidence/ai_damage_pct` tidak di-update, di-null-kan
  atau diubah menjadi pengukuran. Preview/queue AI tetap membawa angka asli.
- Schema, RLS, officer RPC/finality, idempotency, hashes, signed-photo access,
  source fingerprints dan offline sync tetap menggunakan fondasi sebelumnya.
- YOLO tetap default OFF, preview-only dan terpisah. Tidak ada training,
  segmentasi, conversion polygon atau diagnosis/lokalisasi baru yang dibuat.

## 3. UI petani dan PPL/Dinas

Komponen bersama `AdvisoryAssessment` dipakai pada preview scan, scan terbaru,
report list/detail, field/report popup peta, dashboard dan dokumen pendukung.

- Label `rusak_berat` ditampilkan sebagai **Indikasi Kerusakan Berat**; ringan
  analog. `aman` bukan “Lahan Aman”, melainkan **Tidak Tampak Kerusakan (Foto)**
  dengan keterbatasan dan peninjauan yang tetap diperlukan.
- Keyakinan model diberi label **“klasifikasi foto”**, bukan akurasi atau persen
  kerusakan. Manual menyebut **Penilaian Pelapor**; legacy menyebut asal yang belum
  terverifikasi. Pending tidak diberi prediksi palsu.
- REVIEW_REQUIRED / **Perlu Verifikasi** tetap terlihat pada compact cards.
  Detail menjelaskan calibration, unknown affected area dan pemisahan klaim.
- `damage_pct` tidak ditampilkan sebagai persentase rusak. Detail teknis tertutup
  mempertahankan raw numeric output untuk audit, berlabel uncalibrated. Bahkan
  nilai nol historis tetap raw nol, bukan bukti measured zero damage.
- Dashboard tidak lagi memakai `100−damage_pct`, arbitrary 50/20 fallback health,
  default 100% sehat atau health progress bars.
- Poligon peta netral sebagai batas terdaftar; tidak mewarnai seluruh bidang
  seolah area rusak telah diukur. Pin tetap menunjukkan indikasi laporan/foto
  dan memerlukan peninjauan, bukan estimasi hektar.
- Verifikasi PPL memakai kata **Verifikasi Laporan/Tolak Laporan**, bukan approval
  klaim. Status final report/audit tetap utuh dan keputusan penanggung terpisah.
- Report verification notifications juga menjelaskan pemisahan klaim. Assessment,
  clock, source-quality dan thresholds EWS 2.0B tidak diubah.
- Copy marketing yang sebelumnya menjanjikan persentase kerusakan/luas terdampak
  diganti dengan klasifikasi awal, keyakinan dan luas terdaftar unik. Contoh 92%
  existing tetap jelas sebagai ilustrasi confidence, bukan metrik akurasi.

## 4. Manual reporting dan offline compatibility

`AnalysisFailureActions` menyediakan retake/retry **dan** manual reporting saat
AI unavailable maupun HTTP 422/domain-quality rejection. Valid image/evidence,
authorization dan geofence tetap diperlukan; kegagalan AI bukan penolakan klaim.

Explicit manual selection membawa `evidence_source:manual` dan status pelapor,
tanpa memalsukan confidence/AI receipt. Sumber AI membawa original confidence,
damage_pct dan receipt ID. Pending tetap pending bila belum ada penilaian.

Tidak ada rewrite database IndexedDB atau queued historical values. Server masih
memeriksa user/photo-bound receipts dan mengabaikan client confidence/verification/
measurement/claim fields. Wrong keys/payloads tidak overwrite existing evidence.

**Batas existing:** laporan pending yang sudah durable tetap mempunyai immutable
submission hash. Mengubah sumbernya menjadi manual sesudah pengiriman bukan
migrasi otomatis; existing conflict/recovery flow tetap berlaku. Tidak mengganti
idempotency key diam-diam untuk melewati konflik atau mengubah laporan final.

## 5. Definisi dan aturan agregasi luas

`lib/reports/area.ts` memisahkan:

1. **REGISTERED_FIELD_AREA**: nilai luas pada record pendaftaran lahan yang dibaca.
   Bukan pengukuran kerusakan atau bukti batas/hak legal.
2. **UNIQUE_REGISTERED_FIELD_AREA**: jumlah nilai konsisten dari ID lahan unik
   dalam **cakupan data yang disebutkan eksplisit**.
3. **MEASURED_AFFECTED_AREA**: membutuhkan verified measurement record independen.
   Record tersebut belum ada pada schema/workflow existing.
4. **UNKNOWN_AFFECTED_AREA**: hasil saat ini, tampil **“Luas terdampak belum
   terverifikasi”**, bukan 0 ha atau registered area × model score.

Aturan implemented:

- Deduplikasi hanya stable `lahan_id`/existing parcel UUID, bukan nama, report ID,
  polygon overlap, foto hash atau kepemilikan yang diasumsikan.
- Parcel A 2 ha dengan tiga laporan → **2 ha terdaftar unik**, tetap tiga laporan;
  affected area unknown, bukan 6 ha.
- ID parcel berbeda dihitung berbeda sebagai registrasi. Ini tidak membuktikan
  physical/legal uniqueness; overlap/two registrations satu bidang memerlukan
  workflow integrity selanjutnya, tidak auto-merge geometri sekarang.
- Nilai positive finite ≤1000 ha mengikuti batas input pendaftaran existing.
  Missing, blank, zero, negative, NaN/Infinity, malformed strings dan out-of-range
  menjadi unknown pada interpretasi, bukan mengubah nilai DB.
- Numeric decimal strings dari database dapat dibaca; boolean/hex/localized text
  tidak di-coerce menjadi hektar sah.
- Satu ID dengan nilai bertentangan atau sebagian referensi missing tidak memakai
  first/last/max. Total menjadi PARTIAL/UNKNOWN; subtotal konsisten serta jumlah
  referensi unknown ditampilkan. Input/per-report records tidak dimutasi.
- Empty set mempunyai registered sum 0 dengan status EMPTY, **bukan** measured
  zero damage. Unknown affected area tetap null.

### Cakupan tempat agregasi digunakan

- Riwayat petani: laporan termuat yang lolos filter aktif, sebelum pembagian halaman.
- Dashboard/settings: ID lahan pendaftaran yang berhasil dimuat; tidak menganggap
  load failure sebagai nol lahan/kerusakan.
- Rekap: laporan terverifikasi yang lolos filter tanggal/wilayah **di dalam data
  termuat**. Global ID dedup tidak menjumlahkan subtotals kelompok wilayah.
- Peta: batas dan luas terdaftar, dengan jumlah laporan termuat (maks. 200 terbaru),
  tanpa affected-area aggregation.

Luas hasil join adalah nilai pendaftaran **saat dibaca**, bukan immutable snapshot
luas/batas saat kejadian. Tidak ada verifikasi geodesik, ownership atau measurement
baru pada fase ini.

## 6. Report read contracts dan batas 200 laporan

`listVerificationReports()` tetap memakai hardened officer guard, assigned-PPL/
Dinas RLS scope, order waktu server dan limit **200**. Ditambah read-only fields:

- Stable `lahan_id`, reporter/reviewer ID dan nama yang tersedia.
- Client/server/verification timestamps yang asli.
- Receipt ID, photo paths dan first-photo hash yang tercatat.
- Exact visible count bila tersedia dan metadata
  `loaded_count/visible_count/limit/completeness/loaded_at`.

Count adalah jumlah reports yang terlihat sebelum filter client rekap, bukan jumlah
approved claims atau measured fields. Missing/inconsistent count → UNKNOWN;
count melebihi loaded rows → TRUNCATED. UI/dokumen menyebut batas dan tidak
menganggap recut 200 terbaru sebagai seluruh riwayat.

`listMyReports()` menambahkan original `lahan_id` (tetap ada bila joined relation
tidak tersedia), registered area/receipt ID yang diperlukan view;
map DTO menambahkan verification timestamp dan receipt ID. Tidak ada source/numeric
prediction update atau pelonggaran akses data.

## 7. AUTP print/export terminology

Workflow existing tetap **`window.print()` / Simpan PDF browser**, bukan integrasi
penanggung atau generator formulir resmi baru.

Pure `AutpSupportingReport` memberi dokumen **“Ringkasan Laporan Terverifikasi —
Dokumen Pendukung AUTP (Internal)”**, berisi:

- Cakupan/filter, maksimum 200 source rows, exact count/completeness bila tersedia.
- Filter waktu server **WIB**, inclusive calendar dates dengan end-exclusive next
  day; boundary milliseconds tidak hilang. Invalid/reversed filters fail closed.
- Registered unique ID area summary dan unknown affected area yang terpisah.
- Semua report IDs dan references dalam pilihan; repeated per-report registered
  area diberi catatan tidak untuk dijumlahkan.
- Preliminary AI/manual origin, confidence, LEGACY_UNCALIBRATED dan REVIEW_REQUIRED.
- Report-verification status, reviewer/actor IDs, notes dan timestamps.
- Private photo references, first-photo hash dan receipt ID bila tercatat. Tidak
  menanam token signed URL ke dokumen atau menyatakan referensi sebagai bukti
  bahwa berkas/foto telah diperiksa ulang.
- Missing evidence/reviewer/time/hash dan unknown policy/authorization/season/
  incident prerequisites dinyatakan perlu peninjauan, bukan fabricated completion.
- Penegasan verified report ≠ insurer approval; tidak ada official Jasindo approval
  atau integration assertion.

Cetak dinonaktifkan saat loading/error/invalid filter/no selected verified reports;
old document tidak ditampilkan sebagai fresh complete output sesudah read gagal.
Pure document component juga tidak mempromosikan unverified row dari caller menjadi
verified report. Waktu penyusunan perangkat dibedakan dari waktu read server.

Actual browser print pagination/layout/download **belum diuji**. Tampilan print
dan terminology/provenance diperiksa dengan React static markup.

## 8. Actual files changed

Hanya file berikut merupakan pekerjaan PHASE 2.0C; working tree juga berisi
perubahan banyak fase sebelumnya yang dipertahankan.

**Baru:**

- `lib/reports/advisory.ts`
- `lib/reports/area.ts`
- `lib/reports/reporting.ts`
- `components/features/AdvisoryAssessment.tsx`
- `components/features/RegisteredAreaSummary.tsx`
- `components/features/AnalysisFailureActions.tsx`
- `components/features/AutpSupportingReport.tsx`
- `tests/advisory-reporting.test.ts`
- Dokumen ini.

**Existing diubah:**

- `lib/recommendations.ts` — advisory labels/recommendations dan finite confidence display.
- `lib/ai.ts` — comment-only penjelasan UI 422/manual, runtime/contract tetap.
- `lib/notifications.ts` — report notices menjelaskan pemisahan klaim; EWS flow tetap.
- `app/(app)/scan/page.tsx` — shared AI view, manual fallback dan shared source selection.
- `app/(app)/scan/ScanTerbaru.tsx` — advisory compact results.
- `app/(app)/laporan/actions.ts` — additive registered-area/receipt read fields.
- `app/(app)/laporan/LaporanClient.tsx` — advisory list/detail dan scoped unique area.
- `app/(app)/peta/actions.ts` — safe registered-area/verification/receipt read fields.
- `app/(app)/peta/page.tsx` — advisory popups, registered-vs-affected labels/read scope.
- `app/(app)/peta/PetaMap.tsx` — neutral parcel boundaries dan review-required tooltips.
- `app/(app)/verifikasi/verification-actions.ts` — additive provenance/count scope; RPC tidak diubah.
- `app/(app)/verifikasi/RekapLaporan.tsx` — honest scoped/filterable print workflow.
- `components/features/ReportVerification.tsx` — shared view dan report-specific action labels.
- `app/(app)/dashboard/LahanSummary.tsx` — remove invented health percentages, registered ID summary.
- `app/(app)/dashboard/DashboardContent.tsx` — recap copy dan truthful existing demo explanation.
- `app/(app)/dashboard/AdminStats.tsx` — insurer-decision distinction.
- `app/(app)/settings/page.tsx` — scoped unique registered area; unknown not coerced to zero.
- `app/(marketing)/page.tsx`
- `app/(marketing)/fitur/page.tsx`
- `app/(marketing)/cara-kerja/page.tsx`
- `app/(marketing)/tentang/page.tsx` — empat file ini copy-only untuk AI/area truthfulness.

Tidak mengubah historical PRD/proposal/documents, SQL migrations, model/checkpoint,
FastAPI inference, YOLO contracts/flags, dataset/review records, atau production env.

## 9. Tests dan hasil aktual

Lingkungan: Node **26.8.1**, Python **3.12.15**, ONNX Runtime CPU.

| Perintah/check yang benar-benar dijalankan | Hasil |
|---|---|
| `node --import ./tests/register.mjs --test tests/advisory-reporting.test.ts` | **38/38 PASS** focused advisory/manual/area/print tests. |
| `npm run test:security` | **148/148 PASS**, termasuk 38 baru, 54 EWS 2.0B dan seluruh auth/report/offline/detector/review regression existing. |
| Python `unittest discover -s ai-service/tests -p 'test_*.py' -v` | **73/73 PASS**, termasuk real existing EfficientNet endpoint compatibility dan synthetic detector/QA/export contracts. Bukan accuracy test baru. |
| `npm run build` dengan placeholder/local-only env | **PASS**, Next.js 15.5.28, 25 static pages; cookie-dependent dashboard/lahan dynamic diagnostics expected. |
| `./node_modules/.bin/tsc --noEmit --incremental false` setelah build | **PASS**, tidak dijalankan paralel dengan regenerasi `.next/types`. |
| `git diff --check` | **PASS**. |
| Read-only ONNX introspection dan SHA check | Batch shapes, gate .35/.50, uncalibrated flag dan hash seperti §1 dikonfirmasi. |
| `git diff --exit-code -- PRD.md README.md ai-service/predict.py ai-service/model/model.onnx ai-service/model/model_v2.onnx ai-service/model/model_v2.metadata.json` | **PASS**, referensi/artefak tersebut tidak berubah. |
| `command -v autoglm`; `npm ls --depth=0 playwright @playwright/test puppeteer` | Browser CLI tidak ditemukan; paket browser automation tersebut tidak tersedia. Tidak diinstal. |

Test cases menggunakan synthetic fixtures, frozen record timestamps dan actual
React static rendering. Server submission tests memakai existing fake transport;
tidak mengklaim menjalankan database/RLS/insurance integration nyata.

Coverage meliputi confidence≠damage, raw legacy preservation (termasuk 0), unknown/
manual/pending origin, review required setelah report verification, no forged
measurement/claim fields, explicit manual ketika AI down/422, raw receipt/queue
compatibility, A×3→2 ha, dua ID, invalid/missing/conflicting areas, missing IDs,
scope/region/WIB boundaries, truncated reads dan truthful print terminology/refs.

Perintah Python aktual:

```sh
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v
```

Build aktual (environment proses saja; tidak mengubah file credentials):

```sh
env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder AI_API_URL=http://127.0.0.1:1 OPENWEATHER_API_KEY= NEXT_PUBLIC_APP_URL=http://127.0.0.1:1 AUTH_PHONE_OTP_ENABLED=false EWS_DEMO_ENABLED=false npm run build
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

Tidak ada browser E2E, actual PDF generation, live provider/DB calls, SMS, migrations,
training/export, dependency installation, credential change atau deploy pada fase ini.
Release Node 24/container Python 3.11 belum diuji ulang.

## 10. Remaining validation dan requirements terpisah

- Browser/mobile accessibility, actual scan/manual/verification navigation dan
  print/PDF page breaks perlu uji dengan environment terisolasi yang diotorisasi.
- Supabase joins/exact counts/grants/RLS dan source receipt/verification full
  integration tetap gates PHASE 0A/0A.1; unit fakes bukan bukti deployed enforcement.
- Rekap terbatas 200 source reports. Full-history/season/incident dossier membutuhkan
  pagination/snapshot dan server filter yang dirancang terpisah; tidak dianggap
  selesai hanya karena subtotal sekarang dideduplikasi.
- Registered areas belum geodesic/survey verified dan belum mempunyai immutable
  incident-time geometry snapshot; duplicate physical parcels di bawah ID berbeda
  memerlukan conflict/ownership/authorization workflow, bukan heuristic merge.
- **Verified affected measurement** memerlukan protocol/metode/unit/geometry/time/
  uncertainty, authorized reviewer dan evidence version yang terpisah. Future schema/
  RPC/RLS/rollback changes memerlukan approval; jangan memakai client measurement
  field atau verification boolean untuk melewati absence tersebut.
- Model receipt metadata lengkap (model hash/version, actual class, preprocessing,
  calibration evidence) dan reconciled confidence gate memerlukan milestone
  technical/scientific tersendiri. Tidak ada calibration benchmark baru di sini.
- Applicable AUTP policy/form/beneficiary/incident requirements belum dikonfirmasi;
  dokumen internal ini bukan formulir resmi atau integrasi penanggung.

## 11. Completion dan exact next milestone

**PHASE 2.0C selesai untuk local implementation, regression, TypeScript dan build.**
Live/browser/staging scientific/business validations tetap **UNVERIFIED**. Tidak
ada data approval atau izin rilis tersirat; model existing dan YOLO default OFF
dipertahankan.

Milestone berikut yang disarankan: **PHASE 2.0D.1 — Validasi Geometri Server dan
Inventaris Lahan Read-Only**, sebagai slice awal 2.0D dalam roadmap:

1. Validate finite lat/lon, ≥3 unique vertices, ring closure/topology/self-intersection
   pada existing polygon contract; invalid data tidak ditandai verified.
2. Dry-run inventory legacy geometry/declared area tanpa auto-correct/backfill.
3. Tentukan geodesic calculation/reference tests dan versioning plan, pertahankan
   declared-vs-derived area. PostGIS/schema changes hanya setelah approval/staging.
4. Preserve report FKs/geometry evidence dan RLS; tidak melakukan production migration
   atau mengaktifkan ownership verification dari metadata pengguna.
