# PHASE 2.0A — EWS hiper-lokal per bidang pertanian

Tanggal: **16 November 2026**. Status: **PROPOSED**, provider OpenWeather existing
dipertahankan. BMKG belum diintegrasikan dan operasi provider live **UNVERIFIED**.

## 1. Audit data flow EXISTING

```text
DashboardHero → requestLocation() telepon / pusat Karawang
  → getFloodStatus(coords)
      → /api/weather → OpenWeather /data/2.5/forecast
          → Map cache 10 menit, koordinat key 2 desimal
          → tanpa key/error: mock 15 mm, 28°C, humidity 78%
      → profiles.poktan_id → poktan.district → water_levels terbaru
      → calculateFloodStatus(rain3h, waterLevel)
```

Source: `app/api/weather/route.ts`, `dashboard/{DashboardHero,flood-actions}.tsx/.ts`,
`lib/thresholds.ts`, `lib/notifications.ts`, `verifikasi/water-actions.ts`.

Temuan yang memerlukan perubahan pada fase coding terpisah:

- Tidak ada `parcel_id` pada input/output EWS atau pilihan multi-bidang.
- Weather memakai **forecast** future slots, bukan observed rain 3 jam sebelumnya.
  Label UI “Curah Hujan 3 Jam” belum menjelaskan periode/sifat prakiraan.
- Penjumlahan slot memakai jendela `now−30m…now+3h`; bila sum=0 beralih ke slot
  pertama. Nol tidak dapat dibedakan dari window kosong secara jujur, dan slot
  pertama tidak selalu periode yang relevan. Source forecast timestamps tidak
  diteruskan ke UI.
- Cache Map per proses bukan shared cache/rate budget. Key 0,01° dapat melayani
  beberapa bidang tetapi request/output location perlu tetap terikat field yang
  diminta, bukan menyajikan posisi cached caller sebagai posisi field baru.
- Air manual per district **Poktan pengguna**, bukan catchment/station atau district
  parcel. Record menyimpan satu nilai per district, bukan sejarah observasi.
- Upsert air tidak mengisi ulang `updated_at`; tidak ditemukan update trigger di
  migrasi. `last_updated` EWS hanya berasal dari record air, bukan seluruh sumber.
- Tidak ada data-age/forecast validity checks atau validation finite di risk helper.
- Semua input null → `status:'aman'`, hijau/check; mock rendah juga masuk kalkulasi
  AMAN. Label simulasi UI tidak mengatasi semantik hasil tersebut.
- Notifikasi memanggil `getFloodStatus()` tanpa GPS → default Karawang; timestamp
  warning dibuat saat render, bukan waktu sumber. Hero dan notifikasi dapat berbeda.

Ambang existing: hujan ≥20 mm waspada, ≥50 mm atau air ≥1,2 m bahaya. Ini konstanta
aplikasi/prototipe; belum ada validasi hidrologi lokal atau definisi datum stasiun
yang membuktikannya universal. Jangan menyebutnya model prediksi banjir terkalibrasi.

## 2. Makna sinyal yang wajib terpisah

| Jenis | Contoh | Bukan |
|---|---|---|
| `OBSERVATION` | Pengukuran air dengan lokasi/datum dan waktu observasi, curah hujan terukur bila ada. | Forecast atau nilai mock. |
| `FORECAST` | Prakiraan cuaca desa atau grid untuk valid interval masa depan. | Pengukuran presisi pada setiap petak sawah. |
| `OFFICIAL_WEATHER_WARNING` | CAP BMKG aktif untuk wilayah/waktu terkait. | Kejadian banjir terkonfirmasi atau kerugian tanaman. |
| `FLOOD_RISK_INDICATOR` | Aturan terkonfigurasi atas data valid/relevan. | Kepastian lahan akan banjir atau diagnosis sebab kerusakan. |
| `CONFIRMED_FLOOD_EVENT` | Bukti/konfirmasi petugas/otoritas dengan lokasi dan event time. | Hasil threshold hujan atau AI penyakit. |

## 3. Desain per-field PROPOSED

```text
Authenticated farmer / assigned officer
  → pilih satu/semua bidang yang boleh dibaca
  → server resolve parcel_id + geometry_version + validation status
  → representative point + geometry/admin-region/station mapping
  → weather adapters (OpenWeather; BMKG forecast/CAP setelah approval)
  → normalize timestamps/units/spatial scope + freshness/quality
  → versioned indicator rules
  → per-field result/cards + notifications pada konteks field yang sama
```

- Query berdasarkan field ID; server mengambil geometri, bukan mempercayai lat/lon
  override dari telepon. GPS perangkat dipakai capture evidence/locate map terpisah.
- True centroid dengan method/CRS tercatat; bila centroid di luar polygon concave,
  pilih validated point-on-surface/interior point. Jangan menyebut rata-rata vertex
  sebagai centroid akurat. Jika boundary invalid/unknown, EWS field unavailable
  atau informational regional forecast dengan keterbatasan eksplisit.
- EWS boleh membantu bidang terdaftar yang haknya masih pending **bila geometry
  formally valid dan akses diizinkan**; tidak memberi badge verified ownership.
  Safety information tidak perlu menunggu otorisasi klaim.
- Admin assignment versioned dari boundary dataset authoritative; desa/kecamatan
  bidang dapat berbeda dari tempat tinggal/Poktan. Lintas region memakai footprint
  intersection dan source coverage, tidak selalu satu centroid.
- BMKG CAP area diperiksa terhadap seluruh geometry bila tersedia; forecast desa
  diberi cakupan administratif. Multiple fields dapat berbagi source data/cache,
  tetapi ID/geometry/rule/output freshness tetap field-specific.
- Water relevance: station/catchment/irrigation reach, datum meter, observed_at,
  observer, instrument/manual source dan applicable parcel mapping. Air satu
  kecamatan tidak otomatis mewakili ketinggian genangan semua bidang.

Contoh acceptance, bukan data cuaca nyata: petani berada di Karawang Barat dan
mempunyai bidang Timur+Barat; mengubah GPS telepon tidak mengubah weather query
atau risk state bidang Timur. Dua bidang dapat mempunyai status berbeda.

## 4. Kontrak konseptual baru (belum endpoint/schema)

Field result wajib memuat:

| Kelompok | Data |
|---|---|
| Context | `parcel_id`, geometry version/hash, field name, representative point/method, region IDs/dataset version, geometry validation status. |
| Source | Provider, product, reference/record ID, spatial scope/coverage, units dan semantics; bukan sekadar `source:'real'`. |
| Waktu | `observed_at` atau `issued_at` jika memang tersedia, `valid_from/valid_until` untuk forecast/warning, `fetched_at`, evaluated_at. Unknown tetap null. |
| Kualitas | Per-source freshness, age, missing/invalid reasons, fallback/source switch, station relevance/uncertainty. |
| Kalkulasi | `rule_version`, applicable thresholds/units/windows, exact contributing source records, limitations. |
| Hasil | `risk_state: UNKNOWN/STALE/AMAN/WASPADA/BAHAYA`, `data_status: FRESH/PARTIAL/STALE/UNAVAILABLE`, active official warning list, not confirmed flood. |

`fetched_at` tidak menggantikan observed/issued time. Cache umur 2 menit dapat
berisi pengamatan berumur 2 hari. Waktu disimpan UTC dengan offset; UI Karawang
menampilkan **WIB / Asia/Jakarta** secara eksplisit, bukan timezone browser bebas.

### Freshness/risk decision table

| Data yang tersedia | Perilaku yang wajib |
|---|---|
| Semua missing, malformed, NaN, mock, salah region atau invalid interval | UNKNOWN / UNAVAILABLE; bukan AMAN. |
| Hanya data expired/terlalu tua | STALE dengan last known timestamp; tidak direpaint sebagai risk aktual atau AMAN. |
| Partial fresh, belum memenuhi minimum input set untuk menyatakan low risk | UNKNOWN / PARTIAL; jelaskan yang hilang. |
| Fresh authoritative positive signal yang memenuhi aturan approved walau input lain hilang | Pertahankan indikator WASPADA/BAHAYA yang didukung + PARTIAL/reason; jangan menurunkan karena missing lain. Warning cuaca tetap diberi makna cuaca. |
| Semua minimum required inputs fresh/relevant, di bawah ambang approved | AMAN berarti “belum ada indikator melewati ambang pada data ini”, bukan jaminan bebas banjir. |
| Tidak ada CAP aktif pada feed fresh | Hanya “tidak ditemukan peringatan aktif pada feed ini”; bukan bukti aman dari banjir. |

TTL/minimum input set/threshold numeric adalah **REQUIRES_APPROVAL** per provider/
product/station. Usulan operasional: cache retrieval tetap 10 menit untuk OWM,
tetapi source validity dan max-age diatur terpisah. Forecast BMKG dua kali sehari
tidak boleh ditandai stale memakai TTL observasi 10 menit. Interval CAP menggunakan
effective/expiry dan pembatalan/update; jangan perpanjang expiry ketika di-fetch.

Mock hanya untuk nonproduction demo eksplisit dengan state DEMO di presentation,
tidak memberi operational AMAN/WASPADA/BAHAYA. Offline terakhir tampil read-only
dengan waktu dan stale status; tidak diam-diam menjadi keadaan saat ini.

## 5. Evaluasi sumber cuaca resmi

Dokumentasi publik dibaca melalui HTTP pada **16 November 2026**; tidak memakai key
atau memanggil live weather API, dan tidak membuktikan SLA/coverage lapangan.

| Provider/product | Fakta dokumentasi resmi | Rekomendasi / batas |
|---|---|---|
| [BMKG prakiraan cuaca](https://data.bmkg.go.id/prakiraan-cuaca/) | JSON 3 hari, per 3 jam, update 2× sehari; query `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={kode}`. Kode desa/kelurahan tingkat IV merujuk Kemendagri 2022 pada halaman. Limit 60 request/menit/IP; atribusi BMKG wajib. | **PROPOSED preferred official Indonesian forecast**, setelah field→adm4 mapping, legal usage dan schema/live reliability diperiksa. Bukan observasi titik field. |
| [BMKG peringatan dini](https://data.bmkg.go.id/peringatan-dini-cuaca/) | RSS XML daftar provinsi aktif `https://www.bmkg.go.id/alerts/nowcast/id`; detail CAP XML, effective/expiry dan area sampai kecamatan/polygon. Limit 60/menit/IP, atribusi BMKG wajib. | Complementary official weather-warning layer. Parse area, identity/update/cancel dan validity; bukan pengganti otomatis water levels atau confirmed flood feed. |
| [OpenWeather 5-day/3-hour](https://openweathermap.org/forecast5) | Forecast per 3 jam berdasarkan lat/lon; `list.dt` forecast time dan `rain.3h` amount pada slot, bukan sensor sawah. | Existing provider dipertahankan; perbaiki slot semantics, attribution/timestamps/freshness dan genuine fallback. Tidak diganti hanya karena ada kandidat lain. |
| Water-level records PPL/Dinas | Input existing per district; station/datum/observed time/history belum ada. | Perlu observasi/mapping yang diverifikasi. Integrasi BPBD/BBWS/IoT belum tersedia; jangan mengklaim ada. |

BMKG documented keys meliputi `utc_datetime`, `local_datetime`, `analysis_date`,
temperature/humidity/weather description/wind. **Jangan** mengubah deskripsi
“hujan lebat” menjadi angka mm atau memakai OWM mm threshold untuk kode kondisi.
Jika atribut presipitasi numerik ditemukan kelak, units/period/schema harus
diverifikasi dahulu; tanpa itu rain amount tetap unavailable.

Public access dan attribution instruction bukan bukti semua jenis commercial
redistribution, long-term archive atau SLA dijamin. Konfirmasi terms yang applicable
dan simpan rujukan/tanggal sebelum produksi. API sample Kemayoran bukan data
Karawang; jangan menebak kode desa field.

## 6. Provider adapter, cache dan keamanan

- Adapter per product mengeluarkan kontrak normalized yang typed/validated;
  missing precipitation jangan otomatis 0 kecuali schema/provider mendefinisikannya
  demikian pada slot valid. Bedakan dry slot 0 dari empty/malformed timeline.
- Normalize forecast interval sesuai semantics provider; pilih contiguous relevant
  windows tanpa double count atau fallback ke slot arbitrer. Catat partial
  interval, jangan menyajikan akumulasi slot sebagai exact next-3h observation.
- Cache key: provider+product+canonical location/admin code+period+schema version;
  jangan menyebut rounding koordinat sebagai resolusi provider yang sebenarnya.
  Field-specific result key juga mengikat geometry version/rule version.
- Dedupe inflight requests, bounded cache, timeout/backoff/rate budget per egress
  IP sesuai provider. Multi-instance Map bukan shared rate limiter; pilih DB/cache
  existing stack hanya setelah pengukuran dan schema approval, bukan framework baru.
- Failure → explicit unavailable atau stale last-valid dengan source/timestamp;
  fallback OWM↔BMKG terlihat, tidak merge angka beda semantics diam-diam.
- CAP parser tanpa external entities/network expansion, payload size/time limits,
  allowlisted host/path dan safe redirects untuk linked CAP. CAP polygon memakai
  konvensi coordinate order yang harus dikonversi/test eksplisit terhadap GeoJSON;
  jangan auto menerima arbitrary URL dari user atau feed.
- Authorized field lookup/RLS tetap berlaku, metadata ownership privat. Weather
  API key server-only; raw secrets tidak masuk response/log.
- Notifikasi memakai field context dan source warning ID+version+valid interval,
  bukan `Date.now()` sebagai waktu observasi. Update/cancel/expired tidak mengirim
  duplicate active warning atau false-safe notification.

## 7. Rencana implementasi bertahap dan acceptance criteria

Slice pertama kecil: truthful unavailable/stale/mock handling pada existing OWM
flow. Berikutnya field selection/geometry lookup dan region/station mapping,
kemudian adapter BMKG setelah prerequisites. Tidak menjalankan perubahan tersebut
pada PHASE 2.0A; lihat [roadmap](PHASE-2.0A-09-ROADMAP.md).

- **EWS-AC1**: field Timur/Barat milik user mempunyai field IDs/results sendiri;
  berpindah GPS telepon tidak mengganti field source/query. Unauthorized field
  tidak dapat dibaca lewat API/ID enumeration.
- **EWS-AC2**: mock, invalid, missing, stale dan out-of-window tidak pernah
  menghasilkan operational AMAN; nilai 0 valid tidak dianggap missing.
- **EWS-AC3**: UI Bahasa Indonesia membedakan observasi, prakiraan periode, weather
  warning, risk indicator dan confirmed event; timestamps WIB/provider/coverage ada.
- **EWS-AC4**: forecast desa/gridded diberi spatial limitation; water station
  relevance/datum tidak diasumsikan dari Poktan. Unknown mapping eksplisit.
- **EWS-AC5**: TTL/source validity/caching/window boundary/partial inputs/expired
  CAP/update/cancel/retry/429 diuji dengan frozen clock dan recorded/synthetic
  fixtures; genuine provider outage tidak digantikan data simulasi operasional.
- **EWS-AC6**: BMKG atribusi/limit/admin version dan legal applicability terdokumentasi;
  live provider dan field reliability hanya dinyatakan verified setelah uji terotorisasi.
- **EWS-AC7**: existing auth, laporan offline, maps dan OWM provider tetap kompatibel;
  source transitions/recovery tidak menimpa raw water/audit/history.
