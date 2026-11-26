# PHASE 2.0O — YOLO Artifact Recovery & Integration Audit

**Tanggal:** 26 November 2026
**Keputusan:** **`NO-GO / BLOCKED ON MISSING TRAINED RICE YOLO CHECKPOINT`**
**Status YOLO Flag:** Tetap **`OFF` (`AGRIGUARD_YOLO_ENABLED=false`)** — tidak ada bounding box dummy, tidak ada pelatihan otomatis, dan tidak ada perubahan pada EfficientNet-B0 v2, staging (`zlluhylmykoymynnjxjs`), maupun production (`gvrwzfwybvyqlvbqxebe`).

---

## 1. Semua Lokasi Kandidat Artefak yang Ditemukan

Audit menyeluruh dilakukan pada repository `/Users/macbook/Documents/Personal/agriguard` (termasuk direktori tersembunyi/ignored) serta direktori lokal terkait (`/Users/macbook/Documents`, `/Users/macbook/Downloads`, `/Users/macbook/Desktop`, `/Users/macbook/.cache`, `/Users/macbook/runs`, `~/.config/Ultralytics`, `~/Library/Application Support/Ultralytics`).

| Lokasi | Klasifikasi | Detail & SHA-256 | Layak untuk Detector Padi AgriGuard? |
|---|---|---|---|
| `/Users/macbook/Documents/agriguard-datasets/raw/rice-v1/` | **Kategori A — Dataset Roboflow YOLO saja (BUKAN model/checkpoint)** | Export Roboflow Universe `ricedisease-zwll3/rice_leaf_disease_detector` v1 (`CC BY 4.0`, 26 Mei 2025), `data.yaml` (`nc: 9`), `1.107` gambar (`776` train / `220` valid / `111` test; README mencatat `1.143`). ZIP SHA-256 tercatat: `f63259c3acac0ec059edc42ad478e1a4b29e6c69f3304b00f2cb3f6dd0c1543a`. | **TIDAK** — hanya dataset mentah + folder QA offline (`rice-v1-qa-1b003`, `rice-v1-review-1b004`, `rice-v1-review-1b004a`) yang review-nya masih pending. |
| `ai-service/model/model_v2.onnx` | **EfficientNet-B0 v2 Classifier (BUKAN YOLO)** | `torchvision.efficientnet_b0`, 3 kelas kerusakan visual (`224×224` → `logits`). SHA-256: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`. | **TIDAK** — classifier gambar penuh untuk `/predict`, bukan detector bounding box. |
| `/Users/macbook/Downloads/model_v2.onnx` | **Salinan identik EfficientNet-B0 v2** | SHA-256 identik: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`. | **TIDAK** — file yang sama dengan `ai-service/model/model_v2.onnx`. |
| `ai-service/model/model.onnx` & `../agriguard-hf-space/model/model.onnx` | **EfficientNet v1 Classifier lama (BUKAN YOLO)** | SHA-256 identik: `beb8f95c353f74cd9d3b85e5092987635206a05f671a20f54700e5c65914b8ce`. | **TIDAK** — classifier v1 lama. |
| `ai-service/model/model.safetensors` | **EfficientNet v1 PyTorch/HF weights** | Bobot classifier v1. | **TIDAK** — bukan detector YOLO. |
| `/Users/macbook/Documents/Personal/projekcnc/Python/waste_model/weights/{best,last}.pt` | **Checkpoint YOLO proyek lain (BUKAN AgriGuard/padi)** | Model deteksi limbah/sampah milik proyek `projekcnc`. | **TIDAK** — domain dan proyek berbeda. |
| `best.pt` / `last.pt` / `*.onnx` YOLO padi & `results.csv` / `args.yaml` | **TIDAK DITEMUKAN (0 file)** | Tidak ditemukan di repo, git history/branch/stash, Downloads, Documents, Desktop, maupun cache Ultralytics. | **BLOCKER UTAMA** |

---

## 2. Bukti Apakah YOLO Benar-Benar Sudah Dilatih

**Kesimpulan faktual: Belum ada bukti bahwa model YOLO padi AgriGuard pernah dilatih atau diekspor di mesin lokal maupun repository ini.**

Bukti pendukung:
1. Tidak ada file checkpoint `.pt`, `.pth`, `.onnx`, `.engine`, atau `.tflite` untuk detector padi.
2. Tidak ada artefak hasil training (`args.yaml`, `results.csv`, `results.png`, confusion matrix, atau log evaluasi holdout) untuk YOLO padi.
3. Di `ai-service/training/yolo/sources/rice-v1.archive-evidence.json`, status dataset masih `license_approved: false`, `annotations_approved: false`, `conversion_approved: false`.
4. Di `ai-service/.venv`, paket runtime yang terpasang hanya untuk serving ONNX:
   - Terpasang: `onnxruntime`, `numpy`, `PIL`, `fastapi`.
   - Tidak terpasang: `torch`, `ultralytics`, `onnx`, `roboflow`.
5. `git branch -a`, `git stash list`, dan riwayat commit `main` hanya berisi pipeline training EfficientNet v2 (`colab_training.ipynb`) dan fondasi detector/QA YOLO (PHASE 1A & 1B.0), tanpa checkpoint YOLO terlatih.

---

## 3. Dataset, Versi, Kelas, Hash Model, dan Metrik yang Dapat Dibuktikan

- **Dataset Roboflow lokal (`raw/rice-v1`):**
  - Workspace / Project: `ricedisease-zwll3/rice_leaf_disease_detector` versi `1` (`https://universe.roboflow.com/ricedisease-zwll3/rice_leaf_disease_detector/dataset/1`)
  - Lisensi tertera: `CC BY 4.0` (hak unggah & QA anotasi belum di-approve)
  - Jumlah kelas (`nc: 9`): `Bacterial-Leaf-Blight`, `Brown-Spot`, `False-Smut`, `Healthy`, `Narrow-Brown-Spot`, `Rice-Blast`, `Sheath-Blight`, `Stem-Rot`, `Tungro-Virus`
  - Jumlah gambar aktual di folder: `776` train, `220` valid, `111` test (total `1.107`; selisih dengan README `1.143` sudah dicatat di `rice-v1.archive-evidence.json`)
  - **Catatan pemetaan taksonomi:** AgriGuard memakai 6 kelas kanonis (`leaf_blast`, `bacterial_leaf_blight`, `brown_spot`, `sheath_blight`, `tungro_symptom`, `leaf_folder_damage`). Kelas `Healthy`, `False-Smut`, `Stem-Rot`, dan `Narrow-Brown-Spot` tidak boleh dipetakan otomatis sebagai kelas penyakit kanonis.
- **Hash model yang ada saat ini (EfficientNet saja):**
  - `ai-service/model/model_v2.onnx`: `76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f`
  - `ai-service/model/model.onnx`: `beb8f95c353f74cd9d3b85e5092987635206a05f671a20f54700e5c65914b8ce`
- **Metrik deteksi YOLO (mAP / precision / recall):** **TIDAK TERSEDIA / UNVERIFIED** (tidak ada evaluasi maupun checkpoint detector; tidak ada angka yang dikarang).

---

## 4. File Source yang Diubah

**Tidak ada file kode aplikasi yang diubah pada PHASE 2.0O** karena tidak ditemukan checkpoint detector padi yang valid. Hanya laporan audit ini (`docs/PHASE-2.0O-YOLO-ARTIFACT-RECOVERY-AND-INTEGRATION.md`) yang ditambahkan.

Fondasi kode YOLO existing yang sudah teraudit dan siap menerima artefak `.onnx` + `.metadata.json` begitu checkpoint tersedia:
- FastAPI: [ai-service/main.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/main.py) (`POST /predict/detect`), [ai-service/detection/adapter.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/adapter.py), [ai-service/detection/contracts.py](file:///Users/macbook/Documents/Personal/agriguard/ai-service/detection/contracts.py)
- Next.js proxy: [app/api/ai/detect/route.ts](file:///Users/macbook/Documents/Personal/agriguard/app/api/ai/detect/route.ts), [lib/detection-server.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/detection-server.ts), [lib/detection.ts](file:///Users/macbook/Documents/Personal/agriguard/lib/detection.ts)
- Scanner UI: [app/(app)/scan/page.tsx](file:///Users/macbook/Documents/Personal/agriguard/app/(app)/scan/page.tsx), [components/features/DetectionOverlay.tsx](file:///Users/macbook/Documents/Personal/agriguard/components/features/DetectionOverlay.tsx)

---

## 5. Hasil Inferensi dan Bounding Box Nyata

- **Inferensi detector YOLO pada foto padi riil:** **BELUM DAPAT DIJALANKAN** (blocked — tidak ada checkpoint detector `.pt`/`.onnx` untuk padi).
- **Inferensi ONNX Runtime pada synthetic test graph (`test_detection.py`):** **PASS** (membuktikan adapter ONNX Runtime, letterbox inverse, class-aware NMS, `end2end_xyxy`, dan validasi checksum/metadata berfungsi secara mekanis, bukan prediksi penyakit padi).
- **Inferensi EfficientNet-B0 v2 (`/predict`):** **PASS** (teruji pada `test_legacy_predict_still_runs_real_existing_classifier`).

---

## 6. Hasil Tes serta Build

- Python AI regression tests (`PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v`): **73/73 PASS** (`2.268s`).
- Node security & contract tests (`npm run test:security`, terverifikasi pada working tree identik sebelum laporan ini): **281/281 PASS**.
- TypeScript no-emit (`./node_modules/.bin/tsc --noEmit --incremental false`), `git diff --check`, dan `npm run build`: **PASS** (0 error, 25/25 routes).

---

## 7. Status Integrasi Lokal dan Browser

- **EfficientNet-B0 v2 + Scanner + Geotag Watermark + Offline Sync + PPL Verification + AUTP PDF:** **READY & VERIFIED** (PHASE 2.0K–2.0N).
- **YOLO Bounding Box Overlay di Browser:** **TERPASANG SECARA KODE, TETAPI NONAKTIF (`AGRIGUARD_YOLO_ENABLED=false`)** karena belum ada checkpoint detector padi yang valid. Endpoint `/predict/detect` dan `/api/ai/detect` fail-closed dengan status `UNAVAILABLE` tanpa mengganggu scanner.

---

## 8. Hal yang Masih Menghalangi Aktivasi & Opsi Pemulihan

### Blocker Nyata
1. **Belum ada checkpoint YOLO padi terlatih** (`best.pt` atau `.onnx` + `.metadata.json`) di repo maupun direktori lokal.
2. **Dataset lokal `raw/rice-v1` masih berstatus mentah** (`9` kelas termasuk `Healthy`/`False-Smut`/`Stem-Rot`/`Narrow-Brown-Spot`, belum selesai QA review).
3. **Toolchain training/export (`torch`, `ultralytics`, `onnx`) belum terpasang** di `ai-service/.venv`.

### Opsi Tindakan untuk Pemilik Proyek
1. **Opsi 1 — Pulihkan checkpoint dari Google Colab / Google Drive / akun Roboflow pribadi (Tercepat jika sudah pernah dilatih):**
   - Jika `best.pt` atau `best.onnx` hasil training sebelumnya tersimpan di Google Drive, Colab, atau workspace Roboflow pribadi Anda, unduh file `.pt`/`.onnx` (beserta `data.yaml` / `args.yaml` / `results.csv` bila ada) ke folder lokal, lalu berikan path-nya agar saya langsung menjalankan **VALIDASI → EXPORT ONNX → INTEGRASI → TEST E2E**.
2. **Opsi 2 — Training terkontrol di Google Colab (GPU) atau Mac M1 dari dataset `raw/rice-v1`:**
   - Memerlukan persetujuan eksplisit Anda untuk memulai training (sesuai aturan keamanan) serta keputusan ruang lingkup kelas dari `raw/rice-v1` (misalnya melatih dengan 5 kelas penyakit yang cocok dengan taksonomi AgriGuard dan memisahkan `Healthy` sebagai background). Setelah `best.pt` selesai dilatih dan diekspor ke ONNX + `.metadata.json`, seluruh fondasi FastAPI + Next.js + `DetectionOverlay` langsung dapat diaktifkan dan diuji E2E.
3. **Opsi 3 — Roboflow Hosted Inference API (Tidak disarankan untuk produksi tanpa evaluasi):**
   - Proyek publik `ricedisease-zwll3/rice_leaf_disease_detector/1` dapat diakses lewat Roboflow Hosted Inference API apabila Anda menyediakan `ROBOFLOW_API_KEY` dan menyetujui penggunaan jaringan eksternal/kuota; namun model tersebut adalah milik pihak ketiga (`nc: 9`, belum diverifikasi akurasinya terhadap domain AgriGuard) dan tidak menyediakan checkpoint lokal ber-SHA-256.

---

## 9. Langkah Deployment Staging Preview (Setelah Checkpoint Valid & Persetujuan Terpisah)

1. Simpan artefak detector tervalidasi (`<model>.onnx` + `<model>.metadata.json` dengan `purpose != "synthetic_test"` dan SHA-256 cocok) ke service AI (`agriguard-ai` di Render atau storage artefak yang disetujui).
2. Atur environment server-only **di kedua layanan** (Render AI service + Vercel Preview staging saja, bukan production):
   - `AGRIGUARD_YOLO_ENABLED=true`
   - `AGRIGUARD_YOLO_MODEL_PATH=/path/to/<model>.onnx` (khusus Render AI service)
   - `AGRIGUARD_YOLO_CONFIDENCE=0.25` dan `AGRIGUARD_YOLO_IOU=0.45` (sesuai kalibrasi validasi)
3. Verifikasi `GET /api/ai/detect` → `{"enabled": true}`, `POST /api/ai/detect` mengembalikan bounding box nyata dengan `inference_status: "SUCCESS" | "NO_DETECTIONS"`, dan pastikan `POST /predict` (EfficientNet v2) serta seluruh alur laporan & verifikasi PPL tetap lulus E2E.
