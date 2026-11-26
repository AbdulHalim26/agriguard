# PHASE 2.0B — EWS Truthful States

Tanggal: **17 November 2026**. Status: **IMPLEMENTED_AND_TESTED secara lokal**.
Browser/device, live provider, deployed RLS dan DB/SMS integration tetap
**UNVERIFIED**. Ini bukan persetujuan rilis produksi.

## 1. Hasil implementasi

EWS sekarang memisahkan kualitas masing-masing sumber dari status risiko.
Missing/invalid/mock/expired tidak menjadi nol atau AMAN secara implisit. Sinyal
bahaya yang masih valid tetap tampil walaupun sumber lainnya gagal.

Existing OpenWeather, Next.js/TS, Supabase, maps, report receipts/offline, EfficientNet
dan detector dipertahankan. Threshold tetap hujan **20 mm/3h** untuk WASPADA,
**50 mm/3h** atau air **1,2 m** untuk BAHAYA. Ini aturan prototype existing, bukan
model hidrologi lokal atau kebijakan resmi pemerintah/asuransi.

Tidak ada migrasi, dependency baru, perubahan seed/raw dataset/review, model swap,
training, YOLO activation, credential change, deploy, commit atau push.

## 2. Actual files changed pada fase ini

Working tree mempunyai perubahan fase sebelumnya; daftar ini hanya PHASE 2.0B.

### File baru

| File | Peran |
|---|---|
| `lib/ews/data.ts` | Source/quality/context types, configurable policy, timestamp/number validation, water attestation checks, WIB/value formatting. |
| `lib/ews/weather.ts` | OpenWeather slot normalization, bounded cache/inflight dedup, explicit missing/stale/mock outcomes. |
| `lib/ews/weather-server.ts` | Server-only policy/provider environment boundary dan production demo guard. |
| `lib/ews/water-server.ts` | Authorized timestamped water update/audit serta read-only quality assessment. |
| `lib/ews/assessment.ts` | Shared assessment contract, final expiry recheck, neutral invalidation, notification derivation. |
| `lib/ews/assessment-server.ts` | Authenticated orchestration dengan injected clock/provider/DB boundaries untuk tes. |
| `lib/ews/client-store.ts` | Account-scoped single-flight store, server lease, offline/timeout/late-response protection. |
| `components/features/FloodAssessmentProvider.tsx` | Satu assessment/location snapshot untuk hero dan notifikasi dalam app layout. |
| `components/features/FloodStatusPanel.tsx` | Pure presentation lima state, source cards, WIB, retry dan explicit simulation UI. |
| `tests/ews.test.ts` | 54 regression tests dengan frozen time/controlled fixtures. |
| Dokumen ini | Kebijakan, hasil verifikasi dan readiness gates. |

### File existing yang diubah

- `lib/thresholds.ts` — sufficiency/precedence dan neutral statuses.
- `lib/notifications.ts` — memakai shared assessment, tanpa cuaca default independen;
  notice EWS mempunyai waktu penilaian server, bukan waktu render.
- `lib/audit-labels.ts` — label Bahasa Indonesia untuk pencatatan tinggi air.
- `app/api/weather/route.ts` — endpoint compatibility + quality/provenance/no-store.
- `app/api/water-levels/route.ts` — authenticated read dan quality/provenance/no-store.
- `app/(app)/dashboard/flood-actions.ts` — server action ke orchestration yang diuji.
- `app/(app)/dashboard/DashboardHero.tsx` — memakai shared provider/presentation.
- `app/(app)/dashboard/NotifikasiWidget.tsx` — waktu EWS berlabel WIB.
- `app/(app)/layout.tsx` — provider account-scoped pada main content.
- `app/(app)/notifikasi/page.tsx` — EWS notice/retry dan waktu server WIB.
- `app/(app)/verifikasi/water-actions.ts` — authorized update/read helpers.
- `components/features/WaterLevelForm.tsx` — current-reading confirmation, kualitas/
  waktu, refresh/reconnect/expiry handling; tidak menyatakan data seed sebagai nyata.
- `tests/register.mjs` — native Node ESM resolves `next/link.js` untuk merender
  komponen Link asli pada static UI contract tests; tidak menambah test framework.

PRD historis, sembilan dokumen 2.0A, source/model AI dan migrasi tidak ditulis ulang.

## 3. Kontrak kualitas dan traceability

Setiap `EwsSource` berisi:

- `source`, `kind`, `record_id`, nilai dan unit (`mm/3h` atau `m`).
- `quality`, `reason_code`, alasan Bahasa Indonesia.
- `observed_at`, `issued_at`, `recorded_at`, `valid_from/valid_until` bila tersedia.
- `retrieved_at`, `expires_at`, `timestamp_basis` dan coordinate/district context.

Unknown timestamp tetap **null**, tidak diisi waktu telepon atau waktu fetch sebagai
waktu pengukuran. Assessment menyertakan `user_id`, `context_id`, `evaluated_at`,
policy/version, kedua sources, completeness serta server-issued recheck lease.

| Quality | Arti |
|---|---|
| VALID | Memenuhi kontrak nilai/waktu/konteks dan kebijakan engineering saat penilaian. Bukan sertifikasi sensor/akurasi banjir. |
| MISSING | Sumber/konfigurasi/record tidak tersedia atau layanan tidak dapat diakses. |
| INVALID | Nilai, timestamp, context, format, konfigurasi policy atau bukti pencatatan tidak dapat dipercaya. |
| STALE | Sumber melewati umur/validity; atau data terakhir tidak berhasil diperbarui dan hanya historis. |
| MOCK | Angka contoh simulasi yang dipilih eksplisit. Bukan observasi nyata. |

Flat fields existing (`rain_3h_mm`, `water_level_m`, `source`, `location_source`,
`last_updated`) dipertahankan bila relevan, dengan nilai nullable untuk unavailable.
Source details adalah sumber kebenaran untuk kualitas. `last_updated` compatibility
tetap waktu catatan air, bukan waktu observasi seluruh sumber. Status internal
lowercase; label UI Bahasa Indonesia. Consumer tidak boleh hanya menguji angka
non-null atau source name untuk menyatakan valid.

## 4. Deterministic status precedence

Urutan yang diimplementasikan:

1. **BAHAYA** jika salah satu sumber **VALID** melewati ambang bahaya.
2. **WASPADA** jika hujan **VALID** melewati ambang waspada.
3. **AMAN** hanya jika **kedua** sumber VALID dan semuanya di bawah ambang.
4. Tanpa sinyal valid di atas ambang: jika ada MISSING/INVALID/MOCK → **UNKNOWN**.
5. Jika kekurangan hanya berupa sumber STALE (sumber lain VALID-rendah atau STALE)
   → **STALE**.

MISSING/INVALID/MOCK mengungguli STALE ketika keduanya terjadi, tetapi individual
qualities/reasons tetap ditampilkan. Valid BAHAYA/WASPADA mengungguli kondisi gagal
sumber pendamping. `complete:false` menjelaskan keterbatasan penilaian tersebut.

AMAN berarti “indikator pada data ini belum melewati ambang”, bukan jaminan bebas
banjir. UNKNOWN dan STALE netral, tidak memakai green check/SAFE style. Mock tinggi
tidak menciptakan warning nyata; mock pendamping juga tidak menyembunyikan warning
tinggi dari sumber nyata yang valid.

## 5. Freshness policy — asumsi engineering provisional

Seluruh perbandingan data di server menggunakan UTC dan clock server. Nilai ini
**memerlukan konfirmasi operasional**, bukan aturan BMKG/Jasindo/pemerintah.

| Konfigurasi server-only | Default | Rentang yang diterima |
|---|---:|---:|
| `EWS_WEATHER_MAX_AGE_MINUTES` | 20 menit sejak retrieval asli | 1–60 menit |
| `EWS_WATER_MAX_AGE_MINUTES` | 60 menit sejak current-entry server stamp | 1–1440 menit |
| `EWS_CLOCK_SKEW_SECONDS` | 120 detik | 0–300 detik |

Unset menggunakan default. Nilai konfigurasi kosong/nonfinite/out-of-range
menjadikan policy invalid dan input tidak dipercaya, bukan memperpanjang umur
diam-diam. Nilai environment aktual tidak diubah pada fase ini.

- Cache cuaca maksimum **10 menit** dan tidak lebih dari weather max age; hanya
  genuine valid payload disimpan. Cache exact query coordinates, bounded 128 keys,
  inflight calls lokasi sama dideduplikasi. Cache/process rate budget belum shared.
- HTTP/provider retrieval timeout 8 detik; RPC client assessment timeout 20 detik.
- Forecast harus mencakup waktu server saat dinilai; expiry adalah minimum
  `valid_until` dan `retrieved_at + weather_max_age`.
- Timestamp tidak valid/tanpa offset ditolak. Observasi/catatan/retrieval yang
  material di masa depan (>clock skew) INVALID. Small clock skew tidak mengubah
  timestamp asal; test boundary tolerance tersedia.
- Air yang terlalu tua tetap STALE walaupun `retrieved_at` sekarang. Membuka
  dashboard/refresh tidak menulis ulang `updated_at`.
- Assembly assessment memeriksa expiry lagi setelah source lookups, sehingga
  melewati batas waktu saat menunggu DB tidak menghasilkan AMAN yang sudah expired.
- Browser menerima lease maksimum **60 detik**, dibatasi expiry sumber. Round-trip
  elapsed time dikurangkan secara konservatif. Monotonic elapsed/timer hanya dapat
  **membatalkan** status, bukan menyatakan data fresh. Fokus/visibility/reconnect/
  retry meminta penilaian server lagi; wall clock perangkat tidak dipakai untuk
  scientific freshness/risk calculation.
- Ketika offline/timeout/lease expired, previous assessment menjadi UNKNOWN/STALE
  dengan penjelasan historis, tidak tetap AMAN. Respons terlambat/account berbeda/
  mode simulasi sebelumnya tidak menimpa konteks aktif.

## 6. Semantik OpenWeather yang diimplementasikan

Existing endpoint `/data/2.5/forecast` tetap dipakai. `rain.3h` merupakan amount pada
slot tiga jam yang berakhir pada `list.dt`. Normalizer memilih satu interval
**`[dt−3 jam, dt)`** yang mencakup clock server, bukan observasi tiga jam lalu dan
bukan penjumlahan arbitrary rolling “tiga jam ke depan”. UI menampilkan periode
konkret serta sifat prakiraan.

Tidak ada fallback ke slot pertama ketika sum=0. Timeline kosong, timestamp
malformed/duplikat/reversed/overlapping, periode future-only dan rain malformed
fail-closed. Pada boundary tepat akhir interval, slot berikut yang relevan dipakai
jika ada; slot lama tidak dihitung ulang.

Pengecualian nol yang disengaja: dokumentasi OpenWeather menyatakan atribut
fenomena yang tidak terjadi dapat dihilangkan. Karena itu **rain omitted pada slot
OpenWeather yang valid** berarti dry slot 0. Ini tidak berlaku untuk sumber hilang,
empty timeline, `rain:null`, object rain kosong atau angka invalid. Pemeriksaan
structural memakai provider success code dan bounded timeline.

Precipitation harus finite 0–1000 mm/3h; ceiling adalah engineering plausibility
guard, bukan threshold bahaya. Air 0–10 m mengikuti batas input existing. Ancillary
temperature/humidity invalid tidak menjadi angka palsu; tidak menentukan risiko.

OWM issuance time tidak tersedia dari response yang dipakai: `issued_at:null` dan
keterbatasan ditampilkan. VALID forecast berarti interval current + retrieval
recent/structurally valid; **bukan** bukti waktu produksi model atau rainfall sensor
sawah. Dokumentasi semantik: <https://openweathermap.org/forecast5> (ditinjau pada
PHASE 2.0A).

Provider gagal dengan cache lama → STALE historis, timestamp retrieval asli tetap.
Tanpa data sebelumnya → MISSING/null. Raw upstream error/URL berisi API key tidak
dipublikasikan atau di-log oleh adapter. Responses EWS API memakai `no-store`.

## 7. Mock/demo separation

- Demo hanya jika **nonproduction** dan server flag `EWS_DEMO_ENABLED=true`, serta
  user memilih **Lihat Simulasi EWS** atau public weather request `?demo=1`.
- Normal request tanpa key/gagal provider tidak otomatis berubah menjadi mock,
  termasuk di development.
- Contoh: hujan 15 mm, suhu 28°C, humidity 78%, air 0,5 m. Semua sumber contoh
  diberi MOCK; primary UI **SIMULASI**, operational `status:unknown`.
- Scenario label hanya contoh di bawah ambang, tidak diberikan styling AMAN nyata.
  Cache live dan mock terpisah; kembali ke data nyata memuat assessment baru.
- Production menolak demo meskipun flag runtime sengaja true. Telah diperiksa
  melalui server Next production lokal, bukan production deployment.
- Seed lama dipertahankan sebagai evidence/history; tidak otomatis diberi marker
  current-reading atau dinyatakan sebagai pengukuran nyata.

## 8. Tinggi air, timestamps, dan audit binding

Temuan source sebelumnya dikonfirmasi: upsert tidak mengisi `updated_at` pada
update dan schema existing tidak mempunyai update trigger untuk itu.

Perbaikan kompatibel schema:

1. Existing hardened session + role **PPL/Dinas** diperiksa sebelum mutasi atau
   privileged audit access. User/actor/timestamp dari payload tidak dipercaya.
2. Form meminta konfirmasi explicit bahwa angka berasal dari pengukuran terkini,
   bukan data contoh/lama. Server memvalidasi literal true dan numeric bounds.
3. Upsert mengisi `updated_by` dari sesi dan `updated_at` dari server saat command
   diterima. Refresh/read tidak melakukan mutasi.
4. Existing `audit_logs` menyimpan action `update_water_level`, entity `water_levels`,
   row ID, actor dan metadata `ews-water-entry-v1`: current-reading declaration,
   district, exact value, canonical recorded timestamp.
5. Server read mencocokkan row dengan audit marker (actor/value/district/time).
   Recent legacy/seed/direct-REST values tanpa bukti cocok adalah INVALID; old
   timestamps tetap STALE. Sumber VALID menggunakan **declared current manual
   entry + server record time sebagai proxy**, bukan invented external observation.
   `observed_at` tetap null dan UI menjelaskan keterbatasannya.

Audit access server-only; client tidak memperoleh service credential atau akses
audit tambahan. Tidak ada policy/grant yang diperlonggar. Authenticated water API
menolak anonim dengan 401; tidak lagi mengandalkan query kosong saja.

**Batas atomicity:** upsert air dan audit insert adalah dua operasi existing-schema.
Jika audit gagal sesudah value tersimpan, respons menjelaskan partial persistence;
value tersebut **tidak** menjadi VALID tanpa bukti yang cocok. Retry harus berupa
pengukuran terkini eksplisit. Tidak mengklaim keduanya transaksi DB atomik.

Future migration terpisah, **REQUIRES_APPROVAL**: narrow transactional RPC dengan
DB clock + atomic audit, append-only observations, observed_at/recorded_at terpisah,
station/datum/source kind, dan migration/RLS/rollback tests di DB terisolasi. Tidak
ada migration atau production DB operation pada fase ini.

## 9. Frontend dan compatible assessment context

- Provider per mounted account, shared oleh hero, notification widget dan halaman
  notifikasi. Satu location snapshot per provider lifetime; tidak ada second EWS
  fetch memakai default context yang berbeda pada notification hook.
- Konteks memuat query coordinates/source (device/default/invalid), district air
  Poktan, mode live/simulation dan authenticated account. Respons akun salah atau
  obsolete in-flight response tidak boleh diadopsi.
- Hero/source cards menjelaskan label/icon, status kualitas, alasan, periode,
  waktu retrieval/pencatatan/penilaian **WIB** dan lokasi yang digunakan.
- UNKNOWN/STALE/error/loading netral; loading tidak memakai green SAFE skeleton.
  Retry, offline history, reconnect dan refresh tersedia. Existing scan CTA tetap.
- Source numeric formatting tidak membulatkan 19,999 mm menjadi 20 atau 1,199 m
  menjadi 1,20 di samping label AMAN.
- Warning valid tetap merah/kuning dan menjelaskan sumber pendamping tidak lengkap.
  Jika hanya satu source MOCK dan source nyata danger, warning nyata tidak diganti
  primary SIMULASI. Full simulation memakai kedua sources MOCK.
- EWS notices berasal dari assessment yang sama dan waktu `evaluated_at` server,
  diberi label “Penilaian server”. Missing/STALE menjadi notice sistem netral,
  bukan peringatan banjir terkonfirmasi. Report/sync notices existing dipertahankan.
- Form air mempunyai source-quality/history, error/retry/empty/loading, expiry dan
  reconnect handling; keberhasilan simpan bukan label bebas banjir.

Ini **belum per-field EWS**: cuaca snapshot GPS/default Karawang dan air district
Poktan tetap berbeda jenis cakupannya. UI menjelaskan hal ini, tidak memberi klaim
risiko presisi setiap bidang atau verified parcel context.

## 10. Actual verification

Toolchain lokal: Node **26.8.1**, Python **3.12.15**; release Node 24 dan container
Python 3.11 tidak dieksekusi. Fixtures adalah synthetic, bukan observasi lapangan.

| Check | Hasil aktual |
|---|---|
| `npm run test:security` | **110/110 PASS**, termasuk **54 EWS tests baru** dan 56 existing auth/report/offline/detector/review tests. |
| Python `unittest discover -s ai-service/tests -p 'test_*.py' -v` | **73/73 PASS**; real existing EfficientNet contract + synthetic detector/QA/export tests. Tidak mengukur akurasi. |
| `./node_modules/.bin/tsc --noEmit --incremental false` | **PASS** pada source final, dijalankan setelah build selesai. |
| `npm run build` dengan isolated placeholder env | **PASS**, Next.js 15.5.28, 25 static pages. Cookie-dependent dashboard/lahan `DYNAMIC_SERVER_USAGE` adalah expected diagnostics. |
| HTTP smoke pada built Next server loopback | **5/5 PASS**, server dihentikan sesudah tes. Rincian di bawah. |
| `git diff --check`, targeted new-file whitespace checks | **PASS**. |
| `git diff --exit-code -- PRD.md README.md ai-service/predict.py ai-service/model/model.onnx ai-service/model/model_v2.onnx ai-service/model/model_v2.metadata.json` | **PASS**, historical references dan classifier artifacts tersebut tidak berubah. |

Regression coverage: all-input sufficiency, 20/50/1,2 boundaries, missing/invalid/
stale/mock precedence, dangerous companion failure, timezone/clock skew/expiry,
dry slot vs missing, provider cache/context/inflight/failure, server auth/role/
timestamp/audit binding, single assessment, leases/offline/timeout/late-account-mode
responses, neutral static markup, source timestamp labels dan precision.

Focused unit tests memakai frozen `NOW=2026-11-17T04:00:00Z`, controlled OWM/DB
responses dan fake monotonic timers. UI diperiksa dengan real React static markup,
**bukan** Chrome/mobile end-to-end. Supabase/network boundary stub tidak membuktikan
deployed RLS atau real database transactions.

Perintah unit/type yang dapat dijalankan dari repo root:

```sh
node --import ./tests/register.mjs --test tests/ews.test.ts
npm run test:security
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

Python command yang dieksekusi memakai approved temporary directory:

```sh
TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v
```

Build command aktual (hanya environment proses, tidak menulis secrets/config file):

```sh
env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder AI_API_URL=http://127.0.0.1:1 OPENWEATHER_API_KEY= NEXT_PUBLIC_APP_URL=http://127.0.0.1:1 AUTH_PHONE_OTP_ENABLED=false EWS_DEMO_ENABLED=false npm run build
```

Type-check standalone dijalankan **setelah** build karena build meregenerasi
`.next/types`. Satu run paralel awal mendapat TS6053 akibat file generated sedang
diganti; run terurut final dan build type-check lulus tanpa perubahan tsconfig.

HTTP smoke memakai temporary helper `ews_http_smoke.py` di approved TMPDIR;
meluncurkan `next start` pada port loopback temporer dengan placeholder credentials,
API key kosong dan `NODE_ENV=production`. `EWS_DEMO_ENABLED=true` sengaja diberikan
pada proses uji untuk membuktikan hard production guard. Hasil:

1. `/api/weather` tanpa provider key → 200, MISSING, rainfall null, bukan mock.
2. `/api/weather?demo=1` → INVALID/DEMO_DISABLED walaupun flag true.
3. Koordinat invalid → 400/INVALID, tidak silent-default.
4. Koordinat `(0,0)` tetap dipertahankan, tidak dianggap missing/default.
5. Anonymous `/api/water-levels` → 401.

Tidak menjalankan provider live, login SMS/akun produksi, mutasi Supabase nyata,
SQL suite/migration, browser UI automation, model training atau deploy.

## 11. Known limitations dan remaining readiness gates

- Freshness windows, current-entry proxy dan risk thresholds perlu konfirmasi
  operasional/hidrologi lokal. VALID tidak menyatakan stasiun terkalibrasi, petugas
  pasti benar, atau kondisi sawah bebas banjir.
- Waktu produksi OWM dan timestamp pengukuran air terpisah belum tersedia. Source
  validity/retrieval dan attested current-entry adalah batas evidence yang ada.
- Legacy/seed tanpa marker dapat menyebabkan UNKNOWN sampai petugas benar-benar
  mengirim pengukuran baru; tidak ada automatic backfill/approval.
- Water+audit belum atomik; direct DB updates tidak mendapat trust marker otomatis.
  Atomic RPC/station/observation-history membutuhkan desain/migrasi approved.
- Cache/inflight dedup masih per instance, bukan distributed rate limiting;
  provider reliability, quotas dan resource load production belum diuji.
- Location tetap GPS snapshot/default dan Poktan district; tidak ada parcel selector,
  station/catchment mapping, BMKG adapter atau flood-event confirmation.
- Satu provider per mounted app context; tab/perangkat berbeda tidak berbagi
  snapshot realtime. Browser background/sleep/mobile reconnect dan actual visual
  layout perlu real-device verification. Tidak ada offline persistence baru EWS.
- Database RLS/grants/native OTP integration gates PHASE 0A/0A.1 tetap berlaku.
  Local Node 26 tests bukan bukti release Node 24 atau production deploy.

## 12. Completion dan next milestone

**PHASE 2.0B selesai sebagai local implementation + deterministic regression + build.**
**GO** untuk review kode lokal; **CONDITIONAL GO** untuk uji browser dan isolated
staging setelah environment/authorization tersedia. Tidak ada izin deploy tersirat.

Milestone berikut yang direkomendasikan sesuai roadmap: **PHASE 2.0C — Advisory AI
dan Rekap yang Jujur**: tampilkan REVIEW_REQUIRED pada output uncalibrated,
hindari penyajian legacy damage_pct sebagai crop loss faktual, dan pisahkan luas
terdaftar dari luas terdampak terukur tanpa menggandakan hektar per laporan.
EfficientNet/receipt/YOLO default OFF tetap dipertahankan. Full multi-field EWS
menunggu geometry/admin/station prerequisites pada milestone selanjutnya.
