# AgriGuard

Platform peringatan dini banjir sawah hiper-lokal dengan AI untuk petani dan PPL/Dinas.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Backend/DB/Auth/Storage**: Supabase (Postgres + RLS + Auth + Storage)
- **Maps**: Leaflet + OpenStreetMap
- **AI**: FastAPI + YOLOv8n-cls (Hugging Face Spaces)
- **Offline**: IndexedDB (idb) + Service Worker

## Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```
4. Run database migrations in Supabase SQL Editor:
   - Execute `supabase/migrations/0001_init.sql`
   - Execute `supabase/seed.sql` for demo data
5. Start development server:
   ```bash
   npm run dev
   ```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key (optional, for weather data) |
| `AI_API_URL` | Hugging Face Spaces endpoint for AI service |
| `OTP_MODE` | `mock` or `wa` (default: `mock`) |
| `WA_GATEWAY_URL` | WhatsApp gateway URL (for OTP_MODE=wa) |
| `WA_GATEWAY_TOKEN` | WhatsApp gateway token (for OTP_MODE=wa) |

## Project Structure

```
agriguard/
├── app/
│   ├── (marketing)/     # Landing, features, how-it-works, about
│   ├── (auth)/login/    # OTP + onboarding
│   ├── (app)/           # Dashboard layout (sidebar)
│   │   ├── dashboard/   # Early warning + CTA scan
│   │   ├── lahan/       # CRUD lahan
│   │   ├── scan/        # AI crop damage scanner
│   │   ├── laporan/     # Report history + sync status
│   │   ├── peta/        # Interactive map
│   │   └── verifikasi/  # PPL/Dinas verification
│   ├── api/             # API routes
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/              # shadcn primitives
│   └── features/        # Feature components
├── lib/
│   ├── supabase/        # Supabase clients
│   ├── auth/            # OTP service
│   ├── offline/         # IndexedDB + sync
│   ├── ai.ts            # AI service client
│   ├── geo.ts           # Geo utilities
│   ├── thresholds.ts    # Flood thresholds
│   └── utils.ts         # Utilities
├── supabase/
│   ├── migrations/      # Database migrations
│   └── seed.sql         # Demo seed data
├── ai-service/          # FastAPI AI service
└── public/              # Static assets
```

## AI Service (`/ai-service`)

FastAPI untuk klasifikasi foto padi (3 kelas: `aman`, `rusak_ringan`, `rusak_berat`).
Saat ini memakai placeholder deterministik — kontrak endpoint sudah benar.

### Run Lokal

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Tes

```bash
curl http://localhost:8000/health
# {"status":"ok"}

curl -X POST http://localhost:8000/predict \
  -F "image=@/path/foto.jpg"
# {"status":"rusak_ringan","confidence":0.78,"damage_pct":30}
```

Setelah berjalan, isi `AI_API_URL=http://localhost:8000` di `.env` (server-only).
Deploy ke Hugging Face Spaces: buat Space Docker, upload isi `ai-service/` (termasuk
`Dockerfile`), lalu set `AI_API_URL` ke URL Space.

## Fitur Scan & Laporan (M2b)

- `/scan`: ambil/upload foto → kompres 1280px/0.8 → `/api/ai/analyze` (proxy server-only,
  rate limit 20/hari, timeout 15s) → hasil AI + rekomendasi → pilih lahan → GPS/klik peta
  → kirim laporan. Jika AI gagal → tombol "Lapor Manual".
- `/laporan`: daftar laporan real dari Supabase, thumbnail via signed URL (1 jam), status
  verifikasi + sinkron.
- `submitReport` (server action): geofence ray-casting, dedupe foto sha256 (24 jam),
  idempotency via `idempotency_key`, upload ke bucket `photos` (private), insert
  `damage_reports` + `audit_logs`.

## Fitur M3 — Offline, Peta & Verifikasi

- `/scan`: saat offline, payload + foto (sudah dikompres 1280px/0.8) disimpan ke
  IndexedDB (`lib/offline/db.ts`). Widget "Menunggu Sync (n)" tampil di dashboard.
- `/api/sync`: sinkronisasi idempotent via `idempotency_key` (laporan yang sama
  tidak pernah diduplikasi). Sukses → item keluar dari antrian; gagal → tetap
  di antrian dan di-retry (event `online`, fokus jendela, tiap 60 detik).
- `/peta`: Leaflet + OpenStreetMap — polygon lahan + pin per `ai_status`
  (hijau `aman` / amber `rusak_ringan` / merah `rusak_berat` / abu `manual`),
  klik pin → modal detail (foto signed URL, petani, koordinat, hasil AI, waktu).
- `/verifikasi` (ppl/dinas): daftar laporan + modal Setujui/Tolak + catatan.
  Setiap aksi menulis `audit_logs`; status berubah di sisi petani (`/laporan`).
  Petani di-redirect dari `/verifikasi` (middleware + server check).
- Input tinggi air (`water_levels`) per kecamatan oleh PPL/Dinas; tampil di
  dashboard petani sesuai district poktan.

### Verifikasi Manual — Offline Sync (FR-03)

1. Buka `/scan` di browser, devtools → Network → set **Offline**.
2. Foto padi → tunggu hasil AI (atau "Lapor Manual") → pilih lahan → ambil GPS
   / klik peta di dalam polygon → **Kirim Laporan**. Muncul pesan "tersimpan offline".
3. Kembali ke `/dashboard`: widget **"Menunggu Sync (n)"** menampilkan jumlah antrian.
4. **Kill/close tab browser** (masih offline), lalu buka lagi `/dashboard` →
   antrian tetap ada (data bertahan di IndexedDB).
5. Set Network kembali **Online**. Antrian tersinkron otomatis. Cek `/laporan`:
   laporan muncul. Ulangi sync (tombol "Sinkronkan Sekarang") → **tidak ada duplikat**.
6. (Opsional) Lakukan 2 laporan offline berurutan di sesi `/scan` yang sama →
   antrian harus bertambah 2 (bukan saling menimpa).

### Verifikasi Manual — Offline Bukan Blank / Form Tetap Jalan (FR-03)

1. Buka `/scan` saat online dulu sampai data lahan tampil (lahan di-cache).
2. Devtools → Network → pilih **Offline** (atau blokir host `supabase.co`).
3. **Jangan tutup tab**: klik Menu → Dashboard, Lahan, Laporan — halaman TIDAK
   blank. Muncul banner kuning "Mode Offline — laporan tersimpan lokal…".
4. Kembali ke `/scan`: lahan masih terpilih (dari cache). Foto + pilih lahan +
   lokasi → Kirim Laporan → tersimpan ke antrian (bukan error).
5. Devtools → Network → **Online** → laporan otomatis tersinkron (event online
   / request sukses berikutnya memicu auto-sync). Cek `/laporan` → muncul.
6. Tutup tab (offline) lalu buka lagi → antrian masih ada → online → sync ulang
   → tidak ada duplikat (idempotency_key).
7. Paksa "online tapi gagal": dengan Network Online, blokir request `*/submitReport*`
   di devtools lalu kirim laporan → tetap masuk antrian offline (bukan blank/error)

### Verifikasi Manual — Alur PPL/Dinas (FR-04)

1. Login sebagai **PPL (081234567892)** dengan OTP `123456`.
2. Buka `/verifikasi` → tab **Verifikasi Laporan**. Klik satu laporan → modal
   detail (foto, petani, koordinat, hasil AI, waktu).
3. Isi catatan → klik **Setujui** (atau **Tolak**). Seharusnya muncul pesan sukses
   dan baris masuk tabel `audit_logs` (action `verify_report`/`reject_report`).
4. Login sebagai **petani (081234567890)** → `/laporan`: status laporan berubah
   menjadi **Tervalidasi** + catatan verifikasi tampil.
5. Login sebagai **petani** lalu akses `/verifikasi` langsung → di-redirect ke
   `/dashboard` (dijaga middleware + RLS).
6. Tab **Tinggi Air**: pilih kecamatan + isi tinggi air → **Simpan**. Cek dashboard
   petani di district yang sama menampilkan nilai tinggi air terbaru.

## Demo Accounts (OTP: 123456)

| Role | Phone | Email Alias |
|------|-------|-------------|
| Petani 1 | 081234567890 | 6281234567890@otp.agriguard.id |
| Petani 2 | 081234567891 | 6281234567891@otp.agriguard.id |
| PPL | 081234567892 | 6281234567892@otp.agriguard.id |
| Dinas | 081234567893 | 6281234567893@otp.agriguard.id |

Poktan invite code: `DEMO01`

## Deployment

### Vercel (Web)

1. Connect repository to Vercel
2. Add environment variables
3. Deploy

### Hugging Face Spaces (AI Service)

1. Create new Space with Docker
2. Use `ai-service/Dockerfile`
3. Set `AI_API_URL` to the Space URL

## License

MIT