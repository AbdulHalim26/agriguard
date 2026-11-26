import asyncio
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
from pydantic import ValidationError

from detection.adapter import (DetectorError, DetectorUnavailable, InvalidDetectionImage,
                               Letterbox, YoloDetector, decode_output, get_detector, preprocess)
from detection.contracts import Detection, DetectionResponse, ModelSpec
from detection.severity import review_severity, union_area
from detector_fixture import write_model


def png(size=(100, 50), exif_orientation=None):
    image = Image.new("RGB", size, "green")
    out = io.BytesIO()
    kwargs = {}
    if exif_orientation is not None:
        exif = image.getexif()
        exif[274] = exif_orientation
        kwargs["exif"] = exif.tobytes()
    image.save(out, format="PNG", **kwargs)
    return out.getvalue()


async def request(app, path, image_bytes, content_type="image/png"):
    # Exercise the real ASGI route without httpx, sockets, SMS, or databases.
    boundary = "agriguard-unit-test"
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="unit.png"\r\n'
            f'Content-Type: {content_type}\r\n\r\n').encode() + image_bytes + f"\r\n--{boundary}--\r\n".encode()
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
               "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
               "root_path": "", "server": ("test", 80), "client": ("test", 1),
               "headers": [(b"content-type", f"multipart/form-data; boundary={boundary}".encode()),
                           (b"content-length", str(len(body)).encode())]}, receive, send)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    result = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, json.loads(result)


class DetectorTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.path, self.manifest = write_model(self.root)
        self.spec = ModelSpec.model_validate(self.manifest)

    def tearDown(self):
        self.temporary.cleanup()

    def test_disabled_missing_model_and_synthetic_artifact_fail_closed(self):
        with patch.dict(os.environ, {"AGRIGUARD_YOLO_ENABLED": "false"}):
            with self.assertRaises(DetectorUnavailable): get_detector()
        with self.assertRaises(DetectorUnavailable): YoloDetector(self.root / "missing.onnx")
        with self.assertRaises(DetectorUnavailable): YoloDetector(self.path)

    def test_actual_onnxruntime_adapter_on_synthetic_graph(self):
        detector = YoloDetector(self.path, allow_synthetic=True)
        result = detector.detect(png((64, 64)))
        self.assertEqual(result.detections[0].bbox_xyxy, (8, 8, 32, 32))
        self.assertEqual(result.provenance.image_sha256, hashlib.sha256(png((64, 64))).hexdigest())
        self.assertEqual(result.severity_status, "REVIEW_REQUIRED")
        self.assertIsNone(result.status)
        self.assertIsNone(result.damage_pct)

    def test_checksum_and_input_layout_are_validated(self):
        self.path.write_bytes(self.path.read_bytes() + b"changed")
        with self.assertRaises(DetectorUnavailable): YoloDetector(self.path, allow_synthetic=True)
        path, _ = write_model(self.root, input_shape=(1, 1, 64, 64))
        with self.assertRaises(DetectorUnavailable): YoloDetector(path, allow_synthetic=True)

    def test_raw_real_runtime_and_manifest_prevent_ambiguous_layout_guessing(self):
        # Shape (1,6,6) is ambiguous with two classes: only the graph metadata,
        # not dimensions alone, distinguishes raw BCN from end-to-end BNC.
        raw = np.array([[[20, 20, 16, 16, .9, .1], [20, 20, 16, 16, .8, .1],
                         [5, 5, 4, 4, .1, .1], [6, 6, 4, 4, .1, .1],
                         [7, 7, 4, 4, .1, .1], [8, 8, 4, 4, .1, .1]]], dtype=np.float32).transpose(0, 2, 1)
        path, metadata = write_model(self.root, raw, output_format="raw_cxcywh_bcn")
        result = YoloDetector(path, allow_synthetic=True).detect(png((64, 64)))
        self.assertEqual(len(result.detections), 1)
        self.assertEqual(result.provenance.postprocessing, "class_aware_nms")
        self.assertEqual(result.detections[0].bbox_xyxy, (12, 12, 28, 28))
        metadata["output_format"] = "end2end_xyxy"
        path.with_suffix(".metadata.json").write_text(json.dumps(metadata))
        with self.assertRaises(DetectorUnavailable): YoloDetector(path, allow_synthetic=True)

    def test_invalid_images_are_rejected(self):
        for data in (b"", b"not an image", b"x" * (5 * 1024 * 1024 + 1)):
            with self.assertRaises(InvalidDetectionImage): preprocess(data, (64, 64))

    def test_letterbox_inverse_and_exif_orientation(self):
        tensor, transform = preprocess(png((100, 50)), (640, 640))
        self.assertEqual(tensor.shape, (1, 3, 640, 640))
        self.assertEqual(transform.top, 160)
        np.testing.assert_allclose(transform.original_box((64, 192, 576, 448)), (10, 5, 90, 45))
        _, oriented = preprocess(png((100, 50), 6), (640, 640))
        self.assertEqual((oriented.width, oriented.height), (50, 100))

    def test_empty_valid_output_never_implies_healthy(self):
        path, _ = write_model(self.root, np.empty((1, 0, 6), np.float32))
        result = YoloDetector(path, allow_synthetic=True).detect(png())
        self.assertEqual(result.inference_status, "NO_DETECTIONS")
        self.assertEqual(result.detections, [])
        self.assertEqual(result.severity.reason, "NO_DETECTIONS_NOT_HEALTHY")
        self.assertIsNone(result.status)

    def test_invalid_outputs_classes_scores_and_boxes(self):
        transform = Letterbox(64, 64, 1, 1, 0, 0)
        for output in (
            np.zeros((1, 6)), np.full((1, 1, 6), np.nan),
            np.array([[[1, 1, 5, 5, 1.1, 0]]]), np.array([[[1, 1, 5, 5, .9, 9]]]),
            np.array([[[5, 5, 1, 1, .9, 0]]]), np.array([[[1, 1, 5, 5, .9, .5]]]),
        ):
            with self.assertRaises(DetectorError): decode_output(output, self.spec, transform)

    def test_threshold_filter_and_global_class_mapping(self):
        values = np.array([[[1, 1, 8, 8, .2, 0], [2, 2, 9, 9, .8, 1]]], dtype=np.float32)
        result = decode_output(values, self.spec, Letterbox(64, 64, 1, 1, 0, 0))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].class_id, 5)
        self.assertEqual(result[0].class_name, "leaf_folder_damage")

    def test_raw_nms_is_class_aware_and_end2end_is_not_suppressed(self):
        raw_spec = self.spec.model_copy(update={"output_format": "raw_cxcywh_bcn"})
        raw = np.array([[[20, 20, 20, 20, .9, .1], [20, 20, 20, 20, .8, .1],
                         [20, 20, 20, 20, .1, .85]]], dtype=np.float32).transpose(0, 2, 1)
        transform = Letterbox(64, 64, 1, 1, 0, 0)
        result = decode_output(raw, raw_spec, transform)
        self.assertEqual([r.class_id for r in result], [0, 5])
        e2e = np.array([[[10, 10, 30, 30, .9, 0], [10, 10, 30, 30, .8, 0]]], dtype=np.float32)
        self.assertEqual(len(decode_output(e2e, self.spec, transform)), 2)
        with self.assertRaises(DetectorError): decode_output(raw, self.spec, transform)

    def test_boxes_are_clipped_and_contract_rejects_outside_bounds(self):
        result = decode_output(np.array([[[-10, -10, 100, 100, .9, 0]]]), self.spec, Letterbox(64, 64, 1, 1, 0, 0))
        self.assertEqual(result[0].bbox_xyxy, (0, 0, 64, 64))
        response = YoloDetector(self.path, allow_synthetic=True).detect(png((64, 64))).model_dump()
        response["detections"][0]["bbox_xyxy"] = [0, 0, 65, 64]
        with self.assertRaises(ValidationError): DetectionResponse.model_validate(response)

    def test_severity_union_does_not_double_count_or_use_confidence(self):
        boxes = [(0., 0., 10., 10.), (5., 0., 15., 10.)]
        self.assertEqual(union_area(boxes), 150)
        detections = [Detection(class_id=0, class_name="leaf_blast", annotation_level="lesion", confidence=1, bbox_xyxy=b) for b in boxes]
        detections.append(Detection(class_id=5, class_name="leaf_folder_damage", annotation_level="leaf", confidence=.4, bbox_xyxy=(0, 0, 20, 20)))
        result = review_severity(detections, 20, 20)
        self.assertEqual(result.area_metrics.lesion_box_union_px, 150)
        self.assertEqual(result.area_metrics.leaf_box_union_px, 400)
        self.assertEqual(result.area_metrics.lesion_leaf_box_coverage_ratio, .375)
        self.assertTrue(result.review_required)

    def test_asgi_detection_disabled_invalid_and_success_paths(self):
        import main
        with patch.dict(os.environ, {"AGRIGUARD_YOLO_ENABLED": "false"}):
            status, result = asyncio.run(request(main.app, "/predict/detect", png()))
        self.assertEqual(status, 503)
        self.assertEqual(result["inference_status"], "UNAVAILABLE")
        self.assertNotIn("detections", result)
        detector = YoloDetector(self.path, allow_synthetic=True)
        with patch("main.get_detector", return_value=detector):
            status, _ = asyncio.run(request(main.app, "/predict/detect", b"bad"))
            self.assertEqual(status, 400)
            status, result = asyncio.run(request(main.app, "/predict/detect", png()))
            self.assertEqual(status, 200)
            self.assertEqual(result["severity_status"], "REVIEW_REQUIRED")
        with patch.dict(os.environ, {"AGRIGUARD_YOLO_ENABLED": "true", "AGRIGUARD_YOLO_MODEL_PATH": str(self.root / "missing.onnx")}):
            status, result = asyncio.run(request(main.app, "/predict/detect", png()))
        self.assertEqual(status, 503)
        self.assertEqual(result["inference_status"], "UNAVAILABLE")

    def test_asgi_invalid_model_output_is_error_not_empty_success(self):
        import main
        path, _ = write_model(self.root, np.array([[[1, 1, 8, 8, np.nan, 0]]], dtype=np.float32))
        detector = YoloDetector(path, allow_synthetic=True)
        with patch("main.get_detector", return_value=detector):
            status, result = asyncio.run(request(main.app, "/predict/detect", png()))
        self.assertEqual(status, 502)
        self.assertEqual(result["inference_status"], "ERROR")
        self.assertNotIn("detections", result)

    def test_legacy_predict_still_runs_real_existing_classifier(self):
        import main
        from predict import _infer, is_model_loaded
        # Real existing EfficientNet inference, no accuracy assertion on synthetic input.
        result = _infer(png())
        self.assertTrue(is_model_loaded())
        self.assertEqual(set(result), {"status", "confidence", "damage_pct"})
        self.assertIn(result["status"], ("aman", "rusak_ringan", "rusak_berat"))
        self.assertTrue(0 <= result["confidence"] <= 1)
        self.assertTrue(0 <= result["damage_pct"] <= 100)
        status, body = asyncio.run(request(main.app, "/predict", png()))
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"status", "confidence", "damage_pct"})
        status, body = asyncio.run(request(main.app, "/predict", b"bad"))
        self.assertEqual(status, 400)
        self.assertIn("detail", body)


if __name__ == "__main__":
    unittest.main()
