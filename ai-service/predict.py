"""Prediction module - YOLOv8n-cls (3 kelas).

Kontrak output (WAJIB):
    {"status": "aman" | "rusak_ringan" | "rusak_berat",
     "confidence": 0..1,
     "damage_pct": 0..100}

Untuk sekarang memakai placeholder deterministik (hash gambar) sehingga
contract endpoint sudah benar. Ganti `load_model` + `_infer` di bawah ketika
weights YOLO tersedia (training/deploy HF - Milestone 4).
"""

import hashlib
import io

from PIL import Image

CLASSES = ["aman", "rusak_ringan", "rusak_berat"]

MODEL = None  # model global dibaca sekali


def load_model():
    """TODO(M4): load YOLOv8n-cls dari ai-service/model/best.pt."""
    global MODEL
    if MODEL is None:
        # Placeholder: belum ada weights. Model nyata dimuat di sini nanti.
        MODEL = True
    return MODEL


def _placeholder_classify(image_bytes: bytes) -> dict:
    """Klasifikasi deterministik berdasarkan sha256 gambar (placeholder)."""
    digest = hashlib.sha256(image_bytes).digest()

    status = CLASSES[digest[0] % len(CLASSES)]
    confidence = round(0.62 + (digest[1] % 33) / 100.0, 2)  # 0.62..0.94

    if status == "aman":
        damage_pct = int(digest[2] % 16)                       # 0..15
    elif status == "rusak_ringan":
        damage_pct = 16 + int(digest[2] % 30)                  # 16..45
    else:
        damage_pct = 46 + int(digest[2] % 45)                  # 46..90

    return {
        "status": status,
        "confidence": confidence,
        "damage_pct": min(damage_pct, 95),
    }


def _infer(image_bytes: bytes) -> dict:
    """Inference nyata ketika model sudah ada (M4). Placeholder untuk sekarang."""
    if load_model() is None:
        return _placeholder_classify(image_bytes)
    # TODO(M4): jalankan model YOLOv8n-cls di sini
    return _placeholder_classify(image_bytes)


def predict_image(image_bytes: bytes, filename: str = "") -> dict:
    """Validasi gambar lalu kembalikan hasil klasifikasi.

    Raises:
        ValueError: jika file bukan gambar yang valid / tidak didukung.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except Exception as exc:
        raise ValueError("File bukan gambar yang valid") from exc

    if len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("Ukuran gambar maksimal 5MB")

    return _infer(image_bytes)