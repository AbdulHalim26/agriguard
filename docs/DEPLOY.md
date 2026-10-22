# Deployment AgriGuard

Dokumen ini mencatat konfigurasi produksi, cara re-deploy, dan catatan operasional.

## URL Produksi

| Komponen | URL |
|---|---|
| Web (Vercel) | https://agriguard-five.vercel.app |
| AI service (Render) | https://agriguard-ai-96hh.onrender.com |
| Vercel dashboard | https://vercel.com/abdulhalim26s-projects/agriguard |
| Render dashboard | https://dashboard.render.com/web/srv-db684ld9fdbs73f65e40 |

Arsitektur: **Vercel (Next.js web)** memanggil **Render (FastAPI + ONNX model)** via
server-side env `AI_API_URL`. Database & storage di Supabase. Cuaca dari OpenWeather.

## Web — Vercel

- Framework: **Next.js** (project `agriguard`, scope team `abdulhalim26s-projects`).
- Runtime: **Node.js 24 LTS** (`engines.node: ^24.22.1` di `package.json`).
  Lokal memakai patch **24.22.1** dari `.nvmrc`. Vercel memilih major 24 dan
  mengelola rollout minor/patch secara otomatis; versi patch produksi dapat
  diperiksa lewat `node -v` di build log.
- Auto-deploy aktif: push ke branch `main` memicu build dan deploy produksi.
- Environment Variables (Production) — nilai di-set di dashboard/CLI, tidak di repo:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENWEATHER_API_KEY`
  - `AI_API_URL` = `https://agriguard-ai-96hh.onrender.com`
  - `OTP_MODE` = `mock`
  - `NEXT_PUBLIC_APP_URL` = `https://agriguard-five.vercel.app`
- `next.config.js`: `images.remotePatterns` sudah mengizinkan `*.supabase.co` dan
  `serverActions.bodySizeLimit = '5mb'`.
- `NEXT_PUBLIC_*` bersifat build-time: setelah mengubahnya, **wajib redeploy**.

## AI service — Render

- Blueprint: `render.yaml` (di root repo) — Web Service Docker, plan **free**,
  region **singapore**, health check `/health`, `PORT=8000`.
- Build context: `./ai-service` (Dockerfile `./ai-service/Dockerfile`).
- Model: `ai-service/model/model.onnx` (EfficientNet-B0, ~16 MB) ikut ter-commit di git.
- Endpoint: `GET /health`, `GET /model-info`, `POST /predict` (multipart `image`).
- Auto-deploy aktif: `autoDeploy: true` → push ke `main` memicu build dan deploy Render.
- Verifikasi cepat:
  ```bash
  curl https://agriguard-ai-96hh.onrender.com/health          # {"status":"ok","model_loaded":true}
  curl https://agriguard-ai-96hh.onrender.com/model-info
  ```
- Dockerfile menghormati `$PORT` (`uvicorn ... --port ${PORT:-8000}`) sehingga cocok
  di Render maupun lokal.

### Cold start & keep-alive

- Render free **tidur setelah ~15 menit tanpa trafik**; request pertama butuh ±30–60s
  (bangun container + load model ONNX).
- Frontend sudah punya timeout 15s + fallback "Lapor Manual", jadi scan pertama
  setelah idle bisa jatuh ke laporan manual.
- **Keep-alive:** ping `GET /health` berkala (tiap 5–10 menit) via **UptimeRobot**
  (setup manual di akun UptimeRobot) agar service tidak tidur.

### Catatan: kenapa bukan Hugging Face Spaces

Rencana awal men-deploy AI ke HF Spaces (Docker). Per pertengahan 2026, HF
mewajibkan **PRO ($9/bln)** untuk Gradio/Docker Spaces (hanya Static yang gratis),
sehingga dipilih **Render free** sebagai gantinya. File `ai-service/README.md`
masih memuat frontmatter Space HF (tidak dipakai lagi; bisa diabaikan).

## Re-deploy ringkas

Sebelum push, verifikasi dengan runtime proyek:
```bash
nvm install
nvm use
npm ci
npm run audit:prod
npm run build
```

Setelah perubahan di-commit, deploy web dan AI dipicu otomatis:
```bash
git push origin main
```

## Testing manual yang disarankan (browser/HP)

1. **Login seed** — buka https://agriguard-five.vercel.app/login, login pakai akun
   seed (OTP mode `mock`, kode `123456`). Cek redirect ke `/dashboard`.
2. **Scan kamera di HP** — buka `/scan` di HP, izinkan kamera, foto daun padi,
   submit → cek hasil AI (atau "Menunggu Analisis AI" bila offline).
3. **Offline sync** — matikan koneksi, buat laporan (antrean indexDB), nyalakan
   kembali → laporan ter-sync otomatis (atau via widget Sync).
