# PHASE 2.0H — Final MVP Stabilization

Tanggal: **24 November 2026**. Horizon pengerjaan: **sekitar enam hari**, bukan
perpanjangan roadmap riset.

**Ringkasan:** satu P0 origin-guard ditemukan melalui HTTP nyata, direproduksi dengan
regression test, lalu diperbaiki secara sempit. Hasil akhir **245/245 Node tests**,
**73/73 Python tests**, **30/30 loopback HTTP checks**, build dan TypeScript PASS.
**Authenticated farmer → PPL/Dinas E2E belum lulus/dijalankan**: tidak tersedia
environment Supabase terisolasi yang terotorisasi beserta akun/SMS/browser runtime.
Hasil lokal tidak berarti demo lintas peran sudah siap tanpa prasyarat tersebut.

## 1. Preservasi dan inventaris sebelum perubahan

`git status --short --untracked-files=all` dan `git diff --stat` diperiksa sebelum
edit. Baseline sudah mempunyai **60 tracked files modified**, plus untracked
source/docs/tests/assets dari fase sebelumnya. Diff saat itu 1.040 insertions/
3.303 deletions adalah **pekerjaan sebelum H**, bukan refactor pada fase H.

Kelompok pekerjaan yang diidentifikasi:

- **0A/0A.1:** native OTP/pinned profile, hardened clients/middleware, report evidence,
  account-safe queue, verification RPC serta candidate source migrations/security tests.
- **1A/1B/review:** detector default-OFF contracts, training/readiness/visual-QA tools,
  offline review workspace dan decision semantics.
- **2.0A:** proposal PRD/AI/land/claim/roadmap; bukan fitur deployed.
- **2.0B:** truthful EWS sources/freshness/shared assessment dan water audit markers.
- **2.0C:** advisory interpretation, unique registered area dan internal AUTP report.
- **2.0D.1:** shared geometry/land validation, WGS84 area, geofence dan inventory.
- **2.0D.2:** fixture-only model, candidate SQL/harness; tetap NOT_WIRED dan DB unverified.
- PDF, `TASK-MAINTENANCE.md`, dan `video_arsip/` dikenali sebagai existing user work;
  tidak diganti/dihapus. Tidak perlu membuka konten pribadi untuk pengujian sintetis.

Sembilan file D2 (tiga module versioning, empat SQL PoC files, DB runner dan dokumen
D2) diperiksa `git hash-object` sebelum/sesudah: **semua hash identik**. Tidak ada
kelanjutan D3 atau eksekusi candidate SQL. `PRD.md`, `README.md`, base schema/demo seed,
`predict.py`, ONNX models dan metadata v2 juga lolos preservation diff terhadap HEAD.
Diff package/lock yang sudah ada adalah perubahan fase sebelumnya, termasuk
GeographicLib D1; H tidak memasang dependency atau mengubah package files.

Instruksi H **tanpa commit/push/deploy** mengalahkan preferensi auto-push lama dalam
`AGENTS.md`. Perubahan H hanya pada file di §5; pekerjaan sebelumnya dipertahankan.

## 2. Cara membaca status dan evidence

Status yang digunakan:

- **WORKING_AND_TESTED:** perilaku yang disebut benar-benar dieksekusi; scope bukti
  dibatasi jelas, bukan inferred dari source.
- **WORKING_BUT_UNVERIFIED:** jalur lokal sudah dieksekusi dengan fixture/contract
  tests, tetapi integrasi real provider/device/browser belum dibuktikan.
- **BROKEN:** kegagalan tereproduksi pada scope yang diuji; tidak ditutupi oleh build.
- **MOCK_OR_DEMO:** synthetic fixtures/simulation, tidak menjadi bukti data nyata.
- **MISSING:** capability belum tersedia, bukan respons sukses yang dibuat-buat.
- **BLOCKED:** prasyarat environment/otorisasi belum tersedia sehingga belum diuji.

Evidence tiers:

| ID | Apa yang dijalankan | Apa yang tidak dibuktikan |
|---|---|---|
| **H-HTTP** | Next.js production build + Uvicorn milik runner, hanya `127.0.0.1`; actual HTTP requests, middleware, routes, real existing EfficientNet. | Positive SMS login, real database, Storage permissions, authenticated UI atau browser/device. |
| **H-APP** | 12 tests memanggil actual route handlers/server actions. Hanya Supabase transport factories/Next cache diganti; existing OTP/pinned-profile helper dan business code tetap dijalankan. | JWT signature/GoTrue/SMS, RLS, DB locks/atomicity/durability; canned RPC reply bukan eksekusi SQL. |
| **REG-NODE** | Semua245 tests termasuk H + auth/evidence/offline/EWS/advisory/land/review/D2 regression lama. | Transport fakes/FIFO bukan database atau browser E2E. |
| **REG-PY** | Semua73 AI/detector/review/readiness tests, termasuk real classifier contract. | Training, crop/flood accuracy, real localized detection atau pengukuran hektar rusak. |
| **SOURCE** | Source diperiksa untuk menemukan wiring/gaps dan merancang smoke berikutnya. | Source saja tidak dipakai untuk menyatakan fitur berhasil. |

## 3. Actual feature readiness matrix — 18 langkah MVP

Kolom status menilai **feature MVP**, bukan hanya utility yang dites. Karena belum
ada positive native-platform/browser E2E, banyak row tetap WORKING_BUT_UNVERIFIED.

| # | Fitur | Actual status | Evidence aktual dan batas |
|---|---|---|---|
| 1 | Farmer login/authentication | **BLOCKED** | H-HTTP login/daftar200, forged cookies ditolak, OTP disabled503; H-APP session/helper contracts PASS. SMS delivery/native identity linking/positive login belum diuji pada isolated provider. |
| 2 | Lihat registered fields | **WORKING_BUT_UNVERIFIED** | H-APP actual `/api/lahan` dan land action mengembalikan fixture milik actor. Native DB read/RLS dan browser list belum diuji. |
| 3 | Register/update valid polygon | **WORKING_BUT_UNVERIFIED** | H-APP actual create + PATCH200; bow-tie422, forged owner400, other-owner PATCH/DELETE403 tanpa mutation. REG-NODE WGS84/owner/Poktan tests PASS. Leaflet interaction dan real DB persistence belum diuji. |
| 4 | Field information/geographic area | **WORKING_BUT_UNVERIFIED** | Actual server assessment >12.000m² untuk short synthetic Karawang ring; declared0,75ha tetap terpisah. Independent D1 area references PASS. Map rendering/device GPS belum diuji. |
| 5 | Flood EWS | **WORKING_BUT_UNVERIFIED** | H-HTTP actual weather route menunjukkan MISSING/INVALID/null, bukan fake zero/AMAN. REG-NODE current-context/freshness/shared-state tests PASS. Live weather + native water provenance + dashboard browser belum diuji. |
| 6 | Upload crop damage photo | **WORKING_BUT_UNVERIFIED** | H-APP multipart → hash → content-addressed upload path diuji dengan synthetic bytes/in-memory storage. Real camera/compression/Storage/signed-image fetch belum dibuktikan. |
| 7 | Advisory AI analysis | **WORKING_BUT_UNVERIFIED** | H-HTTP real EfficientNet `/predict`200 pada synthetic green PNG; H-APP analyze → stored receipt → advisory data PASS. Bukan accuracy/crop-damage validation; actual authenticated browser/receipt storage belum diuji. |
| 8 | Submit damage report | **WORKING_BUT_UNVERIFIED** | H-APP actual `submitReport`/`submitEvidence` menghubungkan original parcel/photo hash/receipt ID ke farmer/PPL reads. Real INSERT/Storage/permissions belum diuji. |
| 9 | Manual saat AI unavailable | **WORKING_BUT_UNVERIFIED** | H-APP synthetic fetch abort → actual adapter504/manual response → actual manual submit sukses, tanpa panggilan AI tambahan atau angka AI palsu. Real browser tombol/manual form belum diuji. |
| 10 | Offline queue dan synchronization | **WORKING_BUT_UNVERIFIED** | H-APP actual synchronizer → `/api/sync`: offline tidak upload, lost response lalu same-key retry menghasilkan satu fixture report/object dan matching ack. Persistence callback memory; **IndexedDB/device/network/browser belum diuji**. |
| 11 | Farmer report status | **WORKING_BUT_UNVERIFIED** | Actual `listMyReports` mempertahankan ID, pending state, verified/rejected timestamp dan notes dari synthetic provider fixtures. UI refresh/role switch/real verification commit belum diuji. |
| 12 | PPL/Dinas authorized login | **BLOCKED** | Role guards/helper tests PASS; tidak tersedia akun native PPL/Dinas + SMS di environment terisolasi untuk positive login. |
| 13 | Lihat submitted reports | **WORKING_BUT_UNVERIFIED** | H-APP actual `listVerificationReports`, scope metadata dan embedded parcel/reporter fields diuji. Assigned-group vs cross-group **DB RLS tidak diemulasi**. |
| 14 | Inspect photos/GPS/parcel/AI | **WORKING_BUT_UNVERIFIED** | H-APP mempertahankan GPS−6,3125/107,2855, parcel FK, hash/AI receipt dan signed-URL field. URL adalah canned fixture; actual photo access/modal/GPS/device belum diuji. |
| 15 | Verify/reject dengan notes | **WORKING_BUT_UNVERIFIED** | H-APP PPL/Dinas mengirim narrow `verify_damage_report` RPC dengan ID/boolean/trimmed note; error provider dan >500chars ditolak. **SQL RPC tidak dieksekusi**, jadi finalization/audit atomicity belum terbukti. |
| 16 | Unauthorized tidak boleh verify | **WORKING_BUT_UNVERIFIED** | H-APP farmer/anonymous ditolak sebelum RPC; H-HTTP forged-cookie `/verifikasi`/`audit` redirect login. Positive native tokens/direct RPC/effective grants/cross-scope SQL tetap gate terpisah. |
| 17 | Audit records dan farmer-visible status | **BLOCKED** | H-APP actual submit-audit write/read dan farmer notes mapping PASS dengan fixtures. **Verification audit creation/commit/read lintas akun nyata belum dapat dikonfirmasi** tanpa database. Tidak mengarang audit sukses dari canned RPC. |
| 18 | AUTP supporting documentation | **WORKING_BUT_UNVERIFIED** | Actual React HTML render memakai mapped PPL report mempertahankan IDs/notes/hash/receipt, REVIEW_REQUIRED dan non-insurer notice; tidak mencetak signed URL token. Browser print/PDF/pagination fisik belum diuji. |

### Capability tambahan dan batasnya

| Capability | Status | Batas |
|---|---|---|
| Exact-origin API guard setelah fix | **WORKING_AND_TESTED** | H-APP loopback/IPv6/HTTPS/alias/port/protocol/spoof checks + real H-HTTP same/cross-origin. |
| EfficientNet local HTTP contract | **WORKING_AND_TESTED** | Existing model loaded, inference shape/ranges, corrupt-image400. Tidak menjadi agronomic accuracy guarantee. |
| EWS unavailable/invalid states | **WORKING_AND_TESTED** | Actual no-key route MISSING/null; invalid coords400; production demo request INVALID. Live indicator readiness tetap unverified. |
| Synthetic Supabase/AI transport fixtures | **MOCK_OR_DEMO** | Test-process only; bukan mode login demo di aplikasi dan bukan fake detections. |
| Explicit EWS simulation | **MOCK_OR_DEMO** | Existing unit-tested simulation diberi label; disabled pada HTTP production-build run ini. |
| Trained localized crop-damage detector | **MISSING** | Unfinished research capability; YOLO OFF. Real AI detect HTTP503/UNAVAILABLE tanpa `detections`. |
| Native provider/browser E2E | **BLOCKED** | Tidak ada isolated account/provider approval/configuration dalam sesi ini; automation runtime tidak tersedia. |
| Cold-start/reload app shell saat offline | **MISSING** | Tidak ditemukan service-worker registration/app-shell cache pada app/components/lib atau public SW. Queue existing-open-session tidak membuktikan cold-start offline. |
| Polygon editing UI | **MISSING** untuk mengedit vertices existing parcel | Register polygon tersedia pada source; existing edit card hanya name/declared area. Active PATCH polygon diuji, tetapi bukan bukti editor UI existing tersedia. MVP bisa memakai registration valid + update metadata. |
| Verified legal ownership/overlap adjudication/duplicate incident prevention lengkap | **MISSING** | Owner ID, Poktan, geometry/geofence dan exact-photo24h heuristic bukan legal rights/incident identity. Ambiguitas tetap perlu review. |
| D2 DB versioning | **WORKING_BUT_UNVERIFIED**, NOT_WIRED | Frozen local PoC; tidak dijadikan prerequisite MVP atau diaktifkan pada H. |

## 4. P0 ditemukan dan diperbaiki

### P0-H-01 — Same-origin loopback request salah ditolak403

**Before:** guard memakai `Origin !== request.nextUrl.origin`. Actual Next.js
`NextURL` menormalisasi `http://127.0.0.1:PORT` menjadi `http://localhost:PORT`.
Browser mengirim Origin127.0.0.1 yang sah, sehingga OTP, AI analysis dan sync dapat
terblokir sebelum auth/submission. Ini P0 untuk local functional demo, bukan
dugaan kerusakan produksi yang sudah dibuktikan.

**Evidence sebelum fix:**

- Actual HTTP runner berhenti setelah17 checks: same-origin `/api/sync` yang seharusnya
  mencapai anonymous401 justru **403**. Re-run mengonfirmasi status yang sama.
- Regression memakai actual `NextRequest`, exact Host/Origin127.0.0.1 dan authenticated
  synthetic actor: expected manual sync200, actual **403**. Suite10PASS/1FAIL saat itu.

**Small fix:** shared `isSameOriginRequest` mempertahankan canonical-origin comparison
untuk normal hosts. Hanya ketika Next menormalkan loopback menjadi localhost,
helper memulihkan **exact actual Host** (localhost/127.0.0.1/[::1]) dengan scheme dan
port yang sama. Tidak memperlakukan alias berbeda sebagai equivalent, tidak
mempercayai `X-Forwarded-Host`, tidak mengizinkan missing/null Origin atau wildcard.
Auth/native OTP/pinned profile, owner checks, evidence receipts dan role guards tetap
dievaluasi setelah origin lolos.

**After:** H-APP manual sync200, 12/12 focused tests PASS. H-HTTP same-origin sync/
analysis kini mencapai401 untuk anonymous; cross-origin tetap403. Disabled OTP
menghasilkan intended503, bukan false-origin403. Full30/30 HTTP checks PASS.

Tidak ada P0 backend lain tereproduksi dalam scope yang bisa diuji. Ini **bukan**
pernyataan bahwa full browser/native-DB workflow bebas P0.

### Observasi P1/browser yang belum dijadikan perluasan patch

Source review menemukan beberapa kandidat smoke manual, **belum reproduction browser**:

- List lahan dimuat sekali di client; create memanggil server revalidation tetapi
  tidak memiliki explicit client-list refresh signal. Periksa apakah perlu reload
  setelah registration; jangan menyimpulkan list otomatis diperbarui dari source.
- Tombol hapus vertex di dalam registration form belum explicit `type="button"`;
  periksa risiko implicit form submit sebelum demo. Untuk rehearsal awal hindari
  koreksi titik setelah field lain lengkap sampai kasus ini diuji manual.
- Handler UI verifikasi tidak membungkus network throw dengan try/finally; periksa
  recoverability tombol setelah lost connection. Reload mungkin diperlukan.
- Pindah akun tanpa full navigation, signed-photo expiry, report-date filters dan
  browser print layout masih memerlukan real UI smoke.

H tidak melakukan speculative UI refactor atau menyebut kandidat ini telah fixed.
Jika rehearsal mengonfirmasi menghalangi alur inti, beri prioritas targeted P0 patch.

## 5. Files changed khusus H

| File | Perubahan H |
|---|---|
| [`lib/auth/origin.ts`](../lib/auth/origin.ts) — baru | Exact-origin guard untuk Next loopback normalization. |
| [`app/api/auth/otp/route.ts`](../app/api/auth/otp/route.ts) | Memakai shared guard; native OTP flow tetap. |
| [`app/api/ai/analyze/route.ts`](../app/api/ai/analyze/route.ts) | Memakai shared guard; EfficientNet/receipt contract tetap. |
| [`app/api/sync/route.ts`](../app/api/sync/route.ts) | Memakai shared guard; same-key/evidence/owner behavior tetap. |
| [`app/api/ai/detect/route.ts`](../app/api/ai/detect/route.ts) | Guard yang sama; capability tetap OFF, tidak menambahkan detections. |
| [`tests/mvp-workflow.test.ts`](../tests/mvp-workflow.test.ts) — baru | 12 actual-handler/action integration/regression tests dengan transport sintetis yang dilabeli. |
| [`scripts/mvp-local-smoke.py`](../scripts/mvp-local-smoke.py) — baru | Runner30 real loopback HTTP checks; owned Next/Uvicorn processes dan synthetic PNG; tanpa dependency baru. |
| Dokumen ini — baru | Readiness matrix, evidence, blockers dan deadline plan. |

`git diff` terhadap HEAD juga memuat perubahan besar fase sebelumnya (misalnya
shared report submission); itu tidak boleh diklaim sebagai rewrite H. Active H
application patch hanya helper origin dan import/guard replacements pada empat routes.

## 6. End-to-end results dan verification ledger

### A. H-APP — executable integration, BUKAN full provider E2E

12 cases PASS mencakup:

1. Actual session endpoint checked actor/logout denial.
2. Create → read → valid PATCH; original identity/declared area terjaga.
3. Other-owner edit/delete, invalid ring dan forged owner rejection.
4. Analyze adapter → photo-bound receipt → submit → farmer read → PPL read → narrow
   verification request → AUTP HTML. **Verification result row diinjeksi sebagai
   synthetic provider state; bukan actual SQL commit atau audit proof.**
5. Synthetic abort →504/manual marker → successful manual submission tanpa AI calls
   tambahan. Abort disimulasikan; test tidak menunggu85detik atau membuktikan cold-start SLA.
6. Offline/no upload → lost reply → same-key retry/ack pada active sync route;
   one fixture row/object, original blobs/key dipertahankan. Persistence callback
   memory, bukan IndexedDB.
7. Farmer/anonymous officer-action/audit denial sebelum RPC.
8. PPL/Dinas reject/verify note contract dan provider errors.
9. Submit-audit read + farmer rejected-state/notes mapping dengan synthetic provider rows.
10. Cross-origin AI/sync rejection.
11. Loopback manual-report regression yang sebelumnya403.
12. Strict host/scheme/port/IPv6/forwarded-host origin cases.

H-APP fake transport **tidak** mengimplementasikan pretend RLS atau SQL verify logic.
JWT-signature check, RPC locking/transaction, verification audit creation dan durable
database commit sengaja tidak dinyatakan tested dari canned replies.

### B. H-HTTP — actual local services

Runner menjalankan production build pada fresh localhost port dan existing Uvicorn
AI process. Hanya loopback requests, proxies/redirect follow disabled, no target URL/
DSN/credentials arguments. Child env menunjuk Supabase ke closed loopback port1,
placeholder keys, OTP/weather/demo/YOLO OFF. Temporary logs memakai private temp
directory dan owned processes dihentikan setelah pengujian. Tidak ada production
data query, test login bypass atau mock-cookie authentication yang diaktifkan.

Final **30/30 PASS**:

- 3 public pages200.
- 10 protected-page redirects/login dengan anonymous/forged old mock cookies.
- 3 private-data endpoints401.
- 4 AI/sync same-origin401 vs cross-origin403 checks.
- Disabled OTP503 dan web YOLO `enabled:false`.
- 3 EWS MISSING/INVALID/null checks, tanpa fallback simulasi.
- 5 AI checks: loaded health, metadata, real EfficientNet synthetic inference,
  corrupt-image400, detector503 tanpa fake boxes.

HTTP green PNG hanya **contract test**, bukan foto kerusakan padi yang divalidasi
ahli. Prediksi valid tidak membuktikan domain gate menolak semua objek non-padi.

### C. Required checks

| Check aktual | Hasil |
|---|---|
| `npm run test:security` | **245/245 PASS**: 233 sebelumnya +12 H. |
| Python AI unittest discovery | **73/73 PASS**. |
| `npm run build` dengan local placeholder env/YOLOfalse | **PASS**, compiled/type-check dan25-page generation selesai. |
| `tsc --noEmit --incremental false` setelah build | **PASS**. |
| `git diff --check` | **PASS**. |
| Preservation diff untuk historical/base/model files §1 | **PASS**. |
| Sembilan D2 source/artifact hashes sebelum/sesudah | **Identik**, tanpa candidate execution. |
| Browser automation | **BLOCKED / NOT_RUN**: `autoglm` tidak tersedia; project tanpa Playwright/Puppeteer; AI venv tanpa Playwright/Selenium/Pyppeteer. |
| Native Supabase/SMS/Storage/RLS/verification transaction E2E | **BLOCKED / NOT_RUN**. |

TSC sempat berjalan bersamaan dengan build dan mendapat TS6053 karena `.next/types`
sedang diregenerasi. Re-run **setelah build selesai PASS**; ini invocation-order
issue, bukan source type error yang disembunyikan. Build mencetak expected
cookie-dependent `/dashboard`/`lahan` `DYNAMIC_SERVER_USAGE`, exit sukses.

Lingkungan aktual: Node26.8.1, Python3.12.15, Next15.5.28. Target Node24/container
Python3.11 belum diverifikasi pada H. Tidak ada lint pass claim; ESLint repo belum
dikonfigurasi.

Perintah reproducible dari repo root:

```sh
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" npm run test:security
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v
env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder AI_API_URL=http://127.0.0.1:1 OPENWEATHER_API_KEY= NEXT_PUBLIC_APP_URL=http://127.0.0.1:1 AUTH_PHONE_OTP_ENABLED=false EWS_DEMO_ENABLED=false AGRIGUARD_YOLO_ENABLED=false npm run build
./node_modules/.bin/tsc --noEmit --incremental false
PYTHONDONTWRITEBYTECODE=1 ai-service/.venv/bin/python scripts/mvp-local-smoke.py
git diff --check
```

Jalankan TSC/smoke **setelah** build, bukan paralel dengan build. Python regression
dan Node tests boleh paralel. Script smoke memerlukan existing build dan installed
AI venv, tidak build/install secara otomatis. Tidak menghubungi configured live URL.

## 7. Remaining external blockers dan unverified features

1. **P0 verification gate: isolated native account/provider environment.** Belum ada
   target Supabase terisolasi yang terotorisasi beserta empat synthetic roles:
   farmerA, farmerB, assigned PPL, Dinas; minimal dua Poktan untuk cross-scope test.
   Existing UUID/roles dan phone pin perlu konsisten; jangan mengganti dengan
   predictable password/mock-login bypass. Proses lokal sengaja OTPfalse sehingga
   **503 pada smoke adalah expected**, bukan login positif yang sudah sukses.
2. **Actual existing0A/0A.1 schema/RLS/Storage readiness.** Belum dibuktikan pada DB
   isolated: `ai_analyses`, submission/evidence columns, `verify_damage_report`,
   grants, policy composition dan photo access. Absence/mismatch dapat memblokir
   receipt/report/verification meski TypeScript green. H tidak menerapkan migrasi.
3. **Browser/device E2E.** Actual Leaflet registration, image compression, GPS
   permission/denial, IndexedDB save/reload/ack, account switch, reconnect, role UI,
   photos dan print/PDF belum dibuktikan. Automation runtime belum tersedia; manual
   rehearsal pada browser/perangkat dengan isolated accounts tetap diperlukan.
4. **Live EWS source readiness.** OpenWeather key/provider dan current water entry+
   matching audit provenance harus diverifikasi bila ingin demo valid live warning.
   Tanpa itu tampilkan unavailable/unknown, bukan membuat angka AMAN atau sensor.
5. **Real crop-photo/domain validation dan release runtime.** Existing EfficientNet
   adalah classifier advisory; cold-start/service timing, accepted real photo dan
   quality rejection pada perangkat serta target runtime masih unverified.

Submit audit saat ini best-effort dan terpisah dari report INSERT; H tidak
mengklaim atomik. Verification RPC source menarget decision+audit transaction,
tetapi hasil database nyata belum diuji. Water write+audit juga masih terpisah.
Constraint ini dicatat, bukan dijadikan alasan refactor arsitektur enam hari.

## 8. Mock/demo limitations dan demo runbook

- Synthetic transport/testing identities bukan native authenticated demo users.
  Jangan menampilkan test count sebagai bukti seluruh farmer–PPL E2E sudah berhasil.
- YOLO tetap OFF; localized crop-damage detection adalah **riset belum selesai**.
  Tidak membuat boxes, severity maps, atau fake successful empty detections.
- Confidence = classification confidence. `damage_pct` existing uncalibrated/
  advisory; tidak dikonversi menjadi measured affected hectares atau insurer approval.
- Declared registered area dan computed model-polygon area berbeda; bukan legal
  ownership, survey certification, overlap adjudication atau duplicate-incident proof.
- AUTP output adalah dokumen pendukung **internal**, bukan formulir/integrasi resmi
  Jasindo atau persetujuan klaim; print/PDF aktual tetap perlu rehearsal.

Setelah isolated native environment tersedia, rehearsal minimal:

1. Login farmerA native OTP → register valid short polygon → cek field ID dan
   computed/declared area. Reload daftar bila refresh belum terbukti; pilih parcel
   yang benar ketika Scan. Coba farmerB PATCH parcelA dan harapkan denial.
2. Pilih authorized synthetic/test photo, GPS/peta di dalam parcel → advisory AI →
   submit. Catat report/key/receipt/hash/parcel, tanpa mencetak signed token.
3. Buat **photo/key baru** untuk manual demonstration, pilih manual sebelum first
   submit saat AI unavailable. Jangan mengganti source/manual hash dari report yang
   sudah diterima untuk memaksa same-key retry lolos409.
4. Untuk offline: buka/cache session dan field **saat online dahulu**, kemudian
   putuskan jaringan, simpan foto/report, periksa IndexedDB, reconnect, pastikan satu
   durable report dan matching ack. Jangan menjanjikan cold-start offline.
5. Login PPL: lihat exact report/foto/GPS/parcel/advisory, verify satu report dan
   reject report lain dengan notes. Farmer tidak boleh memanggil narrow RPC; PPL
   lintas Poktan harus ditolak. Dinas diuji sesuai scope yang dimandatkan.
6. Baca actual verification audit dan farmer-visible final state; refresh kedua
   sisi. Cetak/save PDF supporting AUTP dari verified rows, cek content/pages.

## 9. Exact next critical task dan rencana enam hari

**Next critical task: dalam24jam pertama, operator menyediakan/menyetujui isolated
Supabase test environment + native Phone Auth/SMS + synthetic farmer/PPL/Dinas
accounts, lalu jalankan satu positive login → report → verify/reject → audit/readback
di aplikasi aktif.** Ini gate MVP H, **bukan D2 database-versioning follow-up**.
Jangan mengirim secrets melalui chat atau menggunakan produksi sebagai test target.

| Hari relatif | Target realistis dan exit criteria |
|---|---|
| 1 | Freeze scope; siapkan authorized isolated native accounts/provider dan bukti existing0A/0A.1 compatibility. Satu positive farmer dan PPL login wajib terbukti. Jika belum ada, eskalasi blocker hari itu. |
| 2 | Rehearsal farmer → report → PPL verify/reject → actual audit → farmer readback; cross-user parcel/direct RPC negative cases. Patch hanya P0 yang tereproduksi. |
| 3 | Real device: photos/GPS/Leaflet, manual fallback, IndexedDB persistence, lost reply/reconnect/account isolation. Buktikan ack sebelum clear-pending; periksa kandidat UI §4. |
| 4 | EWS unavailable/stale/context dan, bila provider siap, valid current sources; real AI cold-start/quality errors/manual path. Tidak melatih detector baru. |
| 5 | AUTP print/PDF, IDs/notes/photos/access, dataset/test evidence labelling; rerun regression/build dan release-runtime smoke. |
| 6 | Code freeze, full dress rehearsal, backup evidence/video yang dilabeli, submission checklist. Tidak menambahkan D3/YOLO/training/ownership/claim subsystem. |

Realistis dalam enam hari: mengikat dan membuktikan **existing MVP** bila provider/
isolated accounts tersedia awal; targeted fixes, manual/device rehearsal dan
supporting report. Tidak realistis menjanjikan validated localized crop-damage AI,
legal ownership/overlap/incident engine atau fully integrated geometry versioning.

## 10. Submission readiness assessment

- **GO — local engineering checks:** origin P0 fixed; real local service smoke,
  advisory/geometry/security/evidence/offline contracts dan regression/build green.
- **CONDITIONAL GO — functional demo preparation:** existing farmer/PPL workflow
  hanya setelah positive native-platform/device rehearsal dan actual audit/Storage
  readback. Missing live EWS dapat didemokan jujur sebagai unavailable/unknown.
- **NO-GO — klaim complete E2E atau production readiness sekarang:** SMS/native
  roles/RLS/verification transaction/IndexedDB/browser/PDF belum terbukti. Tidak
  menyatakan18/18 fitur WORKING_AND_TESTED dari source atau mocks.

H ditutup dengan code patch lokal dan evidence ledger ini; **full authenticated MVP
verification tetap BLOCKED** sampai prerequisite eksternal dipenuhi. Tidak ada
production data access/migration, D2 SQL activation, YOLO activation/training,
EfficientNet replacement, secrets change, commit, push atau deployment pada fase ini.
