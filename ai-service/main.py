"""AgriGuard AI Scanner - FastAPI service.

Jalankan lokal:
    uvicorn main:app --host 0.0.0.0 --port 8000

Endpoint:
    GET  /health               -> {"status": "ok"}
    POST /predict (multipart image) -> {"status", "confidence", "damage_pct"}
"""

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from predict import predict_image

app = FastAPI(title="AgriGuard AI Scanner", version="0.1.0")

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
    return {"status": "ok"}


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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc