import asyncio
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from detection.adapter import YoloDetector, _configured_detector
from main import app

MODEL_PATH = Path(__file__).resolve().parents[1] / "model" / "detector_yolov8n_rice_v1.onnx"
TEST_IMAGES_DIR = Path("/Users/macbook/Documents/agriguard-datasets/derived/rice-v1-detect-2p/test/images")


def make_blank_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (320, 320), (245, 245, 245)).save(buf, format="PNG")
    return buf.getvalue()


async def call_asgi(method: str, path: str, body: bytes = b"", content_type: str = ""):
    headers = []
    if content_type:
        headers.append((b"content-type", content_type.encode()))
        headers.append((b"content-length", str(len(body)).encode()))
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "path": path, "raw_path": path.encode(), "query_string": b"", "headers": headers}
    sent = False
    status_code = 0
    chunks = []

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(msg):
        nonlocal status_code
        if msg["type"] == "http.response.start":
            status_code = msg["status"]
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    await app(scope, receive, send)
    return status_code, json.loads(b"".join(chunks).decode())


def multipart_image(filename: str, data: bytes, mime: str):
    boundary = "----AgriGuardBoundary2P"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


@unittest.skipUnless(MODEL_PATH.is_file(), "Trained YOLOv8n ONNX model not present")
class YoloV8nRiceV1IntegrationTest(unittest.TestCase):
    def setUp(self):
        _configured_detector.cache_clear()

    def tearDown(self):
        _configured_detector.cache_clear()

    def test_real_model_loads_and_detects_rice_disease_and_blank_no_detections(self):
        detector = YoloDetector(MODEL_PATH, confidence=0.25, iou=0.45)

        blank_resp = detector.detect(make_blank_png())
        self.assertEqual(blank_resp.inference_status, "NO_DETECTIONS")
        self.assertEqual(blank_resp.detections, [])
        self.assertEqual(blank_resp.severity.reason, "NO_DETECTIONS_NOT_HEALTHY")
        self.assertIsNone(blank_resp.status)
        self.assertIsNone(blank_resp.damage_pct)

        if TEST_IMAGES_DIR.is_dir():
            sample = TEST_IMAGES_DIR / "BACTERIALBLIGHT2_080_jpg.rf.14e6f1895ea800b23e33f322df0e747f.jpg"
            if sample.is_file():
                resp = detector.detect(sample.read_bytes())
                self.assertEqual(resp.model_family, "yolov8n")
                self.assertEqual(resp.provenance.label_schema, "rice_v1_9class")
                self.assertEqual(resp.inference_status, "SUCCESS")
                self.assertGreaterEqual(len(resp.detections), 1)
                for d in resp.detections:
                    x1, y1, x2, y2 = d.bbox_xyxy
                    self.assertGreaterEqual(x1, 0.0)
                    self.assertGreaterEqual(y1, 0.0)
                    self.assertLessEqual(x2, resp.image_width)
                    self.assertLessEqual(y2, resp.image_height)
                    self.assertGreater(x2, x1)
                    self.assertGreater(y2, y1)
                    self.assertGreaterEqual(d.confidence, 0.25)
                    self.assertLessEqual(d.confidence, 1.0)

            healthy_imgs = sorted(p for p in TEST_IMAGES_DIR.iterdir() if "healthy" in p.name.lower())
            if healthy_imgs:
                h_resp = detector.detect(healthy_imgs[0].read_bytes())
                if any(d.class_name == "Healthy" for d in h_resp.detections) and all(
                    d.class_name == "Healthy" for d in h_resp.detections
                ):
                    self.assertEqual(h_resp.severity.area_metrics.lesion_box_union_px, 0.0)

    def test_fastapi_predict_detect_and_efficientnet_regression(self):
        async def run():
            body_blank, ct_blank = multipart_image("blank.png", make_blank_png(), "image/png")
            with patch.dict(os.environ, {"AGRIGUARD_YOLO_ENABLED": "false"}, clear=False):
                st_off, js_off = await call_asgi("POST", "/predict/detect", body_blank, ct_blank)
                self.assertEqual(st_off, 503)
                self.assertEqual(js_off["inference_status"], "UNAVAILABLE")

            env = {
                "AGRIGUARD_YOLO_ENABLED": "true",
                "AGRIGUARD_YOLO_MODEL_PATH": str(MODEL_PATH),
                "AGRIGUARD_YOLO_CONFIDENCE": "0.25",
                "AGRIGUARD_YOLO_IOU": "0.45",
            }
            with patch.dict(os.environ, env, clear=False):
                body_bad, ct_bad = multipart_image("bad.txt", b"not an image", "text/plain")
                st_bad, _ = await call_asgi("POST", "/predict/detect", body_bad, ct_bad)
                self.assertEqual(st_bad, 400)

                img_path = TEST_IMAGES_DIR / "BACTERIALBLIGHT2_080_jpg.rf.14e6f1895ea800b23e33f322df0e747f.jpg"
                img_bytes = img_path.read_bytes() if img_path.is_file() else make_blank_png()
                mime = "image/jpeg" if img_path.is_file() else "image/png"
                body_ok, ct_ok = multipart_image("rice.jpg", img_bytes, mime)
                st_ok, js_ok = await call_asgi("POST", "/predict/detect", body_ok, ct_ok)
                self.assertEqual(st_ok, 200)
                self.assertEqual(js_ok["model_family"], "yolov8n")
                self.assertEqual(js_ok["provenance"]["label_schema"], "rice_v1_9class")
                self.assertIn(js_ok["inference_status"], ("SUCCESS", "NO_DETECTIONS"))
                self.assertIsNone(js_ok["status"])
                self.assertIsNone(js_ok["damage_pct"])

                st_info, js_info = await call_asgi("GET", "/model-info")
                self.assertEqual(st_info, 200)
                self.assertIn("v2", str(js_info))

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
