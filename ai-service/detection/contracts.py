"""Boxes use continuous xyxy pixel edges on the EXIF-oriented ORIGINAL upload.

Origin is top-left; x2/y2 are exclusive edges, bounded by width/height. These are
geometric box envelopes, not tissue masks. Nullable legacy fields are deliberate:
an uncalibrated detector must never manufacture a legacy severity/percentage.
"""
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TAXONOMY = json.loads(Path(__file__).with_name("taxonomy.json").read_text())
CLASS_NAMES = tuple(TAXONOMY["classes"])
RICE_V1_9CLASS_NAMES = (
    "Bacterial-Leaf-Blight",
    "Brown-Spot",
    "False-Smut",
    "Healthy",
    "Narrow-Brown-Spot",
    "Rice-Blast",
    "Sheath-Blight",
    "Stem-Rot",
    "Tungro-Virus",
)
LABEL_SCHEMAS: dict[str, tuple[str, ...]] = {
    "rice_detection_v1": CLASS_NAMES,
    "rice_v1_9class": RICE_V1_9CLASS_NAMES,
}
LabelSchema = Literal["rice_detection_v1", "rice_v1_9class"]
ModelFamily = Literal["yolov8n", "yolo26n", "yolo26s"]
LegacyStatus = Literal["aman", "rusak_ringan", "rusak_berat"]
AnnotationLevel = Literal["lesion", "leaf"]
OutputFormat = Literal["raw_cxcywh_bcn", "end2end_xyxy"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ClassSpec(Contract):
    class_id: int = Field(strict=True, ge=0, lt=max(len(CLASS_NAMES), len(RICE_V1_9CLASS_NAMES)))
    class_name: str
    annotation_level: AnnotationLevel

    @model_validator(mode="after")
    def canonical_class(self):
        matches_v1 = self.class_id < len(CLASS_NAMES) and CLASS_NAMES[self.class_id] == self.class_name
        matches_9 = self.class_id < len(RICE_V1_9CLASS_NAMES) and RICE_V1_9CLASS_NAMES[self.class_id] == self.class_name
        if not (matches_v1 or matches_9):
            raise ValueError("Class ID/name mismatch")
        return self


class Detection(ClassSpec):
    confidence: float = Field(ge=0, le=1)
    bbox_xyxy: tuple[float, float, float, float]

    @model_validator(mode="after")
    def positive_box(self):
        x1, y1, x2, y2 = self.bbox_xyxy
        if not (0 <= x1 < x2 and 0 <= y1 < y2):
            raise ValueError("Invalid xyxy box")
        return self


class AreaMetrics(Contract):
    lesion_box_union_px: float = Field(ge=0)
    leaf_box_union_px: float = Field(ge=0)
    lesion_leaf_box_intersection_px: float = Field(ge=0)
    lesion_image_box_coverage_ratio: float = Field(ge=0, le=1)
    lesion_leaf_box_coverage_ratio: float | None = Field(default=None, ge=0, le=1)


class SeverityReview(Contract):
    review_required: Literal[True] = True
    reason: Literal["UNCALIBRATED_BOX_COVERAGE", "NO_DETECTIONS_NOT_HEALTHY", "UNSUPPORTED_NON_RICE_IMAGE"]
    calibration_id: None = None
    area_metrics: AreaMetrics


class Provenance(Contract):
    source: Literal["onnxruntime"] = "onnxruntime"
    label_schema: LabelSchema = "rice_detection_v1"
    coordinate_convention: Literal["xyxy_pixels_exif_oriented"] = "xyxy_pixels_exif_oriented"
    preprocessing: Literal["rgb_letterbox_114_bilinear_div255"] = "rgb_letterbox_114_bilinear_div255"
    output_format: OutputFormat
    postprocessing: Literal["class_aware_nms", "nms_free"]
    model_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    image_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    dataset_manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    confidence_threshold: float = Field(gt=0, le=1)
    iou_threshold: float | None = Field(default=None, gt=0, le=1)
    inference_ms: float = Field(ge=0)
    persistence: Literal["preview_only"] = "preview_only"

    @model_validator(mode="after")
    def matching_head(self):
        free = self.output_format == "end2end_xyxy"
        if self.postprocessing != ("nms_free" if free else "class_aware_nms") or ((self.iou_threshold is None) != free):
            raise ValueError("Head format/postprocessing mismatch")
        return self


class DetectionResponse(Contract):
    model_version: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    model_family: ModelFamily
    image_width: int = Field(strict=True, ge=1, le=16384)
    image_height: int = Field(strict=True, ge=1, le=16384)
    detections: list[Detection] = Field(max_length=300)
    inference_status: Literal["SUCCESS", "NO_DETECTIONS", "UNSUPPORTED_IMAGE"]
    severity_status: Literal["REVIEW_REQUIRED"] = "REVIEW_REQUIRED"
    status: None = None
    confidence: None = None
    damage_pct: None = None
    severity: SeverityReview
    provenance: Provenance

    @model_validator(mode="after")
    def coherent_response(self):
        if self.inference_status == "UNSUPPORTED_IMAGE":
            if self.detections:
                raise ValueError("Unsupported images must never include detections")
            if self.severity.reason != "UNSUPPORTED_NON_RICE_IMAGE":
                raise ValueError("Unsupported image requires UNSUPPORTED_NON_RICE_IMAGE severity reason")
            return self
        if bool(self.detections) != (self.inference_status == "SUCCESS"):
            raise ValueError("Detection status does not match results")
        schema_names = LABEL_SCHEMAS[self.provenance.label_schema]
        for item in self.detections:
            if item.class_id >= len(schema_names) or schema_names[item.class_id] != item.class_name:
                raise ValueError("Detection class does not match provenance label_schema")
            if item.bbox_xyxy[2] > self.image_width or item.bbox_xyxy[3] > self.image_height:
                raise ValueError("Box outside original image")
        expected = "UNCALIBRATED_BOX_COVERAGE" if self.detections else "NO_DETECTIONS_NOT_HEALTHY"
        if self.severity.reason != expected:
            raise ValueError("Inconsistent severity review")
        return self


class DetectionFailure(Contract):
    inference_status: Literal["UNAVAILABLE", "ERROR"]
    severity_status: Literal["REVIEW_REQUIRED"] = "REVIEW_REQUIRED"
    error_code: str
    error: str


class ModelSpec(Contract):
    schema_version: Literal[1] = 1
    purpose: Literal["model_training", "synthetic_test"]
    label_schema: LabelSchema = "rice_detection_v1"
    model_version: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    model_family: ModelFamily
    task: Literal["detect"] = "detect"
    model_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    dataset_manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    export_parity_verified: Literal[True]
    input_name: str = Field(min_length=1, max_length=128)
    output_name: str = Field(min_length=1, max_length=128)
    input_size: tuple[int, int]  # height, width
    preprocessing: Literal["rgb_letterbox_114_bilinear_div255"] = "rgb_letterbox_114_bilinear_div255"
    output_format: OutputFormat
    classes: list[ClassSpec] = Field(min_length=1, max_length=max(len(CLASS_NAMES), len(RICE_V1_9CLASS_NAMES)))

    @model_validator(mode="after")
    def supported_manifest(self):
        if any(not isinstance(n, int) or isinstance(n, bool) or n < 32 or n > 2048 or n % 32 for n in self.input_size):
            raise ValueError("Static input dimensions must be multiples of 32")
        if len({c.class_id for c in self.classes}) != len(self.classes):
            raise ValueError("Duplicate classes")
        schema_names = LABEL_SCHEMAS[self.label_schema]
        for c in self.classes:
            if c.class_id >= len(schema_names) or schema_names[c.class_id] != c.class_name:
                raise ValueError("Manifest class does not match label_schema")
        return self
