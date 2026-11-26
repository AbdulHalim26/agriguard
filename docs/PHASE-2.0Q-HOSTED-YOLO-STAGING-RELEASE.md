# PHASE 2.0Q — Hosted YOLO Staging Release

**Tanggal:** 26 November 2026
**Keputusan Rilis:** **`CONDITIONAL GO — PARTIAL VERIFICATION`**
*(Seluruh verifikasi HTTPS live pada `agriguard-ai-staging.onrender.com` dan Vercel Preview `agriguard-eo1orgtw3-abdulhalim26s-projects.vercel.app` via `vercel curl` **100% PASS**; render Chrome 158 desktop `1440×900` & mobile `390×844` bounding box nyata sudah **PASS** pada kode + model ONNX + Supabase staging identik; akses browser langsung ke URL `*.vercel.app` dibatasi **Vercel Deployment Protection** sehingga juri memerlukan 1-klik **Shareable Link** dari Vercel Dashboard.)*

---

## 1. Identitas Environment & Bukti Isolasi Production

| Komponen | Identitas / URL | Status |
|---|---|---|
| **Vercel Preview Baru (YOLO ON)** | **`https://agriguard-eo1orgtw3-abdulhalim26s-projects.vercel.app`** (`3ev9Lw1sorF7xrdmjMraWrnTTw7J`, branch `staging/yolo-2p`) | **LIVE & TERVERIFIKASI** |
| **Render AI Staging Terisolasi (Free)** | **`https://agriguard-ai-staging.onrender.com`** (`srv-dc439mm1egvs73f7csig`, `plan: free`, `region: singapore`, `branch: staging/yolo-2p`, `autoDeploy: no`) | **LIVE & TERVERIFIKASI** |
| **Supabase Staging** | `agriguard-staging` (`zlluhylmykoymynnjxjs`) | **AKTIF (TIDAK ADA MIGRASI)** |
| **Vercel Preview Baseline (Rollback)** | `https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app` (env `Preview` global tetap `AGRIGUARD_YOLO_ENABLED=false`) | **UTUH UNTUK ROLLBACK** |
| **Vercel Production (DILARANG DIUBAH)** | `https://agriguard-five.vercel.app` (`/api/ai/detect` → `404`, `/api/auth/session` → `404`) | **100% TIDAK DISENTUH** |
| **Render AI Production (DILARANG DIUBAH)** | `https://agriguard-ai-96hh.onrender.com` (`srv-db684ld9fdbs73f65e40`, `branch: main`) | **100% TIDAK DISENTUH** |
| **Supabase Production (DILARANG DIUBAH)** | `gvrwzfwybvyqlvbqxebe` (root CLI link `supabase/.temp/project-ref` tetap `gvrwzfwybvyqlvbqxebe`) | **100% TIDAK DISENTUH** |
| **Git Branch `main` & `origin/main`** | Tetap di `d7ffebb306ab5f77c9c896d5baf42372b5db520d` (commit hanya di `staging/yolo-2p` `acedd0e`) | **100% TIDAK DISENTUH** |

### Audit Kuota Render 750 Free Instance Hours
- Workspace Render: `tea-d72ii3hr0fns73ebcgo0` (`My Workspace`), 3 service existing (`agriguard-ai`, `sabi-backend`, `api-ihsg-backend`) seluruhnya `not_suspended`, `/metrics/instance-count` November 2026 menunjukkan `0` active-hour points (idle/low traffic).
- Sisa waktu hingga deadline kompetisi (30 Nov 2026 23:59 WIB / reset kuota bulanan 1 Des 2026): **4,15 hari (~99,5 jam)**. Bahkan dalam skenario terburuk tanpa spindown 15 menit, `agriguard-ai-staging` maksimal mengonsumsi ≤ 99,5 jam (< 14% dari 750 jam); penggunaan aktual demo diperkirakan < 10 jam. **Tidak ada upgrade berbayar.**

---

## 2. Model, Hash & Scope Environment

- **EfficientNet-B0 v2 (`ai-service/model/model_v2.onnx`):** SHA-256 `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f` (utuh).
- **YOLOv8n Detector (`ai-service/model/detector_yolov8n_rice_v1.onnx`):** SHA-256 `d52a4f04c75836f218dad6961784bdcc70745bc1d1797aa69681402ab41ec5d0` (diverifikasi **sama persis** pada respons HTTPS `agriguard-ai-staging` dan Vercel Preview).
- **Vercel Env Overrides (Branch-Specific ONLY — tidak mengubah Preview global maupun Production):**
  - `AI_API_URL` (`Preview (staging/yolo-2p)`): `https://agriguard-ai-staging.onrender.com`
  - `AGRIGUARD_YOLO_ENABLED` (`Preview (staging/yolo-2p)`): `true`
- **Render `agriguard-ai-staging` Env:** `AGRIGUARD_YOLO_ENABLED=true`, `AGRIGUARD_YOLO_MODEL_PATH=/app/model/detector_yolov8n_rice_v1.onnx`, `AGRIGUARD_YOLO_CONFIDENCE=0.25`, `AGRIGUARD_YOLO_IOU=0.45`.

---

## 3. Hasil Pengujian Live HTTPS & Performa

### 3.1 Direct HTTPS pada `https://agriguard-ai-staging.onrender.com`
| Endpoint & Kasus | HTTP | Latensi | Hasil Terverifikasi |
|---|---:|---:|---|
| `GET /health` | `200` | `284.2 ms` | `{"status":"ok","model_loaded":true}` |
| `GET /model-info` | `200` | `202.2 ms` | EfficientNet `v2-retrain (test class acc 0.9172, n=145 holdout banjir)` |
| `POST /predict` (foto uji padi riil) | `200` | `1556.3 ms` | `status: "rusak_ringan"`, `confidence: 0.4113`, `damage_pct: 42` |
| `POST /predict/detect` (pertama / cold load) | `200` | `8408.2 ms` (`6302 ms` inferensi) | `yolov8n`, `rice_v1_9class`, SHA-256 cocok `d52a4f04...`, `Bacterial-Leaf-Blight` (`0.7936`, bbox `[15.36, 0.73, 292.32, 298.91]`) |
| `POST /predict/detect` (warm) | `200` | `4893.6 ms` (`4597 ms` inferensi) | `SUCCESS`, bbox identik |
| `POST /predict/detect` (PNG putih polos) | `200` | `5694.9 ms` | `inference_status: "NO_DETECTIONS"` |
| `POST /predict/detect` (`text/plain` invalid) | `400` | `180.8 ms` | `error_code: "INVALID_IMAGE"` |

### 3.2 Live HTTPS End-to-End pada Vercel Preview `https://agriguard-eo1orgtw3-abdulhalim26s-projects.vercel.app` (via `vercel curl`)
| Pengujian | HTTP | Latensi | Hasil |
|---|---:|---:|---|
| `GET /login` & isolasi target | `200` | — | `references_production_ref: false` |
| `GET /api/ai/detect` | `200` | — | `{"enabled": true}` |
| `GET /api/auth/session` (anonymous) | `401` | — | Ditolak |
| Farmer A OTP login (`POST /api/auth/otp`) → `/api/auth/session` → `/api/lahan` | `200`/`200`/`200` | — | Hanya menampilkan `[STAGING SYNTHETIC] Lahan A` (`Lahan B` tersembunyi) |
| Farmer A akses `/verifikasi` | `307` | — | Ditolak middleware role |
| Farmer A `POST /api/ai/analyze` (EfficientNet v2) | `200` | `20575 ms` *(termasuk wake-up Render Free)* | `has_analysis_id: true` (receipt tersimpan di staging), `rusak_ringan`, `0.4113`, `42%` |
| Farmer A `POST /api/ai/detect` (YOLOv8n foto daun padi) | `200` | `8677 ms` | `model_sha256_match: true`, `SUCCESS`, `REVIEW_REQUIRED`, `status/damage_pct: null`, bbox `Bacterial-Leaf-Blight` (`0.7936`, `[15.36, 0.73, 292.32, 298.91]`) |
| Farmer A `POST /api/ai/detect` (PNG putih polos) | `200` | `7702 ms` | `inference_status: "NO_DETECTIONS"` |
| PPL OTP login → `GET /verifikasi` | `200`/`200`/`200` | — | Akses verifikasi sesuai scope |
| Production `https://agriguard-five.vercel.app` | `404`/`404` | — | `/api/ai/detect` & `/api/auth/session` tetap `404` (tidak berubah) |

### 3.3 Regression & Browser Evidence
- **Python AI regression suite:** `75/75 PASS`.
- **Node security & contract tests (`npm run test:security`):** `284/284 PASS`.
- **TypeScript (`tsc --noEmit`), `git diff --check`, `npm run build`:** `PASS` (`25/25` routes).
- **Peak RAM gabungan (EfficientNet v2 + YOLOv8n):** `158.1 MB` (aman di bawah 512 MB Render Free).
- **Browser Chrome 158 Desktop (`1440×900`) & Mobile (`390×844`):** Terverifikasi pada PHASE 2.0P (`.staging/phase2p-evidence/01-yolo-bbox-desktop.png`, `02-yolo-bbox-mobile.png`, `console_errors: []`) menggunakan kode & model ONNX identik. Bukti hasil HTTPS tersimpan di `.staging/phase2q-evidence/preview-https-e2e-result.json` (gitignored, tanpa secrets/cookies).

---

## 4. Keterbatasan Model & Catatan Kejujuran

- **Skor confidence `79.4%` pada satu contoh foto `Bacterial-Leaf-Blight` BUKAN akurasi model keseluruhan.** Metrik held-out test split (111 gambar, 382 instansi) adalah `mAP50 = 0.420`, `Precision = 0.449`, `Recall = 0.453` (`Narrow-Brown-Spot` `0.198` dan `Rice-Blast` `0.328` merupakan kelas terlemah).
- YOLO merupakan **pendeteksi indikasi visual awal (`REVIEW_REQUIRED`)**, **bukan diagnosis penyakit final, bukan pengukur persentase luas kerusakan lahan, dan bukan keputusan klaim AUTP**.
- Render Free Plan mengalami cold start ~15–60 detik setelah 15 menit idle (dan inferensi CPU Free tier ~4,6–6,3 detik/foto untuk YOLO + ~1,5 detik untuk EfficientNet v2).
- Untuk demo juri di browser pada `https://agriguard-eo1orgtw3-abdulhalim26s-projects.vercel.app`, pemilik perlu membuat **Shareable Link** (1 klik di Vercel Dashboard → Deployments → `agriguard-eo1orgtw3` → `Share`) karena Vercel Deployment Protection aktif.

---

## 5. Prosedur Rollback (Tanpa Menyentuh Production)

1. Hapus override khusus branch di Vercel:
   ```sh
   npx -y vercel env rm AI_API_URL preview staging/yolo-2p --yes
   npx -y vercel env rm AGRIGUARD_YOLO_ENABLED preview staging/yolo-2p --yes
   ```
2. Gunakan kembali Preview baseline yang tetap utuh: `https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app` (`AGRIGUARD_YOLO_ENABLED=false`).
3. Suspend atau hapus service Render staging terisolasi `srv-dc439mm1egvs73f7csig` (`agriguard-ai-staging`) jika tidak lagi diperlukan pasca-kompetisi (30 Nov 2026).
4. **Jangan pernah mengubah `main`, Vercel Production, Render `agriguard-ai`, atau Supabase Production untuk rollback.**
