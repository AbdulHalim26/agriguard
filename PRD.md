Tulis file PRD.md di root proyek. TIMPA TOTAL isi file lama — jangan baca file lama, jangan gabungkan dengan isi lama.
Sumber konten: persis di antara CONTENT_START dan CONTENT_END di bawah.

ATURAN MUTLAK:

1. Salin konten VERBATIM. Dilarang mengubah, merapikan, menambah, mengurangi, atau menduplikasi bagian mana pun.
2. Konversi marker menjadi code fence:
   - baris "SQL_START" diganti "`sql" dan baris "SQL_END" diganti "`"
   - baris "TREE_START" diganti "`" dan baris "TREE_END" diganti "`"
   - baris "ENV_START" diganti "`" dan baris "ENV_END" diganti "`"
     (baris marker itu sendiri TIDAK boleh ada di file final)
3. JANGAN membungkus seluruh file dengan fence tambahan. Baris pertama file harus: # PRD — AgriGuard (v1.0 · Agent-Ready)
4. Setelah selesai menulis, jalankan perintah "wc -l PRD.md" dan tampilkan 10 baris pertama + 5 baris terakhir file.

CONTENT_START

# PRD — AgriGuard (v1.0 · Agent-Ready)

## 0. Petunjuk Eksekusi untuk Agent

- Baca seluruh dokumen SEBELUM menulis kode. Tech stack di §2 adalah LOCKED, dilarang mengganti.
- Kerjakan berurutan per milestone (§13). Setiap milestone harus: build sukses, tanpa error TS, dan bisa dites manual sesuai acceptance criteria fitur terkait.
- Jangan buat fitur di luar scope §4. Jangan tambah dependency tanpa alasan kuat.
- Semua teks UI berbahasa Indonesia sederhana (target: petani awam).

## 1. Ringkasan Produk

AgriGuard adalah platform web mobile-first untuk: (1) peringatan dini banjir sawah hiper-lokal, (2) pindai kerusakan padi pasca-banjir berbasis AI (Computer Vision), (3) pelaporan offline-first dengan geotagging, dan (4) dashboard verifikasi untuk PPL/Dinas sebagai bahan triage klaim Asuransi Usaha Tani Padi (AUTP). Konteks: kompetisi ICONFEST 2026, tema Agroteknologi, wilayah pilot Kabupaten Karawang. AI = alat triage; keputusan akhir selalu manusia (PPL).

## 2. Tech Stack (LOCKED)

| Komponen                | Teknologi                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| Frontend                | Next.js (App Router) + TypeScript                                             |
| UI                      | Tailwind CSS + shadcn/ui                                                      |
| Backend/DB/Auth/Storage | Supabase (Postgres + RLS + Auth + Storage)                                    |
| Peta                    | Leaflet + OpenStreetMap tiles (bukan Mapbox)                                  |
| AI                      | FastAPI + YOLOv8n-cls (3 kelas), deploy di Hugging Face Spaces                |
| Offline                 | IndexedDB (lib idb) + service worker minimal (PWA installable = nice-to-have) |
| Deploy                  | Vercel (web) + HF Spaces (AI)                                                 |

## 3. Pengguna & Autentikasi

### Role

- petani — self-register via OTP, wajib join Poktan dengan kode undangan.
- ppl, dinas — HANYA dari seed data (tidak bisa self-register). PPL bisa update tinggi air dan verifikasi laporan; Dinas melihat semua + rekap.

### Alur Auth (phone-first)

1. User input nomor WhatsApp (placeholder UI: "Contoh: 0812345678910"). Normalisasi ke 62xxx.
2. requestOtp(phone): generate kode 6 digit, simpan (expired 5 menit).
   - OTP_MODE=mock → kode statis 123456, tampilkan hint di UI (khusus dev/demo).
   - OTP_MODE=wa → kirim via WA gateway (endpoint Fonnte-compatible). Implementasi di lib/auth/otp.ts sebagai interface tunggal agar provider mudah diganti.
3. verifyOtp(phone, code) → upsert user Supabase Auth dengan email alias {62xxxxxxxxxx}@otp.agriguard.id (password random), lalu buat session standar Supabase.
4. Onboarding: nama lengkap + kode undangan Poktan.

Catatan keamanan: session & RLS tetap dikelola Supabase. OTP mock HANYA untuk mode demo; jangan pernah commit kredensial gateway WA.

## 4. Scope — MoSCoW

Must (MVP):

- FR-00 Auth OTP + onboarding + role
- FR-01 Dashboard Early Warning (cuaca + tinggi air + status banjir)
- FR-02 AI Crop Damage Scanner (foto → klasifikasi 3 kelas)
- FR-03 Laporan offline-first + auto-sync
- FR-04 Peta interaktif + alur verifikasi PPL/Dinas
- RLS lengkap + seed data demo

Should: notifikasi in-app, statistik ringkas dashboard, rekomendasi tindakan statis per status, upload multi-foto (max 3 per laporan).

Could (jangan prioritaskan sebelum semua Must selesai):

- FR-05 PDF rekap klaim AUTP, bounding box overlay di foto, PWA installable.

Won't (v1): payment, multi-bahasa, IoT sensor realtime, aplikasi native, training model dari nol.

## 5. Data Model (Postgres)

SQL_START
-- enums
create type user_role as enum ('petani','ppl','dinas');
create type ai_status as enum ('aman','rusak_ringan','rusak_berat');

create table poktan (
id uuid primary key default gen_random_uuid(),
name text not null,
village text,
district text,
invite_code text unique not null,
created_at timestamptz not null default now()
);

create table profiles (
id uuid primary key references auth.users on delete cascade,
phone text unique not null,
full_name text not null,
role user_role not null default 'petani',
poktan_id uuid references poktan,
created_at timestamptz not null default now()
);

create table lahan (
id uuid primary key default gen_random_uuid(),
poktan_id uuid not null references poktan,
owner_id uuid not null references profiles,
name text not null,
area_hectares numeric not null,
polygon jsonb not null, -- [[lng,lat], ...] minimal 3 titik
created_at timestamptz not null default now()
);

create table water_levels (
id uuid primary key default gen_random_uuid(),
district text not null,
river_level_m numeric not null,
updated_by uuid references profiles,
updated_at timestamptz not null default now()
);

create table damage_reports (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references profiles,
lahan_id uuid not null references lahan,
photo_paths text[] not null, -- path di bucket 'photos'
photo_hash text not null, -- sha256 file pertama
ai_status ai_status,
ai_confidence numeric,
ai_damage_pct numeric,
latitude numeric not null,
longitude numeric not null,
client_created_at timestamptz not null,
server_created_at timestamptz not null default now(),
idempotency_key uuid unique not null,
is_verified boolean not null default false,
verified_by uuid references profiles,
verified_at timestamptz,
verification_note text
);

create table audit_logs (
id uuid primary key default gen_random_uuid(),
actor_id uuid,
action text not null,
entity text,
entity_id uuid,
meta jsonb,
created_at timestamptz not null default now()
);

create index idx_reports_user on damage_reports(user_id);
create index idx_reports_lahan on damage_reports(lahan_id);
create index idx_lahan_poktan on lahan(poktan_id);
SQL_END

- Trigger: insert profiles otomatis saat user auth baru dibuat (handle_new_user).
- Storage: bucket photos PRIVATE, max 5MB, tipe jpeg/png, akses via signed URL (expire 1 jam).
- TANPA PostGIS. Validasi geofence (titik dalam polygon) pakai ray-casting di server (lib/geo.ts).

### RLS (wajib aktif di semua tabel)

- profiles: baca/update row sendiri; ppl & dinas baca semua.
- lahan: baca jika owner ATAU satu poktan; insert/update hanya owner.
- damage_reports: insert hanya milik sendiri; baca jika (sendiri ATAU satu poktan ATAU ppl/dinas); update kolom verifikasi (is_verified, verified_by, verified_at, verification_note) hanya oleh ppl/dinas.
- water_levels: baca semua terautentikasi; insert/update hanya ppl/dinas.
- audit_logs: baca ppl/dinas; insert hanya via service role (server).

### Aturan integritas data (server-side, bukan client)

1. Dedupe foto: sha256(photo) — tolak jika hash sama dari user sama dalam 24 jam.
2. Geofence: (latitude, longitude) laporan HARUS di dalam polygon lahan terkait.
3. Timestamp kebenaran = server_created_at (DB). client_created_at hanya metadata.
4. Sync idempotent via idempotency_key (upsert, bukan insert mentah).
5. Konflik sync: pembuatan laporan = client authority; verifikasi = hanya server (PPL).

## 6. API Surface (seminimal mungkin)

Server Actions (prefer):

- auth: requestOtp, verifyOtp, completeOnboarding, signOut
- lahan: createLahan, updateLahan, listMyLahan
- report: submitReport(formData + files) → validasi §5 → upload storage → insert → audit log
- verify: setVerification(reportId, isVerified, note)
- water: upsertWaterLevel(district, riverLevelM) (ppl/dinas)

Route Handlers:

- POST /api/ai/analyze — proxy multipart ke AI_API_URL (Hugging Face). Server-only (jangan panggil AI dari browser). Rate limit 20 request/user/hari. Timeout 15 detik.
- POST /api/sync — terima batch laporan offline (idempotent).
- GET /api/weather — proxy OpenWeatherMap (key server-only), cache 10 menit. Fallback: data mock jika key kosong/error (agar demo tidak pernah mati).

AI Service (FastAPI, HF Spaces):

- POST /predict (image file) → { "status": "rusak_berat", "confidence": 0.87, "damage_pct": 78 }
- GET /health → 200 OK. Model: YOLOv8n-cls fine-tune 3 kelas (aman / rusak_ringan / rusak_berat).

## 7. Spesifikasi Fitur + Acceptance Criteria

### FR-00 Auth

- AC: register nomor baru → OTP → onboarding → masuk dashboard petani.
- AC: nomor terdaftar → OTP → langsung dashboard. Logout berfungsi.
- AC: role ppl/dinas dari seed bisa login dan melihat menu verifikasi.

### FR-01 Dashboard Early Warning (Petani)

- Kartu status banjir besar: AMAN (hijau) / WASPADA (kuning) / BAHAYA (merah). Status = fungsi curah hujan 3 jam terakhir (weather API) + tinggi air terakhir wilayah (water_levels). Threshold konstanta di lib/thresholds.ts (contoh: hujan >20mm/3j = waspada, >50mm/3j atau air >1.2m = bahaya).
- AC: status selalu tampil (warna + icon + teks, bukan warna saja). Data gagal → tampil "Data tidak tersedia" + tombol coba lagi, TIDAK crash.
- AC: PPL dapat update tinggi air dari dashboard admin; petani melihat perubahan.

### FR-02 AI Scanner

- Kamera/upload → preview → kirim ke /api/ai/analyze → hasil: badge status + skor keyakinan + rekomendasi tindakan statis. Geotagging otomatis (navigator.geolocation, fallback manual peta).
- AC: hasil AI < 15 detik atau timeout → tawarkan "Lapor Manual" (form tanpa AI, tetap bisa kirim).
- AC: file >5MB / non-gambar → pesan jelas. Gagal AI ≠ gagal lapor.

### FR-03 Offline-First Report

- Saat offline: form tetap berfungsi; foto + payload disimpan IndexedDB; tampil di widget "Menunggu Sync (n)". Event online → auto-sync via /api/sync, per item sukses → hilang dari antrian.
- AC: kill browser saat offline → data tetap ada setelah dibuka lagi.
- AC: sync ulang laporan yang sama TIDAK membuat duplikat (idempotency_key).
- AC: foto dikompres client-side ke sisi terpanjang 1280px kualitas 0.8 sebelum disimpan/dikirim.

### FR-04 Peta & Verifikasi (PPL/Dinas)

- Peta Karawang: pin berwarna per status laporan; klik pin → modal detail (foto, petani, koordinat, hasil AI, waktu) + tombol Setujui/Tolak + catatan.
- AC: petani TIDAK bisa membuka halaman verifikasi (redirect) — dijaga RLS + server check.
- AC: setelah verifikasi, status di sisi petani berubah ("Tervalidasi"), audit_logs terisi.

### FR-05 PDF Rekap (Could)

- PPL pilih laporan terverifikasi (filter tanggal/wilayah) → generate PDF ringkasan (tabel + total luas terdampak). Boleh pakai lib pdf ringan atau print-friendly page.

## 8. Non-Functional

- Mobile-first, layar terkecil 360px. Target sentuh ≥48px. Kontras tinggi (penggunaan luar ruangan).
- Semua state loading/error/empty DIDESAIN (tidak boleh layar putih).
- Tanpa secret di client: hanya NEXT_PUBLIC_SUPABASE_URL + ANON key. Service key & API key hanya environment server.
- Bahasa UI Indonesia sederhana; istilah teknis (AI, GPS) tetap boleh.

## 9. Struktur Folder

TREE_START
agriguard/
├── app/
│ ├── (marketing)/ # landing, fitur, cara-kerja, tentang
│ ├── (auth)/login/ # OTP + onboarding
│ ├── (app)/ # layout dashboard (sidebar)
│ │ ├── dashboard/ # petani: EWS + CTA scan + ringkasan
│ │ ├── lahan/ # CRUD lahan saya
│ │ ├── scan/ # FR-02
│ │ ├── laporan/ # riwayat + status sync
│ │ ├── peta/ # peta petani (lihat lahan & laporan sendiri)
│ │ └── verifikasi/ # ppl/dinas: FR-04 (+ input tinggi air)
│ ├── api/
│ │ ├── ai/analyze/route.ts
│ │ ├── sync/route.ts
│ │ └── weather/route.ts
│ ├── layout.tsx
│ └── globals.css
├── components/
│ ├── ui/ # shadcn primitives (jangan diedit manual)
│ └── features/ # flood-banner, scan-camera, report-card, sync-widget, map-view, report-modal, stat-card
├── lib/
│ ├── supabase/client.ts # browser (anon key)
│ ├── supabase/server.ts # server component/action
│ ├── supabase/admin.ts # service role (HANYA server: auth admin, audit log)
│ ├── auth/otp.ts # interface OTP (mock | wa)
│ ├── offline/db.ts # IndexedDB schema + queue
│ ├── offline/sync.ts # engine sync + retry
│ ├── ai.ts # panggil AI_API_URL
│ ├── geo.ts # point-in-polygon, kompresi gambar
│ ├── thresholds.ts # konstanta status banjir
│ └── utils.ts
├── supabase/
│ ├── migrations/0001_init.sql # tabel + enum + RLS + trigger + index + bucket
│ └── seed.sql # §11
├── ai-service/
│ ├── main.py # FastAPI /predict /health
│ ├── predict.py # load model + preprocessing
│ ├── requirements.txt
│ └── model/ # weights (gitignored, unduh via script)
├── public/manifest.json # PWA minimal
├── .env.example
└── README.md # cara run lokal + deploy
TREE_END

## 10. Environment Variables

ENV_START
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # server only
OPENWEATHER_API_KEY= # kosong → fallback mock
AI_API_URL= # endpoint HF Spaces
OTP_MODE=mock # mock | wa
WA_GATEWAY_URL= # opsional, mode wa
WA_GATEWAY_TOKEN= # opsional
ENV_END

## 11. Seed Data (demo juri — WAJIB dari awal)

- 1 poktan: "Poktan Sukamaju — Karawang" (invite_code: DEMO01).
- Akun: 2 petani, 1 ppl, 1 dinas (login via OTP mock 123456).
- 5 lahan dengan polygon koordinat asli sekitar Karawang (contoh dekat Telukjambe).
- 10 damage_reports: variasi status AI (aman/rusak_ringan/rusak_berat), verified & belum verified, sebagian dengan client_created_at mundur beberapa hari.
- water_levels: 2 entri district terkini.
- Foto contoh: ambil dari dataset padi terbuka (PlantVillage/Roboflow) — simpan di supabase/seed-photos/.

## 12. Definition of Done (submission-ready)

1. Live URL berjalan + seed data aktif; alur end-to-end lancar di HP Android nyata.
2. Skenario demo 3 menit teruji: buka dashboard → scan AI → offline → sync → verifikasi PPL.
3. README: setup, env, deploy, struktur. .env.example lengkap tanpa secret.
4. Tidak ada console error; semua halaman punya loading/empty/error state.
5. Repo: commit history rapi (progres = nilai bobot "Laporan dan Progres 20%").

## 13. Milestones (kerjakan berurutan)

- M1 — Fondasi: repo + skema SQL + RLS + trigger + seed + auth OTP mock + shell dashboard.
- M2 — Inti: lahan CRUD + weather/water + submitReport + storage + ai-service /predict + /api/ai/analyze.
- M3 — Offline & Peta: IndexedDB queue + /api/sync + Leaflet pins + alur verifikasi + audit_logs.
- M4 — Polish: statistik, rekomendasi tindakan, FR-05 (jika waktu), PWA manifest, compress foto, uji HP.
- M5 — Submission: video demo, review DoD, freeze fitur.

## 14. Out of Scope v1 (JANGAN dikerjakan)

Payment/iap, multi-bahasa, push notification server, integrasi sensor IoT realtime, aplikasi native (Flutter/React Native), admin panel generik, training pipeline ML dari nol.
CONTENT_END
