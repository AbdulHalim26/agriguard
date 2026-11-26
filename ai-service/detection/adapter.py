"""Explicitly described YOLO26 ONNX exports; no guessing based on shape alone.

Supported: FP32, static batch-1 RGB NCHW; raw (1,4+nc,N) cxcywh + per-class
probabilities with class-aware NMS, or one-to-one (1,N,6) xyxy without NMS.
Manifest and ONNX custom metadata must agree. Other tasks/layouts fail closed.
"""
import ast
import hashlib
import io
import json
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

from .contracts import Detection, DetectionResponse, ModelSpec, Provenance
from .domain_gate import evaluate_crop_domain
from .severity import review_severity


class DetectorError(Exception):
    code = "INVALID_MODEL_OUTPUT"
    status = 502


class DetectorUnavailable(DetectorError):
    code = "DETECTOR_UNAVAILABLE"
    status = 503


class InvalidDetectionImage(DetectorError):
    code = "INVALID_IMAGE"
    status = 400


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class Letterbox:
    width: int
    height: int
    gain_x: float
    gain_y: float
    left: int
    top: int

    def original_box(self, box):
        values = np.asarray(box, dtype=np.float64).copy()
        values[[0, 2]] = (values[[0, 2]] - self.left) / self.gain_x
        values[[1, 3]] = (values[[1, 3]] - self.top) / self.gain_y
        values[[0, 2]] = np.clip(values[[0, 2]], 0, self.width)
        values[[1, 3]] = np.clip(values[[1, 3]], 0, self.height)
        return tuple(float(v) for v in values)


def preprocess(image_bytes: bytes, size: tuple[int, int]):
    if not image_bytes or len(image_bytes) > 5 * 1024 * 1024:
        raise InvalidDetectionImage("Gambar kosong atau melebihi batas 5MB.")
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            if source.format not in ("JPEG", "PNG") or source.width * source.height > 20_000_000 or max(source.size) > 16384:
                raise InvalidDetectionImage("Format atau dimensi gambar tidak didukung.")
            image = ImageOps.exif_transpose(source).convert("RGB")
            width, height = image.size
            target_h, target_w = size
            ratio = min(target_w / width, target_h / height)
            new_w, new_h = max(1, round(width * ratio)), max(1, round(height * ratio))
            left, top = (target_w - new_w) // 2, (target_h - new_h) // 2
            canvas = Image.new("RGB", (target_w, target_h), (114, 114, 114))
            canvas.paste(image.resize((new_w, new_h), Image.Resampling.BILINEAR), (left, top))
            tensor = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    except InvalidDetectionImage:
        raise
    except Exception as exc:
        raise InvalidDetectionImage("Gambar JPG/PNG tidak dapat dibaca.") from exc
    return np.ascontiguousarray(tensor, dtype=np.float32), Letterbox(width, height, new_w / width, new_h / height, left, top)


def nms(boxes, scores, classes, iou_threshold: float, max_detections=300):
    order = np.argsort(-scores, kind="stable")[:3000]
    keep = []
    while len(order) and len(keep) < max_detections:
        index = int(order[0])
        keep.append(index)
        rest = order[1:]
        if not len(rest):
            break
        a, b = boxes[index], boxes[rest]
        wh = np.maximum(0, np.minimum(a[2:], b[:, 2:]) - np.maximum(a[:2], b[:, :2]))
        intersection = wh[:, 0] * wh[:, 1]
        union = (a[2] - a[0]) * (a[3] - a[1]) + (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1]) - intersection
        suppress = (classes[rest] == classes[index]) & (intersection / np.maximum(union, 1e-12) > iou_threshold)
        order = rest[~suppress]
    return keep


def decode_output(output, spec: ModelSpec, transform: Letterbox, confidence=0.25, iou=0.45):
    data = np.asarray(output)
    nc = len(spec.classes)
    if data.ndim != 3 or data.shape[0] != 1 or not np.issubdtype(data.dtype, np.floating) or not np.isfinite(data).all():
        raise DetectorError("Tensor detektor tidak valid.")
    if spec.output_format == "end2end_xyxy":
        if data.shape[2] != 6 or data.shape[1] > 100_000:
            raise DetectorError("Layout end-to-end tidak kompatibel.")
        rows = data[0]
        boxes, scores, ids = rows[:, :4], rows[:, 4], rows[:, 5]
        if np.any(ids != np.floor(ids)) or np.any(ids < 0) or np.any(ids >= nc):
            raise DetectorError("Indeks kelas detektor tidak valid.")
    else:
        if data.shape[1] != 4 + nc or data.shape[2] > 100_000:
            raise DetectorError("Layout raw detektor tidak kompatibel.")
        rows = data[0].T
        probabilities = rows[:, 4:]
        if np.any(probabilities < 0) or np.any(probabilities > 1):
            raise DetectorError("Skor kelas harus berupa probabilitas.")
        ids = probabilities.argmax(axis=1)
        scores = probabilities.max(axis=1)
        boxes = np.column_stack((rows[:, :2] - rows[:, 2:4] / 2, rows[:, :2] + rows[:, 2:4] / 2))
    if np.any(scores < 0) or np.any(scores > 1):
        raise DetectorError("Confidence detektor tidak valid.")
    selected = scores >= confidence
    boxes, scores, ids = boxes[selected], scores[selected], ids[selected].astype(int)
    if len(boxes) and np.any(boxes[:, 2:] <= boxes[:, :2]):
        raise DetectorError("Dimensi bounding box tidak valid.")
    # A one-to-one export is already NMS-free. Never suppress those boxes twice.
    keep = nms(boxes, scores, ids, iou) if spec.output_format == "raw_cxcywh_bcn" else np.argsort(-scores, kind="stable")[:300]
    result = []
    for index in keep:
        box = transform.original_box(boxes[index])
        if box[2] <= box[0] or box[3] <= box[1]:  # prediction entirely inside padding
            continue
        label = spec.classes[int(ids[index])]
        result.append(Detection(**label.model_dump(), confidence=float(scores[index]), bbox_xyxy=box))
    return result


class YoloDetector:
    def __init__(self, model_path: Path, confidence=0.25, iou=0.45, *, allow_synthetic=False, session_factory=ort.InferenceSession):
        if not model_path.is_file():
            raise DetectorUnavailable("Bobot detektor belum tersedia.")
        if not (0 < confidence <= 1 and 0 < iou <= 1):
            raise DetectorUnavailable("Konfigurasi ambang detektor tidak valid.")
        try:
            self.spec = ModelSpec.model_validate_json(model_path.with_suffix(".metadata.json").read_text())
            if self.spec.purpose != "model_training" and not allow_synthetic:
                raise ValueError("Synthetic artifacts cannot be served")
            if file_sha256(model_path) != self.spec.model_sha256:
                raise ValueError("Model checksum mismatch")
            self.session = session_factory(str(model_path), providers=["CPUExecutionProvider"])
            inputs, outputs = self.session.get_inputs(), self.session.get_outputs()
            if len(inputs) != 1 or len(outputs) != 1:
                raise ValueError("Only single-input/output detection exports supported")
            source, target = inputs[0], outputs[0]
            if source.type != "tensor(float)" or source.shape != [1, 3, *self.spec.input_size] or source.name != self.spec.input_name:
                raise ValueError("Expected static batch-1 FP32 RGB NCHW")
            if target.type != "tensor(float)" or target.name != self.spec.output_name or len(target.shape) != 3 or target.shape[0] != 1:
                raise ValueError("Invalid output metadata")
            axis, features = (2, 6) if self.spec.output_format == "end2end_xyxy" else (1, 4 + len(self.spec.classes))
            if target.shape[axis] != features:
                raise ValueError("Output layout does not match manifest")
            metadata = self.session.get_modelmeta().custom_metadata_map
            names = ast.literal_eval(metadata.get("names", "{}"))
            if not isinstance(names, dict) or len(names) != len(self.spec.classes):
                raise ValueError("Missing class metadata")
            names = [names.get(i, names.get(str(i))) for i in range(len(names))]
            if names != [c.class_name for c in self.spec.classes] or metadata.get("task") != "detect":
                raise ValueError("Class/task metadata mismatch")
            if metadata.get("agriguard_output_format") != self.spec.output_format or metadata.get("agriguard_model_family") != self.spec.model_family:
                raise ValueError("Export head metadata missing/mismatched")
        except Exception as exc:
            raise DetectorUnavailable("Model/manifest ONNX tidak kompatibel; gunakan workflow ekspor AgriGuard.") from exc
        self.confidence, self.iou = confidence, iou
        self._apply_domain_gate = not allow_synthetic

    def detect(self, image_bytes: bytes) -> DetectionResponse:
        tensor, transform = preprocess(image_bytes, self.spec.input_size)
        started = time.perf_counter()
        if self._apply_domain_gate:
            domain = evaluate_crop_domain(image_bytes)
            if not domain.supported:
                return DetectionResponse(
                    model_version=self.spec.model_version, model_family=self.spec.model_family,
                    image_width=transform.width, image_height=transform.height, detections=[],
                    inference_status="UNSUPPORTED_IMAGE",
                    severity=review_severity([], transform.width, transform.height, unsupported_image=True),
                    provenance=Provenance(
                        label_schema=self.spec.label_schema,
                        model_sha256=self.spec.model_sha256, image_sha256=hashlib.sha256(image_bytes).hexdigest(),
                        dataset_manifest_sha256=self.spec.dataset_manifest_sha256,
                        output_format=self.spec.output_format,
                        postprocessing="nms_free" if self.spec.output_format == "end2end_xyxy" else "class_aware_nms",
                        confidence_threshold=self.confidence,
                        iou_threshold=self.iou if self.spec.output_format == "raw_cxcywh_bcn" else None,
                        inference_ms=(time.perf_counter() - started) * 1000,
                    ),
                )
        try:
            values = self.session.run([self.spec.output_name], {self.spec.input_name: tensor})
            if len(values) != 1:
                raise DetectorError("Output detektor tidak lengkap.")
            detections = decode_output(values[0], self.spec, transform, self.confidence, self.iou)
        except DetectorError:
            raise
        except Exception as exc:
            raise DetectorError("Inferensi detektor gagal.") from exc
        return DetectionResponse(
            model_version=self.spec.model_version, model_family=self.spec.model_family,
            image_width=transform.width, image_height=transform.height, detections=detections,
            inference_status="SUCCESS" if detections else "NO_DETECTIONS",
            severity=review_severity(detections, transform.width, transform.height),
            provenance=Provenance(
                label_schema=self.spec.label_schema,
                model_sha256=self.spec.model_sha256, image_sha256=hashlib.sha256(image_bytes).hexdigest(),
                dataset_manifest_sha256=self.spec.dataset_manifest_sha256,
                output_format=self.spec.output_format,
                postprocessing="nms_free" if self.spec.output_format == "end2end_xyxy" else "class_aware_nms",
                confidence_threshold=self.confidence,
                iou_threshold=self.iou if self.spec.output_format == "raw_cxcywh_bcn" else None,
                inference_ms=(time.perf_counter() - started) * 1000,
            ),
        )


@lru_cache(maxsize=1)
def _configured_detector(path: str, confidence: float, iou: float):
    return YoloDetector(Path(path), confidence, iou)


def get_detector():
    # Gate is checked on every request, including after a model was cached.
    if os.getenv("AGRIGUARD_YOLO_ENABLED", "false").strip().lower() != "true":
        raise DetectorUnavailable("Deteksi YOLO belum diaktifkan.")
    path = os.getenv("AGRIGUARD_YOLO_MODEL_PATH", "").strip()
    if not path:
        raise DetectorUnavailable("Model YOLO belum dikonfigurasi.")
    try:
        return _configured_detector(path, float(os.getenv("AGRIGUARD_YOLO_CONFIDENCE", "0.25")), float(os.getenv("AGRIGUARD_YOLO_IOU", "0.45")))
    except DetectorError:
        raise
    except Exception as exc:
        raise DetectorUnavailable("Konfigurasi detektor tidak valid.") from exc
