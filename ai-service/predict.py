"""Prediksi severity kerusakan banjir sawah padi dengan model v2 (retrain).

Model : agriguard-v2 — EfficientNet-B0 (torchvision), 3 kelas severity banjir,
        dilatih ulang dari dataset banjir sawah asli (jawaban atas evaluasi
        penyisihan ICONFEST 2026: "model AI perlu dilatih ulang menggunakan
        dataset spesifik banjir").
Bukti : test class accuracy 0.9172 pada 145 sampel holdout banjir (baseline
        majority-class 0.531), ONNX/PyTorch parity max|logit diff| 1.25e-06,
        provenance lengkap di model_v2.metadata.json (manifest_sha256).
Format : ONNX (ai-service/model/model_v2.onnx) dijalankan via onnxruntime.
        Nama tensor I/O sengaja disamakan dengan v1 oleh export_onnx.py:
        input "pixel_values" -> output "logits" (dibaca dinamis dari metadata).
Prepro : identik dengan transform evaluasi training (common.py):
        resize 224x224 BICUBIC, /255, normalize mean/std ImageNet.
Runtime TIDAK membutuhkan torch/transformers.
Kontrak output (WAJIB, tidak berubah):
{"status": "aman" | "rusak_ringan" | "rusak_berat",
 "confidence": 0..1,
 "damage_pct": 0..100}
Jika model gagal dimuat -> ModelLoadError (endpoint /predict mengembalikan 503).
Jika foto ditolak gerbang domain/kualitas -> DomainGateError (endpoint /predict
mengembalikan 422 + pesan ramah; lihat konstanta GERBANG DOMAIN di bawah).
"""
import io
import json
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
MODEL_PATH = os.path.join(MODEL_DIR, "model_v2.onnx")
METADATA_PATH = os.path.join(MODEL_DIR, "model_v2.metadata.json")

MODEL_NAME = "agriguard-v2/efficientnet-b0-severity-banjir-3kelas"
MODEL_ARCH = "EfficientNet-B0 (torchvision, retrain dataset banjir sawah)"
MODEL_VERSION = "v2-retrain (test class acc 0.9172, n=145 holdout banjir)"
MODEL_SOURCE = (
    "Retrain internal tim Duo Shinobi sebagai respons evaluasi penyisihan "
    "ICONFEST 2026; dataset v2: AgriConnect Damage (Roboflow, CC-BY-4.0) + "
    "Agrisense Flooded (Roboflow) — provenance lengkap di model_v2.metadata.json"
)
MODEL_LICENSE = "milik tim Duo Shinobi (data latih: CC-BY-4.0 / CC0)"
# Angka evaluasi dari metrics.json one-shot-003 (holdout banjir, 145 sampel test).
EVAL_ACCURACY = 0.9172
EVAL_BASELINE_MAJORITY = 0.531
EVAL_PER_CLASS = {
    "tanpa_kerusakan_terlihat": 1.0,     # 61/61
    "kerusakan_ringan_terlihat": 0.0,    # 0/7 — n sangat kecil; 5 dari 7 justru
                                         # over-estimate ke berat (konservatif)
    "kerusakan_berat_terlihat": 0.935,   # 72/77
}
EVAL_PARITY_MAX_LOGIT_DIFF = 1.2516975e-06
CLASSES = ["aman", "rusak_ringan", "rusak_berat"]


def _load_metadata() -> dict:
    """Baca model_v2.metadata.json (provenance + nama tensor I/O).
    Fallback kosong bila file hilang — konstanta default di bawah sudah
    konsisten dengan checkpoint v2."""
    try:
        with open(METADATA_PATH, encoding="utf-8") as fh:
            data = json.loads(fh.read())
        if data.get("labels") and data.get("label_to_status"):
            return data
    except Exception:  # noqa: BLE001
        pass
    return {}


_METADATA = _load_metadata()

# ---------------------------------------------------------------------------
# MAPPING_CONSTANTS — pemetaan label model v2 (3 kelas) -> 3 status AgriGuard
# Urutan label WAJIB sama dengan urutan output logits (LABELS di common.py).
# Diambil dari metadata; fallback hardcoded identik dengan repo training.
# ---------------------------------------------------------------------------
_DEFAULT_LABELS = [
    "tanpa_kerusakan_terlihat",
    "kerusakan_ringan_terlihat",
    "kerusakan_berat_terlihat",
]
ID2LABEL = {
    i: lbl for i, lbl in enumerate(_METADATA.get("labels", _DEFAULT_LABELS))
}
LABEL_TO_STATUS = _METADATA.get("label_to_status") or {
    "tanpa_kerusakan_terlihat": "aman",
    "kerusakan_ringan_terlihat": "rusak_ringan",
    "kerusakan_berat_terlihat": "rusak_berat",
}
# Nama tensor I/O ONNX — dari metadata (export_onnx.py men-samakan dengan v1).
INPUT_NAME = _METADATA.get("input_name", "pixel_values")
OUTPUT_NAME = _METADATA.get("output_name", "logits")

# ---------------------------------------------------------------------------
# GERBANG DOMAIN (heuristik) — menolak foto yang jelas bukan lahan padi/tanaman
# sebelum inference, dan menolak hasil yang terlalu tidak pasti.
#
# PENTING (keterbatasan jujur untuk laporan): ini BUKAN klasifikasi domain
# (in-domain vs out-of-domain) yang sesungguhnya, melainkan heuristik murah:
#   1) Rasio piksel "hijau vegetasi" pada ruang HSV. Foto manusia/interior/
#      dokumen umumnya punya rasio hijau rendah sehingga tertolak lebih awal.
#   2) Ambang keyakinan softmax model. Jika model ragu (< ambang), hasil tidak
#      ditampilkan sebagai kepastian.
# Heuristik bisa salah: dinding/pakaian hijau bisa lolos, dan sawah keruh/
# kekeringan ekstrem bisa tertolak. Karena itu pesannya meminta foto ulang.
# ---------------------------------------------------------------------------
VEGETATION_MIN_RATIO = 0.15  # minimal 15% piksel hijau vegetasi
CONFIDENCE_MIN = 0.35        # diturunkan hasil uji lapangan: foto nyata sebelumnya selalu ditolak gerbang
# Ambang hue "hijau" dalam skala PIL HSV (0..255, setara ~49°..127° / warna
# hijau-kekuningan s.d. hijau-cyan). Saturasi & value dalam 0..1.
GREEN_HUE_MIN = 35.0
GREEN_HUE_MAX = 90.0
GREEN_SAT_MIN = 0.20         # saturasi minimal (0..1)
GREEN_VAL_MIN = 0.20         # value/kecerahan minimal (0..1)

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
# Preprocessing — HARUS sama dengan transform evaluasi training (common.py):
# Resize 224x224 BICUBIC, ToTensor (/255), Normalize(mean/std ImageNet).
# Identik dengan preprocessing v1, sehingga tidak ada perubahan di sini.
# ---------------------------------------------------------------------------
IMAGE_SIZE = 224
RESCALE = 1.0 / 255.0
IMAGE_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGE_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
PIL_RESAMPLE = Image.BICUBIC

_SESSION = None


class ModelLoadError(Exception):
    """Model gagal dimuat (file hilang / rusak / onnxruntime gagal)."""


class DomainGateError(Exception):
    """Foto ditolak gerbang domain/kualitas (bukan lahan tanaman atau terlalu
    tidak pasti). Endpoint /predict mengembalikan HTTP 422 dengan pesan ini."""


def load_model():
    """Muat sesi onnxruntime sekali (idempoten). Raise ModelLoadError bila gagal."""
    global _SESSION
    if _SESSION is not None:
        return _SESSION
    if not os.path.exists(MODEL_PATH):
        raise ModelLoadError(f"File model tidak ditemukan: {MODEL_PATH}")
    try:
        _SESSION = ort.InferenceSession(
            MODEL_PATH, providers=["CPUExecutionProvider"]
        )
    except Exception as exc:  # noqa: BLE001
        raise ModelLoadError(f"Gagal memuat model ONNX: {exc}") from exc
    return _SESSION


def is_model_loaded() -> bool:
    return _SESSION is not None


def get_model_info() -> dict:
    """Metadata untuk endpoint GET /model-info (transparansi/laporan)."""
    info = {
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
        "evaluation": {
            "test_class_accuracy": EVAL_ACCURACY,
            "baseline_majority_class": EVAL_BASELINE_MAJORITY,
            "test_samples": 145,
            "per_class_recall": EVAL_PER_CLASS,
            "onnx_parity_max_logit_diff": EVAL_PARITY_MAX_LOGIT_DIFF,
            "scope": (
                "Holdout adalah potret banjir/sawah yang dipisah per peristiwa "
                "(group-aware); bukan test set penulis model v1."
            ),
        },
        "domain_gate": {
            "vegetation_min_ratio": VEGETATION_MIN_RATIO,
            "green_hue_range_pil_0_255": [GREEN_HUE_MIN, GREEN_HUE_MAX],
            "green_saturation_min": GREEN_SAT_MIN,
            "green_value_min": GREEN_VAL_MIN,
            "confidence_min": CONFIDENCE_MIN,
        },
    }
    if _METADATA:
        provenance = {
            k: _METADATA.get(k)
            for k in (
                "label_schema", "trained_on", "purpose", "ready_for_integration",
                "checkpoint_sha256", "manifest_sha256", "split_id",
                "metrics_sha256", "onnx_sha256",
            )
            if _METADATA.get(k) is not None
        }
        verification = _METADATA.get("export_verification")
        if verification:
            provenance["export_verification"] = {
                "verified": verification.get("verified"),
                "checked_at": verification.get("checked_at"),
                "max_absolute_logit_difference":
                    verification.get("max_absolute_logit_difference"),
                "versions": verification.get("versions"),
            }
        info["provenance"] = provenance
    return info


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


def _green_ratio(image_bytes: bytes) -> float:
    """Rasio piksel hijau vegetasi (0..1) via ambang pada ruang HSV.
    Hue memakai skala PIL (0..255). Rentang hijau 35..90 setara ~49°..127°,
    mencakup hijau-kekuningan hingga hijau-cyan. Saturation & value minimal
    menyingkirkan area gelap/abu-abu yang secara hue bisa masuk rentang hijau.
    """
    with Image.open(io.BytesIO(image_bytes)) as im:
        rgb = im.convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), PIL_RESAMPLE)
        hsv = rgb.convert("HSV")
        arr = np.asarray(hsv, dtype=np.float32)
        hue = arr[..., 0]  # 0..255 (skala PIL)
        sat = arr[..., 1] / 255.0
        val = arr[..., 2] / 255.0
        green = (
            (hue >= GREEN_HUE_MIN)
            & (hue <= GREEN_HUE_MAX)
            & (sat >= GREEN_SAT_MIN)
            & (val >= GREEN_VAL_MIN)
        )
    return float(green.mean())


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
    # Nama tensor I/O dibaca dari metadata (identik v1: pixel_values -> logits).
    logits = session.run([OUTPUT_NAME], {INPUT_NAME: x})[0][0]
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
    """Validasi gambar, jalankan gerbang domain, lalu klasifikasi (kontrak tetap).
    Gerbang domain (sebelum inference): rasio piksel hijau vegetasi <
    VEGETATION_MIN_RATIO -> DomainGateError (foto bukan lahan tanaman).
    Gerbang kualitas (setelah inference): confidence < CONFIDENCE_MIN ->
    DomainGateError (foto terlalu tidak jelas).

    Raises:
        ValueError: file bukan gambar valid / terlalu besar.
        DomainGateError: ditolak gerbang domain/kualitas (HTTP 422).
        ModelLoadError: model gagal dimuat.
    """
    if len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("Ukuran gambar maksimal 5MB")
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except Exception as exc:  # noqa: BLE001
        raise ValueError("File bukan gambar yang valid") from exc

    # Gerbang 1: pra-cek vegetasi (murah, sebelum inference).
    green = _green_ratio(image_bytes)
    if green < VEGETATION_MIN_RATIO:
        logger.info(
            "Gerbang domain: rasio hijau %.3f < %.2f — foto ditolak",
            green,
            VEGETATION_MIN_RATIO,
        )
        raise DomainGateError(
            "Foto bukan lahan padi/tanaman. Ambil foto sawah yang jelas."
        )

    result = _infer(image_bytes)

    # Gerbang 2: tolak hasil yang terlalu tidak pasti (jangan jual kepastian).
    if result["confidence"] < CONFIDENCE_MIN:
        logger.info(
            "Gerbang kualitas: confidence %.4f < %.2f — foto ditolak",
            result["confidence"],
            CONFIDENCE_MIN,
        )
        raise DomainGateError(
            "Kualitas foto tidak cukup jelas untuk dianalisis. "
            "Ambil foto lebih dekat & terang."
        )
    return result