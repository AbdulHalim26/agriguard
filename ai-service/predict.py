"""Prediksi kerusakan daun padi dengan model klasifikasi REAL (transfer learning).

Model : SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft
        (fine-tune EfficientNet-B0 dari google/efficientnet-b0, 8 kelas daun padi,
         akurasi evaluasi 91.28% pada dataset penulis).
Format : ONNX (ai-service/model/model.onnx) dijalankan via onnxruntime.
         Runtime TIDAK membutuhkan torch/transformers.

Kontrak output (WAJIB, tidak berubah):
    {"status": "aman" | "rusak_ringan" | "rusak_berat",
     "confidence": 0..1,
     "damage_pct": 0..100}

Jika model gagal dimuat -> ModelLoadError (endpoint /predict mengembalikan 503).
"""

import io
import logging
import os

import numpy as np
import onnxruntime as ort
from PIL import Image

logger = logging.getLogger("agriguard.ai")

# ---------------------------------------------------------------------------
# Metadata model (transparansi — dipakai endpoint GET /model-info & laporan)
# ---------------------------------------------------------------------------
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
MODEL_PATH = os.path.join(MODEL_DIR, "model.onnx")
MODEL_NAME = "SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft"
MODEL_ARCH = "EfficientNet-B0"
MODEL_VERSION = "v4-fft (transformers 4.48.3, eval acc 0.9128)"
MODEL_SOURCE = "https://huggingface.co/SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft"
MODEL_LICENSE = "Apache-2.0"
EVAL_ACCURACY = 0.9128

CLASSES = ["aman", "rusak_ringan", "rusak_berat"]

# ---------------------------------------------------------------------------
# MAPPING_CONSTANTS — pemetaan 8 label model -> 3 kelas AgriGuard
# ---------------------------------------------------------------------------
# Dasar pemetaan (docs/severity):
#   - Healthy                 -> aman          (tanaman sehat)
#   - bercak/kerusakan ringan -> rusak_ringan  (lesi lokal, belum meluas)
#   - penyakit merusak berat  -> rusak_berat   (blight/blast/hawar, kehilangan hasil besar)
ID2LABEL = {
    0: "Bacterial Leaf Blight",
    1: "Brown Spot",
    2: "Healthy Rice Leaf",
    3: "Leaf Blast",
    4: "Leaf scald",
    5: "Narrow Brown Leaf Spot",
    6: "Rice Hispa",
    7: "Sheath Blight",
}

LABEL_TO_STATUS = {
    "Healthy Rice Leaf": "aman",
    "Brown Spot": "rusak_ringan",
    "Narrow Brown Leaf Spot": "rusak_ringan",
    "Leaf scald": "rusak_ringan",
    "Leaf Blast": "rusak_berat",
    "Bacterial Leaf Blight": "rusak_berat",
    "Sheath Blight": "rusak_berat",
    "Rice Hispa": "rusak_berat",
}

# damage_pct = estimasi deterministik dari confidence, per rentang status.
#   aman         : 0..15   (semakin yakin sehat -> makin dekat 0)
#   rusak_ringan : 30..60  diskalakan dari skor (spec)
#   rusak_berat  : 60..95  diskalakan dari skor (spec)
DAMAGE_RANGE = {
    "aman": (0, 15),
    "rusak_ringan": (30, 60),
    "rusak_berat": (60, 95),
}
DAMAGE_MAX = 95

# ---------------------------------------------------------------------------
# Preprocessing — HARUS sama dengan HF EfficientNetImageProcessor.
# Nilai mean/std di bawah divalidasi cocok persis (max|diff|=0.000000) dengan
# output `transformers` EfficientNetImageProcessor pada gambar nyata.
# (config preprocessor menyimpan image_std=0.4785.., tetapi transform efektif
#  yang dipakai model = 0.229/0.224/0.225 — divalidasi via akurasi label:
#  0.67 vs 0.50 pada 18 gambar berlabel Project-AgML.)
# ---------------------------------------------------------------------------
IMAGE_SIZE = 224
RESCALE = 1.0 / 255.0
IMAGE_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGE_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
PIL_RESAMPLE = Image.BICUBIC

_SESSION = None


class ModelLoadError(Exception):
    """Model gagal dimuat (file hilang / rusak / onnxruntime gagal)."""


def load_model():
    """Muat sesi onnxruntime sekali (idempoten). Raise ModelLoadError bila gagal."""
    global _SESSION
    if _SESSION is not None:
        return _SESSION
    if not os.path.exists(MODEL_PATH):
        raise ModelLoadError(f"File model tidak ditemukan: {MODEL_PATH}")
    try:
        _SESSION = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    except Exception as exc:  # noqa: BLE001
        raise ModelLoadError(f"Gagal memuat model ONNX: {exc}") from exc
    return _SESSION


def is_model_loaded() -> bool:
    return _SESSION is not None


def get_model_info() -> dict:
    """Metadata untuk endpoint GET /model-info (transparansi/laporan)."""
    return {
        "model": MODEL_NAME,
        "architecture": MODEL_ARCH,
        "version": MODEL_VERSION,
        "source": MODEL_SOURCE,
        "license": MODEL_LICENSE,
        "task": "image-classification",
        "runtime": f"onnxruntime {ort.__version__}",
        "input": f"RGB {IMAGE_SIZE}x{IMAGE_SIZE}",
        "classes": CLASSES,
        "model_labels": list(ID2LABEL.values()),
        "mapping": LABEL_TO_STATUS,
        "damage_pct_range": {k: list(v) for k, v in DAMAGE_RANGE.items()},
        "eval_accuracy": EVAL_ACCURACY,
    }


def _preprocess(image_bytes: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(image_bytes)) as im:
        im = im.convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), PIL_RESAMPLE)
        arr = np.asarray(im, dtype=np.float32) * RESCALE
    arr = (arr - IMAGE_MEAN) / IMAGE_STD
    arr = np.transpose(arr, (2, 0, 1))  # HWC -> CHW
    return np.ascontiguousarray(arr[None, ...], dtype=np.float32)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def _damage_pct(status: str, confidence: float) -> int:
    lo, hi = DAMAGE_RANGE[status]
    if status == "aman":
        pct = (1.0 - confidence) * hi  # yakin sehat -> ~0%
    else:
        pct = lo + (hi - lo) * confidence
    return int(round(min(max(pct, 0), DAMAGE_MAX)))


def _infer(image_bytes: bytes) -> dict:
    session = load_model()
    x = _preprocess(image_bytes)
    logits = session.run(["logits"], {"pixel_values": x})[0][0]
    probs = _softmax(np.asarray(logits, dtype=np.float32))

    idx = int(probs.argmax())
    label = ID2LABEL[idx]
    status = LABEL_TO_STATUS[label]
    confidence = round(float(probs[idx]), 4)
    damage_pct = _damage_pct(status, confidence)

    return {
        "status": status,
        "confidence": confidence,
        "damage_pct": damage_pct,
    }


def predict_image(image_bytes: bytes, filename: str = "") -> dict:
    """Validasi gambar lalu kembalikan hasil klasifikasi (kontrak tetap).

    Raises:
        ValueError: file bukan gambar valid / terlalu besar.
        ModelLoadError: model gagal dimuat.
    """
    if len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("Ukuran gambar maksimal 5MB")
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except Exception as exc:  # noqa: BLE001
        raise ValueError("File bukan gambar yang valid") from exc

    return _infer(image_bytes)
