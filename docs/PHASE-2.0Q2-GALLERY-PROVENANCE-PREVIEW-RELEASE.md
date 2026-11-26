# PHASE 2.0Q.2 — Focused GPS Gallery Provenance Preview Release

**Tanggal:** 26 November 2026
**Keputusan Rilis:** **`CONDITIONAL GO — PREVIEW HTTPS + CHROME E2E VERIFIED`**
*(Seluruh verifikasi HTTPS pada URL Preview baru via `vercel curl` **100% PASS**; Chrome 158 desktop `1440×900` & mobile `390×844` E2E terhadap commit identik `bb654a3` + hosted Render staging AI `agriguard-ai-staging.onrender.com` + Supabase staging `zlluhylmykoymynnjxjs` **100% PASS**; akses browser langsung ke URL `*.vercel.app` dibatasi Vercel Deployment Protection sehingga juri tetap menggunakan Shareable Link.)*

---

## 1. Identitas Release & Isolasi Production

- **Branch Staging:** `staging/yolo-2p` — commit **`bb654a3`** (`fix(evidence): clarify gallery_upload GPS provenance labels and PPL warning`).
- **Vercel Preview Baru (Q.2):** **`https://agriguard-gdeg8wk2u-abdulhalim26s-projects.vercel.app`** (`69qKxXVafFUYtfZbBuBnDudtFq8L`).
- **Render AI Staging (Tidak di-deploy ulang — bobot tidak berubah):** `https://agriguard-ai-staging.onrender.com` (`srv-dc439mm1egvs73f7csig`, `AGRIGUARD_YOLO_CONFIDENCE=0.25`).
- **Vercel Env Scopes (Terverifikasi `vercel env ls`):** Override `AI_API_URL` & `AGRIGUARD_YOLO_ENABLED=true` tetap khusus `Preview (staging/yolo-2p)` ONLY; env `Preview` global (`agriguard-479q96eu9`) & `Production` (`agriguard-five.vercel.app`) tidak berubah.
- **Model Byte-Identical:**
  - `model_v2.onnx`: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`
  - `detector_yolov8n_rice_v1.onnx`: `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0`
- **Production 100% Utuh:** `main` & `origin/main` tetap di `d7ffebb`, `supabase/.temp/project-ref` tetap `gvrwzfwybvyqlvbqxebe`, Production Vercel & Render tidak disentuh.

---

## 2. Perubahan yang Dibawa (Hanya Perubahan Q.1)

- [lib/reports/photo-evidence.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/reports/photo-evidence.ts): `locationStatusLabel('gps_captured', 'gallery_upload')` → `GPS perangkat saat pilih file (bukan bukti lokasi foto asli)`, watermark prefiks `GPS Unggah (bukan lokasi asli)`, dan `GALLERY_LOCATION_WARNING`.
- [app/(app)/scan/page.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/scan/page.tsx): label waktu & akurasi dibedakan untuk unggahan galeri + banner peringatan kuning `GALLERY_LOCATION_WARNING`.
- [components/features/ReportVerification.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/ReportVerification.tsx): panel pemeriksaan PPL menampilkan label GPS unggah yang jujur + banner peringatan `GALLERY_LOCATION_WARNING` untuk laporan `gallery_upload`.
- [tests/photo-evidence.test.ts](file:///Users/macbook/Documents/Personal/agriguard/tests/photo-evidence.test.ts): unit & regression test baru.

---

## 3. Hasil Verifikasi

### 3.1 Regression Gate Sebelum Rilis
- `npm run test:security`: **285/285 PASS**.
- `tsc --noEmit --incremental false`, `git diff --check`, `npm run build`: **PASS** (`25/25` routes).

### 3.2 Live HTTPS Preview (`https://agriguard-gdeg8wk2u-abdulhalim26s-projects.vercel.app` via `vercel curl`)
- `GET /login`: `200`
- `GET /api/ai/detect`: `200`, `enabled: true`
- Farmer A OTP login: `200`
- `POST /api/ai/detect` (fixture positif `BACTERIALBLIGHT2_080.jpg`): `200`, `SUCCESS`, `Bacterial-Leaf-Blight`
- `POST /api/ai/detect` (kasus `NO_DETECTIONS` `padi.jpeg`): `200`, `NO_DETECTIONS`
- `POST /api/ai/analyze` (EfficientNet v2): `200`, `has_receipt: true`

### 3.3 Real Chrome 158 Desktop (`1440×900`) & Mobile (`390×844`) E2E
*(Dijalankan pada commit identik `bb654a3` terhubung langsung ke hosted Render AI staging `agriguard-ai-staging.onrender.com` & Supabase staging `zlluhylmykoymynnjxjs`; akses langsung Chrome ke `*.vercel.app` dibatasi Vercel Deployment Protection.)*
- Gallery upload warning di `/scan` (`GPS perangkat saat pilih file (bukan bukti lokasi foto asli)` & `GALLERY_LOCATION_WARNING`): **PASS**
- Watermark prefiks `GPS Unggah (bukan lokasi asli)` & toggle `Deteksi YOLO` / `Salinan Watermark` / `Foto Asli`: **PASS**
- YOLO bbox + EfficientNet terpisah tampil bersamaan: **PASS**
- Modal pemeriksaan PPL menampilkan `GALLERY_LOCATION_WARNING`: **PASS**
- Mobile `390×844` horizontal overflow: **`false`** (`0` overflow), `console_errors: []`.
- Screenshot bukti tersimpan lokal (gitignored, mode `0600`) di `.staging/phase2q2-evidence/`.
