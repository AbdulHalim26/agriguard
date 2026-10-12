"""AgriGuard AI Scanner - FastAPI service.

Model : EfficientNet-B0 (ONNX) klasifikasi penyakit daun padi — lihat predict.py.
Kontrak endpoint TIDAK berubah:
    GET  /health                  -> {"status": "ok"}
    POST /predict (multipart image) -> {"status", "confidence", "damage_pct"}
Tambahan (transparansi/laporan):
    GET  /model-info              -> metadata model yang sedang dipakai

Jalankan lokal:
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from predict import (
    MODEL_NAME,
    MODEL_VERSION,
    DomainGateError,
    ModelLoadError,
    get_model_info,
    is_model_loaded,
    load_model,
    predict_image,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("agriguard.ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Muat model sekali saat startup + log nama & versi (untuk laporan).
    try:
        load_model()
        logger.info("Model AI siap: %s | versi: %s", MODEL_NAME, MODEL_VERSION)
    except ModelLoadError as exc:
        logger.error("GAGAL memuat model AI saat startup: %s", exc)
    yield


app = FastAPI(title="AgriGuard AI Scanner", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_MIME = {"image/jpeg", "image/png"}
MAX_BYTES = 5 * 1024 * 1024


@app.get("/health")
def health():
    # Selalu 200 selama service hidup; sertakan status model untuk monitoring.
    return {"status": "ok", "model_loaded": is_model_loaded()}


@app.get("/model-info")
def model_info():
    info = get_model_info()
    info["loaded"] = is_model_loaded()
    return info


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Format gambar harus JPG atau PNG")

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="File gambar kosong")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Ukuran gambar maksimal 5MB")

    try:
        return predict_image(data, image.filename or "")
    except DomainGateError as exc:
        # Gerbang domain/kualitas: 422 + pesan yang ditampilkan apa adanya ke
        # pengguna (frontend menawarkan "Ambil Ulang Foto", bukan lapor manual).
        return JSONResponse(status_code=422, content={"error": str(exc)})
    except ModelLoadError as exc:
        logger.error("Model tidak siap saat /predict: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Model AI belum siap / gagal dimuat. Silakan gunakan 'Lapor Manual'.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
