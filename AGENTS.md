# AGENTS.md — AgriGuard

## Alur kerja commit & deploy (preferensi pemilik proyek)

- **Perubahan file manual → langsung commit & push tanpa perlu tanya.**
  Jika ada file (baru atau berubah) yang diubah secara manual di working tree,
  stage file tersebut, commit dengan pesan gaya repo (conventional commits:
  `fix:`, `chore(...):`, `docs:`, `feat(...):`), lalu `git push origin main`.
- **Auto-deploy aktif di kedua platform** — push ke `main` otomatis memicu build
  & deploy:
  - **Vercel** (web): project `agriguard`, production branch `main`.
  - **Render** (AI service): service `agriguard-ai`.
  Jadi tidak perlu `vercel --prod` manual lagi.
- **Jangan commit rahasia.** `.env` sudah di-`.gitignore`; jangan pernah tampilkan
  nilai secret di chat. Baca kredensial dari file (mis.
  `~/.config/agriguard/render_api_key`, auth Vercel CLI).
- Untuk perubahan besar/berisiko (refactor luas, ubah skema DB, hapus data),
  tetap jelaskan rencana dulu sebelum commit.

## Build & verifikasi

- `npm run build` (Next.js) harus sukses sebelum push; build juga menjalankan
  type-check. `/dashboard` sengaja dynamic (`DYNAMIC_SERVER_USAGE`) — bukan error.
- `npm run lint` belum dikonfigurasi (repo tanpa config ESLint).
- AI service: `ai-service/.venv/bin/uvicorn main:app --app-dir ai-service --port 8000`.
  Kernel kontrak `/predict` tidak boleh berubah (status, confidence, damage_pct).
