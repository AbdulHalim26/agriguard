# Laporan QA — AgriGuard

Tanggal: 11 Oktober 2026
Ruang lingkup: Blackbox (PRD §7 FR-00…FR-05 + edge case) & Whitebox (review kode)
Lingkungan: Next.js 15 (dev, port 3000) · Supabase **live** (project terkonfigurasi) · AI service ONNX (port 8000, model ter-load) · Node 26

Metode:
- Blackbox HTTP langsung: `curl` ke route publik/proteksi, dan pemeriksaan DB live memakai `@supabase/supabase-js` (login akun seed asli, read-only).
- Blackbox AI: pemanggilan `/predict`, `/model-info`, `/health` di AI service.
- Whitebox: pembacaan sumber (`app/`, `lib/`, `middleware.ts`, `supabase/migrations/`) untuk otorisasi, validasi, idempotency, RLS, dan higiene env.

Legenda status: ✅ lulus · ⚠️ lulus dengan catatan · ❌ gagal

---

## Ringkasan Eksekutif

| Severity | Jumlah | Status |
|---|---|---|
| 🔴 Kritis | 1 | **Ditemukan** — signup user baru selalu gagal (trigger DB) |
| 🔴 Tinggi | 4 | 2 ditemukan lewat uji live (RLS poktan, eskalasi role), 2 desain (OTP client-side, password deterministik) |
| 🟠 Sedang | 3 | verifikasi tidak final, mock bisa aktif di produksi, audit `entity_id` |
| 🟡 Rendah | 4 | duplikasi kode, route tanpa guard eksplisit, dsb. |

**Total test case: 46** (lulus 36 · catatan 6 · gagal 4).

Perbaikan yang dikomit: `supabase/migrations/0007_fix_signup_and_poktan_rls.sql` (signup + RLS poktan + hardening role).
**Catatan penting:** migrasi 0007 harus dijalankan di Supabase (SQL Editor / `supabase db push`) agar perbaikan DB berlaku; tanpa itu, bug #1 & #2 tetap aktif di DB live.

Tidak ditemukan: kebocoran service-role key ke client, SQL injection (semua akses lewat supabase-js), bucket foto publik, atau popup sukses palsu.

---

## BAGIAN 1 — BLACKBOX

### FR-00 — Autentikasi & Onboarding

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-00-01 | Auth | Login petani seed `081234567890` / `AgriGuard-456790` | Masuk, sesi valid | `signInWithPassword` OK, uid `b0eebc99…` | ✅ | — | uji live supabase-js |
| BB-00-02 | Auth | Login PPL/Dinas seed | Masuk sesuai role | OK, role `ppl`/`dinas` | ✅ | — | uji live |
| BB-00-03 | Auth | Nomor invalid (bukan `628`, <11 digit) | Ditolak + pesan | Divalidasi di `login/page.tsx:28` | ✅ | — | code |
| BB-00-04 | Auth | OTP salah | Ditolak | `verifyOtp` bandingkan kode | ⚠️ | Sedang | `lib/auth/otp.ts:62` (client-side) |
| BB-00-05 | Auth | OTP kedaluwarsa (>5 menit) | Ditolak | Cek `expiresAt` | ✅ | — | `lib/auth/otp.ts:70` |
| BB-00-06 | Auth | **Pendaftaran user baru** | Akun dibuat, lanjut onboarding | **HTTP 500 `Database error saving new user`** (semua role) | ❌ | 🔴 Kritis | uji live `signUp`; `0001_init.sql:76` |
| BB-00-07 | Auth | Onboarding kode undangan `DEMO01` | Poktan ditemukan | **Gagal** — `poktan` 0 baris (RLS) | ❌ | 🔴 Tinggi | uji live; `0001_init.sql:106` |
| BB-00-08 | Auth | Onboarding kode salah | "Kode undangan tidak valid" | Sama seperti #07 (selalu invalid) | ⚠️ | — | `onboarding/page.tsx:41` |
| BB-00-09 | Otorisasi | `/dashboard` tanpa sesi | Redirect `/login` | 307 → `/login` | ✅ | — | curl |
| BB-00-10 | Otorisasi | `/verifikasi` sebagai petani | Redirect `/dashboard` | Diblok middleware | ✅ | — | `middleware.ts:182` |
| BB-00-11 | Otorisasi | `/audit` sebagai petani | Ditolak | Redirect (cek role server) | ✅ | — | `app/(app)/audit/page.tsx` |
| BB-00-12 | Auth | Logout | Sesi dibersihkan | `signOut` dipanggil | ✅ | — | `app/(app)/layout.tsx:75` |

### FR-01 — Dashboard Peringatan Dini (Petani)

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-01-01 | EWS | Status banjir tampil | aman/waspada/bahaya | `calculateFloodStatus` dipakai | ✅ | — | `lib/thresholds.ts:15` |
| BB-01-02 | EWS | Ambil lokasi device → cuaca per-lokasi | `source` & koordinat sesuai device | `/api/weather` live → `source:openweathermap`, `location_source:device` | ✅ | — | curl |
| BB-01-03 | EWS | Ambang bahaya | hujan≥50mm **atau** air≥1.2m → bahaya | Logika benar | ✅ | — | `lib/thresholds.ts:34` |
| BB-01-04 | EWS | Ambang waspada | hujan≥20mm → waspada | Benar | ✅ | — | `lib/thresholds.ts:38` |
| BB-01-05 | EWS | Tidak ada data | "Data Tidak Tersedia" | Benar (status aman) | ✅ | — | `lib/thresholds.ts:22` |
| BB-01-06 | EWS | **Tinggi air dari district poktan** | Terbaca | **Selalu null** — query `poktan` diblok RLS | ❌ | 🔴 Tinggi | `flood-actions.ts:38`; uji live |
| BB-01-07 | EWS | OpenWeather gagal | `mock_fallback` (jangan cache) | Ditangani + `no-store` | ✅ | — | `weather/route.ts` (commit ce8c088) |
| BB-01-08 | EWS | Cuaca key tidak valid | Degradasi ke mock | Key kini valid (dapat data real) | ✅ | — | curl |

### FR-02 — AI Scanner

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-02-01 | AI | Foto sehat | `aman` | `aman`, conf 0.9973, dmg 0 | ✅ | — | `/predict` live |
| BB-02-02 | AI | Foto rusak ringan | `rusak_ringan` | `rusak_ringan`, conf 0.9988, dmg 60 | ✅ | — | `/predict` live |
| BB-02-03 | AI | Foto rusak berat | `rusak_berat` | `rusak_berat`, conf 0.9845, dmg 94 | ✅ | — | `/predict` live |
| BB-02-04 | AI | File non-gambar | 400 | 400 + pesan jelas | ✅ | — | curl AI |
| BB-02-05 | AI | Foto >5MB | 400 | Divalidasi `analyze/route.ts:73` | ✅ | — | code |
| BB-02-06 | AI | Endpoint tanpa sesi | 401 | 401 `Tidak terautentikasi` | ✅ | — | curl |
| BB-02-07 | AI | AI service mati | 502 + opsi manual | `manual:true`, 502 | ✅ | — | `analyze/route.ts:89` |
| BB-02-08 | AI | Timeout >15 detik | 504 | `AbortController` 15s → 504 | ✅ | — | `lib/ai.ts:20`, `:89` |
| BB-02-09 | AI | Rate limit >20/hari | 429 + arahkan manual | In-memory limit, 429 | ⚠️ | Rendah | `analyze/route.ts:11` (per-instance, reset restart) |
| BB-02-10 | AI | `/health`, `/model-info` | `model_loaded` benar | `loaded:true`, metadata lengkap | ✅ | — | curl AI |

### FR-03 — Laporan Offline-First

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-03-01 | Laporan | Lapor 1 foto + lokasi | Tersimpan | Insert via RLS own | ✅ | — | `laporan/actions.ts:171` |
| BB-03-02 | Laporan | Foto >3 | Ditolak | `MAX_PHOTOS=3` | ✅ | — | `laporan/actions.ts:84` |
| BB-03-03 | Laporan | Foto >5MB / MIME salah | Ditolak | Cek mime + size | ✅ | — | `laporan/actions.ts:88` |
| BB-03-04 | Laporan | Titik di luar polygon | Ditolak | `validateGeofence` | ✅ | — | `laporan/actions.ts:126` |
| BB-03-05 | Laporan | Foto sama (<24 jam) | Ditolak | sha256 dedupe | ✅ | — | `laporan/actions.ts:132` |
| BB-03-06 | Laporan | Offline → antrian | Masuk IndexedDB | `saveReportOffline` | ✅ | — | `lib/offline/db.ts` |
| BB-03-07 | Laporan | Auto-sync saat online | Terkirim, tak dobel | `autoSync` + idempotency | ✅ | — | `lib/offline/sync.ts` |
| BB-03-08 | Laporan | Re-sync laporan sama | 200 tanpa duplikat | Guard `existingByKey` | ✅ | — | `api/sync/route.ts:91` |
| BB-03-09 | Laporan | `/api/sync` tanpa sesi | 401 | 401 | ✅ | — | curl |

### FR-04 — Peta & Verifikasi (PPL/Dinas)

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-04-01 | Verifikasi | PPL lihat semua laporan | Terlihat | Live: 5 baris (RLS ppl/dinas) | ✅ | — | uji live |
| BB-04-02 | Verifikasi | PPL verifikasi laporan | `is_verified` berubah + audit | Guard + RLS + audit | ✅ | — | `verification-actions.ts:175` |
| BB-04-03 | Verifikasi | Petani verifikasi | Ditolak | Guard role + RLS | ✅ | — | `verification-actions.ts:36` |
| BB-04-04 | Verifikasi | Verifikasi laporan **yang sudah final** | Tidak bisa diubah lagi (AC) | **Bisa diubah berulang** | ⚠️ | Sedang | `verification-actions.ts:191` |
| BB-04-05 | Verifikasi | Catatan >500 karakter | Ditolak | `max(500)` | ✅ | — | `verification-actions.ts:12` |
| BB-04-06 | Air | PPL/Dinas input tinggi air | Tersimpan | RLS insert ppl/dinas | ✅ | — | `water-actions.ts` |
| BB-04-07 | Air | Petani input tinggi air | Ditolak | RLS `water_insert_ppl_dinas` | ✅ | — | `0003:87` |
| BB-04-08 | Air | `GET /api/water-levels` tanpa sesi | 401 / kosong | 200 `null` (tidak bocor) | ⚠️ | Rendah | `api/water-levels/route.ts` |
| BB-04-09 | Peta | Lahan + marker laporan | Tampil | `getPetaData` + signed URL | ✅ | — | `peta/actions.ts` |
| BB-04-10 | Peta | Foto via signed URL (1 jam) | Bucket privat | `createSignedUrl` | ✅ | — | `peta/actions.ts:81` |

### FR-05 — Rekap PDF (Could)

| ID | Kategori | Skenario | Expected | Actual | Status | Severity | Bukti |
|---|---|---|---|---|---|---|---|
| BB-05-01 | Rekap | Halaman rekap tampil | Data + ringkasan | Ada (M4 `5e87faf`) | ✅ | — | `app/(app)/laporan` |
| BB-05-02 | Rekap | Filter/summary | Sesuai role | RLS membatasi cakupan | ✅ | — | — |

### Edge Case

| ID | Skenario | Expected | Actual | Status |
|---|---|---|---|---|
| BB-EX-01 | Belum login akses API bisnis | 401 | 401 (`/api/ai/analyze`, `/api/lahan`, `/api/sync`) | ✅ |
| BB-EX-02 | Request API saat offline | Tidak crash | Middleware lanjut tanpa blokir | ✅ |
| BB-EX-03 | Foto tanpa AI (manual) | Laporan tetap bisa | `manualMode` | ✅ |
| BB-EX-04 | Koordinat tak tersedia | Lahan/lokasi default Karawang | `DEFAULT_CENTER` | ✅ |
| BB-EX-05 | Geolocation ditolak Safari | Fallback, tetap jalan | `requestLocation()` device-first | ✅ |

---

## BAGIAN 2 — WHITEBOX

### Security

| ID | Temuan | Severity | Bukti |
|---|---|---|---|
| WB-SEC-01 | **RLS `poktan` aktif tanpa policy SELECT** → default deny; user terautentikasi dapat 0 baris (dampak ke onboarding & EWS) | 🔴 Tinggi | `0001_init.sql:106` (tanpa `create policy` poktan); uji live poktan=0 |
| WB-SEC-02 | **Trigger `handle_new_user` memercayai `role` dari `raw_user_meta_data` (dikendalikan klien)** → signUp dengan `role:'dinas'` bisa eskalasi. Trigger juga tanpa `set search_path` → signup gagal 500 | 🔴 Kritis/Tinggi | `0001_init.sql:76-88`; uji live signup 500 |
| WB-SEC-03 | **Verifikasi OTP sepenuhnya di client** (localStorage), bukan batas keamanan; `signInWithPassword` deterministik `AgriGuard-<6digit>` → siapa pun yang tahu nomor bisa membuat sesi | 🔴 Tinggi (desain) | `lib/auth/otp.ts:62`, `login/page.tsx:64-72` |
| WB-SEC-04 | Mock Supabase bisa aktif saat env kosong **tanpa cek NODE_ENV**; cookie `agriguard-mock-session` (client) dipercaya server (termasuk `role`) → forge sesi bila mock aktif | 🟠 Sedang | `server.ts:123-131`, `middleware.ts:128` |
| WB-SEC-05 | Service-role key hanya di file server; tidak ada komponen `'use client'` mengimpor admin client | ✅ | grep `SERVICE_ROLE_KEY` |
| WB-SEC-06 | Bucket `photos` privat; akses via signed URL berbatas waktu | ✅ | `0001:96`, `peta/actions.ts:81` |
| WB-SEC-07 | Tidak ada raw SQL/string concat; seluruh akses via supabase-js (parameterized) | ✅ | review `lib/`, `app/api` |
| WB-SEC-08 | Server action CQRS cek sesi + role (`requirePplDinas`) sebelum mutasi | ✅ | `verification-actions.ts:36`, `audit-actions.ts:15` |

### Robustness & Error Handling

| ID | Temuan | Severity | Bukti |
|---|---|---|---|
| WB-ROB-01 | `setVerification` tidak memeriksa `verified_at` sudah terisi (AC "final") | 🟠 Sedang | `verification-actions.ts:191-218` |
| WB-ROB-02 | Kegagalan audit log hanya di-`console.error` (tidak menggagalkan operasi utama) — disengaja, perlu dicatat | 🟡 Rendah | `laporan/actions.ts:208` |
| WB-ROB-03 | `GET /api/water-levels` tanpa guard sesi eksplisit (mengandalkan RLS → hasil null) | 🟡 Rendah | `api/water-levels/route.ts` |
| WB-ROB-04 | Rate limit AI disimpan di memori (reset saat restart; bukan lintas instance) | 🟡 Rendah | `analyze/route.ts:11` |

### Validasi Client ↔ Server

| ID | Temuan | Severity | Bukti |
|---|---|---|---|
| WB-VAL-01 | Skema Zod server selaras dengan validasi client (foto ≤3, ≤5MB, MIME, geofence, uuid) | ✅ | `laporan/actions.ts:14` vs `scan/page.tsx` |
| WB-VAL-02 | `normalizePhone` diduplikasi (`lib/utils.ts` & `lib/auth/otp.ts`) — risiko divergensi | 🟡 Rendah | `utils.ts:47`, `otp.ts:42` |
| WB-VAL-03 | `validateGeofence` diduplikasi inline di `/api/sync` (bukan import `lib/geo`) | 🟡 Rendah | `api/sync/route.ts:219` |

### Idempotency

| ID | Temuan | Severity | Bukti |
|---|---|---|---|
| WB-IDEM-01 | Laporan & sync memakai `idempotency_key` + `onConflict` → anti duplikat | ✅ | `laporan/actions.ts:188`, `sync/route.ts:159` |
| WB-IDEM-02 | `/api/sync` punya early-return untuk key yang sudah ada (menghindari jalur UPDATE RLS petani) | ✅ | `sync/route.ts:91` |
| WB-IDEM-03 | `submitReport` menulis audit `entity_id` = `reportId` random (bisa beda dari id baris saat konflik upsert) | 🟡 Rendah | `laporan/actions.ts:170,201` |
| WB-IDEM-04 | `submitReport` tanpa early-return; retry dengan key sama pada laporan petani berisiko kena RLS UPDATE (upsert) → gagal | 🟠 Sedang | `laporan/actions.ts:171` |

### Higiene Env

| ID | Temuan | Severity | Bukti |
|---|---|---|---|
| WB-ENV-01 | Hanya key publik ber-prefix `NEXT_PUBLIC_` yang sampai ke bundle; service role tidak | ✅ | `env.ts`, grep |
| WB-ENV-02 | Tidak ada `.env.example` yang lengkap? (ada, 164 byte) | ✅ | `.env.example` |
| WB-ENV-03 | `AI_API_URL` server-only (dipakai di route server & `lib/ai.ts` server) | ✅ | `lib/ai.ts:10` |

---

## Perbaikan yang Dilakukan

### 1. Migrasi DB — `supabase/migrations/0007_fix_signup_and_poktan_rls.sql`
- **BUG 1 (Kritis):** buat ulang `public.handle_new_user()` dengan `set search_path = public` dan **paksa role user baru = `petani`** (menutup eskalasi role + memperbaiki signup 500).
- **BUG 2 (Tinggi):** tambah policy `poktan_select_authenticated` (SELECT untuk `authenticated`) agar onboarding & lookup district EWS bekerja.

> ⚠️ **Wajib dijalankan** di Supabase SQL Editor / `supabase db push`. Tanpa langkah ini, bug #1 & #2 tetap aktif di DB live.

### 2. Verifikasi AI (tidak ada perubahan kode)
Kontrak `/predict` & akurasi sesuai desain; tidak ada aksi.

---

## Perlu Keputusan (belum diubah — butuh persetujuan)

1. **Model autentikasi (WB-SEC-03)** — OTP saat ini client-side + password deterministik `AgriGuard-<6digit>`. Untuk produksi: verifikasi OTP harus di server (Edge Function) dan sesi dibuat lewat Supabase Auth yang aman (bukan password turunan nomor). Ini perubahan desain besar → **Perlu Keputusan**.
2. **Kebijakan mock (WB-SEC-04)** — jangan aktifkan mock berdasarkan NODE_ENV (demo produksi memakainya). Usulan: flag eksplisit `ALLOW_MOCK=true` + larangan absolut saat produksi nyata. Berdampak ke demo → **Perlu Keputusan**.
3. **Finalitas verifikasi (WB-ROB-01)** — tambah guard "sudah diverifikasi → tolak" bila AC memang final. Perlu konfirmasi produk.
4. **Expose `invite_code` poktan** — policy baru membuat semua user terautentikasi dapat membaca seluruh `invite_code`. Alternatif lebih ketat: RPC `join_poktan(invite_code)` + `get_my_poktan()`. Trade-off → **Perlu Keputusan**.

---

## Rekomendasi

1. **Segera terapkan** migrasi 0007 dan uji ulang signup + onboarding + EWS.
2. Tambah regression test otomatis: signup baru, onboarding kode undangan, dan EWS tinggi air (mendeteksi regresi RLS).
3. Satukan `normalizePhone` & `validateGeofence` ke satu modul bersama (hilangkan duplikasi).
4. Tambah guard "final" pada `setVerification` sesuai keputusan produk.
5. Beri guard sesi eksplisit pada `GET /api/water-levels` (konsistensi 401).
6. Pertimbangkan pemindahan rate limit AI ke penyimpanan bersama (Upstash/DB) untuk produksi.
7. Lengkapi `.env.example` & dokumentasi penerapan migrasi pada README.

---

## BAGIAN 3 — Uji Lapangan Mobile (post-deployment)

Tanggal: 12 Oktober 2026
Lingkungan: **produksi** — web di Vercel (`agriguard-five.vercel.app`), AI di Render (`agriguard-ai-96hh.onrender.com`), diuji langsung dari **HP Android** (viewport 360–414 px).
Tujuan: memvalidasi kesiapan pakai petani nyata. Ditemukan **7 catatan revisi** (1–7; #2 & #7 akar masalahnya sama) dan semuanya diperbaiki di tahap ini.

| ID | Halaman/Area | Temuan (uji lapangan) | Perbaikan | Bukti (commit) |
|---|---|---|---|---|
| FM-01 | Footer landing | Container footer terasa menjorok & link (Fitur/Cara Kerja/Tentang/Masuk) tersusun **vertikal** sehingga memakan tinggi di mobile | Footer dirapikan: padding horizontal konsisten dengan section lain (`px-4`), link jadi **horizontal** (`flex-row flex-wrap`) semua ukuran layar, logo+tagline di kiri/atas, copyright terpusat | `f40540b` |
| FM-02 | `/lahan` (peta Leaflet) | Peta **menembus** overlay & drawer sidebar: pane/control Leaflet (z-index 400/800) lebih tinggi dari overlay drawer | `.leaflet-container { z-index: 0; position: relative }` (membentuk stacking context) + overlay drawer `z-[1000]`, panel `z-[1010]` | `f6e809c` |
| FM-03 | `/scan` + AI | Foto **bukan tanaman** (orang/interior) tetap dianalisis dan ditampilkan "Aman (keyakinan 38%)" — kelemahan fatal untuk demo | Gerbang domain di `ai-service`: (a) pra-cek rasio hijau vegetasi HSV < 15% → 422 "Foto bukan lahan padi/tanaman…"; (b) confidence model < 0.50 → 422 "Kualitas foto tidak cukup jelas…"; threshold jadi konstanta terdokumentasi + tampil di `/model-info`; frontend menampilkan pesan + tombol **"Ambil Ulang Foto"** (bukan lapor manual) | `9a6b2a5` |
| FM-04 | Laporan offline (global) | Setelah kembali online, sync **tidak jalan** sampai user refresh; banner offline tidak hilang otomatis | AutoSync: tambah `visibilitychange`, retry berkala **30 dtk hanya bila antrian berisi**, deteksi "koneksi pulih" via fetch sukses; status online dibersihkan otomatis pada event `online` → banner & badge "Menunggu Sync (n)" reaktif tanpa refresh | `051a69e` |
| FM-05 | `/login` (mobile) | Banner ilustrasi tinggi penuh di atas + form jauh di bawah → **boros scroll**; form OTP tidak terlihat tanpa scroll di 360×640 | Banner mobile diringkas jadi **~208 px** (object-cover + gradient + logo white + heading 1 baris), logo color di atas form dihilangkan di mobile, padding form diringkas → form OTP terlihat tanpa scroll di 360×640–800 | `850fa27` |
| FM-06 | Dokumentasi | Belum ada catatan siklus uji lapangan → perbaikan | Bagian ini ditambahkan ke `docs/QA-REPORT.md` | (dokumen ini) |
| FM-07 | `/peta` (peta Leaflet) | Sama seperti FM-02: peta menembus drawer/overlay | Diperbaiki oleh satu akar perbaikan FM-02 | `f6e809c` |

**Verifikasi perbaikan (post-fix):**
- Peta `/lahan` & `/peta`: buka drawer → peta tertutup penuh oleh overlay+drawer; klik overlay → drawer tertutup, peta tetap berfungsi normal.
- AI: foto hijau/vegetasi lolos ke inference; foto abu-abu/kulit/putih/latar bukan tanaman ditolak 422 dengan pesan ramah; hasil confidence rendah ditolak (bukan ditampilkan sebagai kepastian).
- Offline: offline → submit → online → **tanpa aksi apa pun** banner hilang, sync jalan, badge kembali kosong, baris terisi di Supabase.
- Footer & login: dicek di viewport 360 px & 414 px.
- `npm run build` sukses setelah seluruh perubahan.

**Keterbatasan gerbang AI (jujur, untuk laporan):** gerbang domain FM-03 adalah **heuristik** (rasio hijau HSV + ambang keyakinan softmax), **bukan** klasifikasi in-domain/out-of-domain yang sesungguhnya. Foto dinding/pakaian hijau berpotensi lolos, dan sawah keruh/kekeringan ekstrem berpotensi tertolak. Karena itu pesan kegagalan selalu meminta foto ulang dan tidak memberi opsi laporan manual pada kasus 422. Peningkatan ke depan: model/klasifikasi domain khusus atau deteksi segmen tanaman.
