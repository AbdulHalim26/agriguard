# PHASE 2.0R — BMKG Location-Aware Weather & Truthful EWS (Local Implementation)

**Tanggal:** 26 November 2026
**Status:** **`GO — IMPLEMENTED & VERIFIED LOCALLY (NOT DEPLOYED, NOT PUSHED, SUPABASE & PRODUCTION UNTOUCHED)`**

---

## 1. Audit Sistem Cuaca & EWS Existing (B1)

- Sebelumnya, `/api/weather` (`lib/ews/weather.ts`) hanya mendukung OpenWeatherMap (memerlukan `OPENWEATHER_API_KEY`, fallback `MISSING`), dengan default koordinat statis Karawang (`-6.31, 107.29`) jika koordinat perangkat tidak tersedia.
- `FloodStatusPanel.tsx` menampilkan kartu `Laporan tinggi air` pada tampilan utama petani meskipun tidak ada data sensor hidrologi terverifikasi.
- Mesin penilaian risiko banjir (`lib/ews/assessment.ts`, `lib/ews/water-server.ts`, `app/(app)/verifikasi/water-actions.ts`) tetap dipertahankan 100% agar tidak merusak data historis, fitur PPL/Dinas, maupun seluruh regresi EWS existing.

---

## 2. Integrasi Resmi BMKG & Verifikasi Live Read-Only (B2 & B4)

### 2.1 Uji Live Read-Only ke Endpoint Resmi BMKG (26 Nov 2026, ~22:09 WIB)
*(Dibedakan tegas dari mock unit tests di bawah.)*

| Endpoint Resmi BMKG | HTTP | Data Aktual yang Diterima |
|---|---:|---|
| `GET https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001` | `200` | `Kemayoran, Jakarta Pusat`: `t=26°C`, `hu=90%`, `weather_desc="Berawan"`, `ws=2.1`, `wd="E"`, `utc_datetime="2026-11-26 15:00:00"`, `local_datetime="2026-11-26 22:00:00"`, `analysis_date="2026-11-26T12:00:00"` |
| `GET https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.15.01.1001` | `200` | `Karawang Kulon, Karawang Barat`: `t=26°C`, `hu=95%`, `weather_desc="Berawan"`, `ws=1.2`, `wd="S"`, `utc_datetime="2026-11-26 16:00:00"`, `local_datetime="2026-11-26 23:00:00"`, `analysis_date="2026-11-26T12:00:00"` |
| `GET https://www.bmkg.go.id/alerts/nowcast/id` (CAP RSS) | `200` | `23.784` bytes RSS XML peringatan dini cuaca aktif BMKG |

- **Prinsip Kejujuran Data:**
  - Label eksplisit: `Prakiraan Cuaca BMKG`, `Suhu prakiraan`, `Periode prakiraan` (WIB), `Terakhir diperbarui` (WIB), `Sumber: BMKG`.
  - **Tidak pernah menampilkan curah hujan `mm/3 jam` buatan** karena endpoint prakiraan publik BMKG tidak menyediakan nilai tersebut.
  - **Peringatan dini cuaca CAP (`parseBmkgCapRss`):** hanya dicocokkan ke nama wilayah (`kecamatan`/`kotkab`) terverifikasi pengguna dan selalu disertai catatan *"Peringatan dini cuaca BMKG — bukan kepastian banjir di bidang sawah"*.

---

## 3. Validitas Pemetaan Lokasi ke `adm4` & Keterbatasan Jujur (B3)

- **Prioritas Resolusi Lokasi (`resolveLocationToAdm4` di [lib/ews/bmkg.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/ews/bmkg.ts)):**
  1. **Lokasi perangkat (`device`):** hanya dipetakan bila koordinat berada di dalam radius terverifikasi entri `VERIFIED_ADM4_REGISTRY` (bukan menebak koordinat acak).
  2. **Lokasi lahan terdaftar (`registered_lahan`):** dicocokkan dari `poktan.village` / `poktan.district` atau centroid poligon lahan milik pengguna yang diautentikasi via RLS (tidak pernah dianggap sebagai lokasi GPS aktif perangkat).
  3. **Fallback jujur (`LOKASI_BELUM_DIVERIFIKASI`):** jika lokasi berada di luar wilayah terverifikasi (mis. pengguna di luar cakupan registry `adm4`), status tetap `LOKASI_BELUM_DIVERIFIKASI` — **tidak pernah mengalihkan seluruh pengguna ke Karawang**.
- **Keterbatasan Pemetaan `adm4` Saat Ini:**
  - `VERIFIED_ADM4_REGISTRY` saat ini berisi 8 titik wilayah terverifikasi terhadap `api.bmkg.go.id` (Karawang Barat, Karawang Timur, Telukjambe Timur, Rengasdengklok, Cianjur, Subang, Indramayu, Jakarta Pusat).
  - Untuk cakupan nasional 83.000+ desa/kelurahan Indonesia secara presisi, fase pasca-kompetisi memerlukan integrasi dataset poligon batas administrasi resmi BIG/Kemendagri/BPS `adm4` (tanpa menebak dari lat/lon mentah).

---

## 4. Keandalan, Keamanan & Revisi Tampilan Petani (B5 & B6)

- **Server-side & Keamanan ([app/api/weather/bmkg/route.ts](file:///Users/macbook/Documents/Personal/agriguard/app/api/weather/bmkg/route.ts)):**
  - Wajib sesi autentikasi (`401` bila anonim), membaca profil/Poktan/lahan hanya lewat RLS klien user (tanpa `service_role`, tanpa kebocoran data lintas pengguna).
  - Validasi ketat Zod, `AbortSignal.timeout(8000)`, `redirect: 'error'`, in-flight deduplication, cache TTL `30 menit` (`BMKG_CACHE_TTL_MS`), batas stale `3 jam` (`BMKG_MAX_STALE_MS`), dan sliding-window rate limit **60 req/menit/IP** sesuai ketentuan BMKG.
  - Penanganan `429`, `5xx`, dan timeout: fallback ke cache bertanda eksplisit **`Data Lama (STALE)`** atau **`DATA_TIDAK_TERSEDIA`**.
- **Revisi Tampilan Utama Petani ([components/features/BmkgWeatherCard.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/BmkgWeatherCard.tsx), [DashboardContent.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/dashboard/DashboardContent.tsx), [FloodStatusPanel.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/FloodStatusPanel.tsx)):**
  - Kartu utama petani menampilkan urutan prioritas: lokasi & sumber lokasi → suhu prakiraan (°C) & kondisi cuaca → kelembapan & angin → periode & waktu update WIB (`Sumber: BMKG`) → peringatan dini CAP aktif (jika valid) → tombol cepat ke `/scan` & `/laporan`.
  - Panel risiko banjir dipisahkan secara konseptual & visual di bawahnya dengan `hideUnsupportedHydrology={true}` pada dashboard petani (menyembunyikan kartu angka tinggi air yang belum didukung data nyata, sembari tetap mempertahankan status jujur `BELUM DIKETAHUI` dan seluruh fitur PPL/Dinas utuh).

---

## 5. Daftar File Baru / Diubah (Lokal — Belum Di-push / Belum Di-deploy)

- [lib/ews/bmkg.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/ews/bmkg.ts) — Client/parser BMKG, `VERIFIED_ADM4_REGISTRY`, `resolveLocationToAdm4`, `parseBmkgCapRss`, `createBmkgService` (caching + 60 req/min rate limit + stale/error fallback).
- [lib/ews/bmkg-server.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/ews/bmkg-server.ts) — Server-only singleton instance.
- [app/api/weather/bmkg/route.ts](file:///Users/macbook/Documents/Personal/agriguard/app/api/weather/bmkg/route.ts) — Endpoint authenticated server-side `/api/weather/bmkg`.
- [components/features/BmkgWeatherCard.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/BmkgWeatherCard.tsx) — Kartu prakiraan cuaca resmi BMKG responsif desktop/mobile.
- [components/features/FloodStatusPanel.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/FloodStatusPanel.tsx), [app/(app)/dashboard/DashboardHero.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/dashboard/DashboardHero.tsx), [app/(app)/dashboard/DashboardContent.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/dashboard/DashboardContent.tsx) — Pemisahan cuaca vs risiko banjir & penyembunyian angka hidrologi tanpa data nyata pada dashboard petani.
- [tests/bmkg-weather-ews.test.ts](file:///Users/macbook/Documents/Personal/agriguard/tests/bmkg-weather-ews.test.ts) — 7 unit & regression tests mencakup seluruh 12 skenario B7.

---

## 6. Hasil Pengujian & Batas Eksekusi (B7 & B8)

- `npm run test:security`: **292/292 PASS** (285 existing + 7 baru di `tests/bmkg-weather-ews.test.ts`).
- `tsc --noEmit --incremental false`: **PASS** (`0` error).
- `git diff --check`: **PASS**.
- `npm run build`: **PASS** (`26/26` routes termasuk `/api/weather/bmkg`).
- **Batas Eksekusi B8 Terpenuhi:** Perubahan 2.0R hanya berada secara lokal di working tree (belum di-commit, belum di-push, belum di-deploy ke Vercel/Render, Supabase & Production 100% tidak disentuh).
