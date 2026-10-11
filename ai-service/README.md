---
title: AgriGuard AI Scanner
emoji: 🌾
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 8000
pinned: false
---

# AgriGuard AI Scanner (Rice Leaf Disease)

Layanan klasifikasi foto daun padi untuk AgriGuard. Mengubah foto menjadi 3 kelas
status kerusakan: `aman`, `rusak_ringan`, `rusak_berat`.

## Model

| | |
|---|---|
| Nama | `SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft` |
| Arsitektur | EfficientNet-B0 (fine-tune dari `google/efficientnet-b0`) |
| Format runtime | ONNX (`model/model.onnx`, ~16 MB) via `onnxruntime` (tanpa torch) |
| Akurasi evaluasi (penulis) | 0.9128 (8 kelas) |
| Lisensi | Apache-2.0 |
| Sumber | https://huggingface.co/SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft |

### 8 kelas model → 3 status AgriGuard (`LABEL_TO_STATUS`)

| Label model | Status |
|---|---|
| Healthy Rice Leaf | `aman` |
| Brown Spot | `rusak_ringan` |
| Narrow Brown Leaf Spot | `rusak_ringan` |
| Leaf scald | `rusak_ringan` |
| Leaf Blast | `rusak_berat` |
| Bacterial Leaf Blight | `rusak_berat` |
| Sheath Blight | `rusak_berat` |
| Rice Hispa | `rusak_berat` |

`damage_pct` diturunkan deterministik dari confidence: `aman` 0–15, `rusak_ringan`
30–60, `rusak_berat` 60–95.

### Preprocessing

Resize RGB 224×224 (BICUBIC), rescale `/255`, normalize mean `[0.485,0.456,0.406]`,
std `[0.229,0.224,0.225]`. Nilai std ini divalidasi **cocok persis** dengan
`EfficientNetImageProcessor` (`transformers`) pada gambar nyata, dan memberi akurasi
label lebih tinggi (0.67 vs 0.50 pada 18 gambar berlabel Project-AgML). Catatan:
`preprocessor_config.json` menyimpan `image_std=0.4785…` (nilai kuadrat) — yang
dipakai model adalah `0.229/0.224/0.225`.

## Endpoints

| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | `{"status":"ok","model_loaded":true}` — selalu 200 selama service hidup |
| POST | `/predict` | multipart `image` (JPG/PNG, ≤5 MB) → `{status,confidence,damage_pct}` |
| GET | `/model-info` | metadata model (nama, versi, mapping, akurasi, status load) |

Kontrak `/predict` **tidak berubah**: `status` ∈ {`aman`,`rusak_ringan`,`rusak_berat`},
`confidence` 0–1, `damage_pct` 0–100. Model gagal dimuat → HTTP **503** (frontend
menawarkan "Lapor Manual"). Input tidak valid → 400.

## Run Lokal

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Lalu set `AI_API_URL=http://localhost:8000` di `.env` (server-only).

## Tes

```bash
curl http://localhost:8000/health
# {"status":"ok","model_loaded":true}

curl -X POST http://localhost:8000/predict -F "image=@tests/samples/sample_aman.jpg"
# {"status":"aman","confidence":0.9973,"damage_pct":0}

curl -X POST http://localhost:8000/predict -F "image=@tests/samples/sample_rusak_ringan.jpg"
# {"status":"rusak_ringan","confidence":0.9988,"damage_pct":60}

curl -X POST http://localhost:8000/predict -F "image=@tests/samples/sample_rusak_berat.jpg"
# {"status":"rusak_berat","confidence":0.9845,"damage_pct":94}
```

Evaluasi mandiri (42 gambar berlabel dari dataset publik `Project-AgML/rice_leaf_
disease_classification`): **akurasi kelas 73.8%**, **akurasi status 78.6%**.

## Konversi ONNX (`tools/`)

Sekali jalan, butuh `torch` + `transformers` (bukan dependency runtime):

```bash
python tools/export_onnx.py     # safetensors -> model/model.onnx
python tools/verify_onnx.py     # cek ONNX == torch (max|diff| ~1e-6)
```

## Deploy ke Hugging Face Spaces (Docker)

1. Buat Space baru: **SDK = Docker**, hardware = **CPU basic (free)**.
2. Upload isi folder `ai-service/` (termasuk `Dockerfile`, `main.py`, `predict.py`,
   `requirements.txt`, dan `model/model.onnx`). Frontmatter di README ini telah
   disetel `sdk: docker` + `app_port: 8000`.
3. Space akan build & jalankan `uvicorn main:app --host 0.0.0.0 --port 8000`.
4. Salin URL Space (mis. `https://<user>-<space>.hf.space`) ke `AI_API_URL` di Vercel.

### Cold start (free tier) & keep-alive

- Space free tier **tidur setelah ~48 jam tanpa trafik**; bangunnya butuh ±30–60s
  (pull image + load model). Endpoint `/api/ai/analyze` di frontend sudah punya
  timeout 15s + fallback "Lapor Manual", tetapi untuk menghindari sleep:
- **Keep-alive**: ping `GET /health` berkala (mis. cron/UptimeRobot tiap 10 menit).
  `/health` lalu `{"status":"ok"}` dan TIDAK memuat model ulang bila sudah siap.
- Saat cold start, request pertama bisa **503/timeout** → frontend otomatis
  menawarkan laporan manual (graceful degradation, bukan error keras).

> Catatan: service di-*smoke-test* dengan uvicorn lokal di atas; deploy HF Spaces
> mengikuti langkah-langkah ini.
