# PHASE 2.0Q — Hosted YOLO Staging Release (Preflight & Isolation Gate)

**Tanggal:** 26 November 2026
**Keputusan Rilis:** **`NO-GO — RELEASE BLOCKED (MENUNGGU PERSETUJUAN BRANCH STAGING & RESOURCE AI STAGING TERISOLASI)`**
**Production (`agriguard-five.vercel.app`, `gvrwzfwybvyqlvbqxebe`, `agriguard-ai-96hh.onrender.com`):** **100% TIDAK DISENTUH / BYTE- & CONFIG-IDENTICAL.**
**Vercel Preview Baseline (`agriguard-479q96eu9-abdulhalim26s-projects.vercel.app`):** **100% TIDAK DIUBAH.**

---

## 1. Hasil Preflight Read-Only (Section 3)

### 1.1 Identitas Vercel Project & Pemisahan Environment
- **Project:** `agriguard` (`prj_mEWCELsO7CzufJMuOfqioGkg6xwX`, owner `abdulhalim26s-projects`).
- **Production (DILARANG DIUBAH):** `https://agriguard-five.vercel.app` (`agriguard-3sjnoldp3-abdulhalim26s-projects.vercel.app`, 32d ago).
  - Env scope `Production` ONLY (7 variabel): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OTP_MODE`, `AI_API_URL`, `OPENWEATHER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.
- **Preview Existing (Baseline Rollback):** `https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app` (Ready, 18h ago).
  - Env scope `Preview` ONLY (9 variabel): `EWS_DEMO_ENABLED`, `AGRIGUARD_YOLO_ENABLED`, `AUTH_PHONE_OTP_ENABLED`, `AI_API_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `AGRIGUARD_STAGING_PROJECT_REF`, `AGRIGUARD_ENVIRONMENT`.
  - `AI_API_URL` Preview saat ini masih menunjuk ke `https://agriguard-ai-96hh.onrender.com` (shared Render EfficientNet v2) dengan `AGRIGUARD_YOLO_ENABLED=false`.

### 1.2 Audit Service Render (Live API Read-Only)
Dari `GET https://api.render.com/v1/services`, **hanya ada 1 service AgriGuard di Render**:

| Service ID | Nama | Repo / Branch | Plan / Region | Runtime | URL | Klasifikasi |
|---|---|---|---|---|---|---|
| `srv-db684ld9fdbs73f65e40` | `agriguard-ai` | `AbdulHalim26/agriguard` (`main`) | `free` / `singapore` | `docker` | `https://agriguard-ai-96hh.onrender.com` | **PRODUCTION-CRITICAL (SHARED) — DILARANG DIUBAH** |

*(Dua service lain di akun Render adalah proyek terpisah: `sabi-backend` dan `api-ihsg-backend`.)*
**Hasil audit isolasi:** **Belum ada service AI staging terpisah** di Render.

### 1.3 Kesiapan Artefak & Kebutuhan Memori (RAM/CPU)
- **EfficientNet-B0 v2 (`ai-service/model/model_v2.onnx`):** `16.0 MB`, SHA-256 `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f` (utuh).
- **YOLOv8n Detector (`ai-service/model/detector_yolov8n_rice_v1.onnx`):** `12.2 MB`, SHA-256 `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0` + `detector_yolov8n_rice_v1.metadata.json` (utuh).
- **Uji Beban Memori Gabungan (EfficientNet v2 + YOLOv8n bersamaan di `ai-service/.venv`):**
  - Load EfficientNet v2: `14.8 ms`
  - Load YOLOv8n ONNX: `20.8 ms`
  - Inferensi nyata keduanya pada foto daun padi: EfficientNet `rusak_ringan` (`0.4113`), YOLO `1` deteksi (`45.1 ms`)
  - **Peak RSS:** **`158.1 MB`** — sangat aman untuk batas **512 MB** Render Free Plan (tersisa >350 MB headroom).
- **Dockerfile (`ai-service/Dockerfile`):** Sudah minimal (`python:3.11-slim`, hanya menyalin `requirements.txt`, `main.py`, `predict.py`, `detection/`, `model/` — tidak menyertakan dataset 1.107 gambar, checkpoint training, `.staging/`, maupun secrets).

---

## 2. Alasan Penghentian (`NO-GO — RELEASE BLOCKED`)

Sesuai aturan keamanan PHASE 2.0Q (Section 4 & Section 6), eksekusi **dihentikan sebelum membuat perubahan cloud atau Git** karena terdapat dua syarat otorisasi tambahan yang belum diberikan:

1. **Belum ada service AI staging terpisah:** Menggunakan `https://agriguard-ai-96hh.onrender.com` untuk YOLO dilarang karena dipakai Production (`agriguard-five.vercel.app`), dan membuat service Render baru memerlukan keputusan pemilik terkait resource/plan baru.
2. **Render Docker service menarik kode dari branch Git (atau registry), sedangkan commit/push dilarang tanpa persetujuan terpisah:**
   - Mendorong perubahan ke `main` **TIDAK BOLEH** dilakukan karena akan memicu auto-deploy pada **Vercel Production (`agriguard-five.vercel.app`)** dan **Render Production (`agriguard-ai-96hh.onrender.com`)**.
   - Untuk mendeploy `agriguard-ai-staging` secara terisolasi 100%, diperlukan **branch khusus staging** (misalnya `staging/yolo-2p`) yang hanya berisi `ai-service/` + perubahan kode staging dan **tidak menyentuh `main`**.

---

## 3. Opsi Keputusan Konkret untuk Pemilik Proyek

### Opsi A (Direkomendasikan — 100% Gratis & Terisolasi Penuh di Render + Vercel Preview)
Berikan persetujuan eksplisit untuk 3 langkah berikut:
1. **Branch Git terisolasi (bukan `main`):** Buat branch `staging/yolo-2p` dari `HEAD`, commit perubahan PHASE 2.0P + `detector_yolov8n_rice_v1.onnx` (`12.2 MB`) + metadata, lalu `git push origin staging/yolo-2p` (`main` tetap di `d7ffebb`, Production Vercel & Render 100% tidak terpicu).
2. **Service Render Staging Terisolasi (Free Plan, $0):** Buat web service baru `agriguard-ai-staging` (`plan: free`, `region: singapore`, `env: docker`, `rootDir: ai-service`, `branch: staging/yolo-2p`) dengan env:
   - `AGRIGUARD_YOLO_ENABLED=true`
   - `AGRIGUARD_YOLO_MODEL_PATH=/app/model/detector_yolov8n_rice_v1.onnx`
   - `AGRIGUARD_YOLO_CONFIDENCE=0.25`
   - `AGRIGUARD_YOLO_IOU=0.45`
   *(Catatan Free Plan Render: cold start ~30–60 detik setelah 15 menit idle; peak RAM 158 MB aman di bawah 512 MB.)*
3. **Update Vercel Preview ONLY:** Arahkan `AI_API_URL` (scope `Preview` ONLY) ke URL `https://agriguard-ai-staging-xxxx.onrender.com`, set `AGRIGUARD_YOLO_ENABLED=true` (scope `Preview` ONLY), deploy Preview baru (tanpa `--prod`), lalu jalankan uji HTTPS + Chrome desktop/mobile E2E penuh.

### Opsi B (Alternatif — Hugging Face Spaces Free CPU untuk AI Staging)
- Menggunakan repository HF Space terpisah (terlihat ada folder lokal `agriguard-hf-space` sebelumnya) sebagai AI staging terisolasi jika Anda tidak ingin menambah service Free ke-4 di akun Render, lalu hubungkan `AI_API_URL` Vercel Preview ke URL HF Space staging tersebut.

---

## 4. Baseline Rollback Tersimpan

Snapshot konfigurasi read-only (tanpa secrets) telah disimpan di `.staging/phase2q-rollback/preflight-snapshot.json` (gitignored). Karena belum ada perubahan yang dilakukan pada Render, Vercel Preview, Vercel Production, maupun Supabase, seluruh lingkungan masih berada pada kondisi baseline yang terverifikasi.
