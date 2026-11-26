"""Fail-closed crop-domain pre-gate for YOLO rice disease detection.

Uses a broader crop-foliage color envelope (green, yellow-green, and dry
yellow/brown rice foliage — NOT a naive green-only rule) combined with
natural-image texture checks (gradient energy & flat-pixel ratio) to block
clear out-of-domain photos (e.g. household fans, indoor walls, documents,
solid-color walls, flat vector logos) before YOLOv8n runs.

Honest limitation: this is a lightweight pre-gate, not a trained open-set
OOD classifier. Natural non-rice foliage or dense green UI screenshots can
still pass and must rely on REVIEW_REQUIRED and human/PPL verification.
"""
from dataclasses import dataclass
import io

import numpy as np
from PIL import Image, ImageOps

GATE_SIZE = 224
# PIL HSV hue is scaled 0..255 (~17 deg..134 deg): covers dry brown/yellow,
# chlorotic yellow-green, and healthy green rice foliage.
FOLIAGE_HUE_MIN = 12.0
FOLIAGE_HUE_MAX = 95.0
FOLIAGE_SAT_MIN = 0.14
FOLIAGE_VAL_MIN = 0.15

FOLIAGE_MIN_RATIO = 0.08
MIN_TEXTURE_GRADIENT = 0.50
MAX_FLAT_PIXEL_RATIO = 0.85


@dataclass(frozen=True)
class DomainGateResult:
    supported: bool
    reason_code: str
    message: str
    foliage_ratio: float
    texture_gradient: float
    flat_pixel_ratio: float


def evaluate_crop_domain(image_bytes: bytes) -> DomainGateResult:
    with Image.open(io.BytesIO(image_bytes)) as src:
        rgb = ImageOps.exif_transpose(src).convert("RGB").resize(
            (GATE_SIZE, GATE_SIZE), Image.Resampling.BICUBIC
        )
        hsv = np.asarray(rgb.convert("HSV"), dtype=np.float32)
        h = hsv[..., 0]
        s = hsv[..., 1] / 255.0
        v = hsv[..., 2] / 255.0
        foliage_ratio = float(
            (
                (h >= FOLIAGE_HUE_MIN)
                & (h <= FOLIAGE_HUE_MAX)
                & (s >= FOLIAGE_SAT_MIN)
                & (v >= FOLIAGE_VAL_MIN)
            ).mean()
        )
        gray = np.asarray(rgb.convert("L"), dtype=np.float32)
        dx = np.abs(np.diff(gray, axis=1))
        dy = np.abs(np.diff(gray, axis=0))
        texture_gradient = float((dx.mean() + dy.mean()) / 2.0)
        flat_pixel_ratio = float(((dx[:-1, :] < 1.0) & (dy[:, :-1] < 1.0)).mean())

    if foliage_ratio < FOLIAGE_MIN_RATIO:
        return DomainGateResult(
            supported=False,
            reason_code="INSUFFICIENT_CROP_FOLIAGE",
            message="Foto tidak tampak sebagai tanaman atau daun padi. Ambil ulang foto sawah/daun padi yang jelas.",
            foliage_ratio=foliage_ratio,
            texture_gradient=texture_gradient,
            flat_pixel_ratio=flat_pixel_ratio,
        )
    if texture_gradient < MIN_TEXTURE_GRADIENT or flat_pixel_ratio > MAX_FLAT_PIXEL_RATIO:
        return DomainGateResult(
            supported=False,
            reason_code="NON_NATURAL_OR_FLAT_IMAGE",
            message="Foto tampak polos atau bukan potret alami tanaman padi. Ambil ulang foto langsung pada tanaman padi.",
            foliage_ratio=foliage_ratio,
            texture_gradient=texture_gradient,
            flat_pixel_ratio=flat_pixel_ratio,
        )
    return DomainGateResult(
        supported=True,
        reason_code="CROP_DOMAIN_OK",
        message="Lolos pra-pemeriksaan domain tanaman.",
        foliage_ratio=foliage_ratio,
        texture_gradient=texture_gradient,
        flat_pixel_ratio=flat_pixel_ratio,
    )
