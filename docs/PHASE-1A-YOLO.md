# PHASE 1A — YOLO detection foundation

## Architecture and OFF-by-default activation

Existing `/predict` still runs EfficientNet-B0 and keeps `status`, `confidence`,
`damage_pct`. Detector dependencies are isolated; no replacement model is bundled.

```text
scan compressed/oriented photo ── /api/ai/analyze ── /predict (EfficientNet)
        │                             └─ existing user/photo-bound receipt → report
        └─ when enabled: /api/ai/detect ── /predict/detect (YOLO ONNX)
                                              └─ validated preview → overlay
```

Server-only configuration names (actual environment files were not changed):

| Variable | Default / purpose |
|---|---|
| `AGRIGUARD_YOLO_ENABLED` | `false`; set explicitly in BOTH Next.js and AI service for an isolated detector trial |
| `AGRIGUARD_YOLO_MODEL_PATH` | Unset; AI service only, local ONNX path with matching `.metadata.json` |
| `AGRIGUARD_YOLO_CONFIDENCE` | `0.25`; AI service detector score filter, NOT severity |
| `AGRIGUARD_YOLO_IOU` | `0.45`; raw-head NMS only |
| `AI_API_URL` | Existing server-to-server base URL; never sent to browser |

Feature flag defaults OFF in code and is not set by any script. GET `/api/ai/detect`
reveals only the boolean capability. POST requires the existing hardened session
guard, same-origin requests, MIME/size checks, a per-instance 20/day quota and timeout.
The proxy validates the response and its upload SHA-256; it never passes model paths
or raw backend errors to the browser. Persistent/shared quota remains future work.
Direct FastAPI serving is an internal-service boundary, like existing `/predict`;
this phase does not add an internet-facing AI gateway/auth system.

Missing flag/model/manifest, checksum mismatch, unknown layouts/classes or incompatible
I/O produce explicit unavailable/error responses. A successful empty detection list
is returned only after a loaded compatible detector actually ran.

## Detection contract

Typed Python (`detection/contracts.py`) and Zod (`lib/detection.ts`) schemas include:
model family/version, EXIF-oriented original-upload dimensions, canonical class ID/name,
annotation level, confidence, and `bbox_xyxy`. Box coordinates are continuous pixel
EDGES measured from top-left: `0 <= x1 < x2 <= image_width` and equivalent y bounds.
The image is the exact compressed JPEG/PNG uploaded by scan, not the camera sensor's
pre-compression dimensions. Letterbox scale/padding are inverted before responding.
The six rice classes and their stable IDs are shared/checked across Python and TS.

Result statuses: `SUCCESS` or `NO_DETECTIONS`. Failure statuses: `UNAVAILABLE` or
`ERROR`, always with non-2xx response. `severity_status` is `REVIEW_REQUIRED`.
Legacy field names remain explicit **null** for the uncalibrated detector: no synthetic
severity/confidence/damage percentage is created to fit the old receipt schema.

Provenance includes model/image/dataset manifest hashes, preprocessing, output layout,
postprocessing, filtering thresholds and duration. It identifies source and binding;
it does not assert model accuracy. It is `preview_only`.

## Severity and report integrity

Rectangle-union metrics count overlapping lesion boxes once, separately from leaf
boxes. Lesion/leaf intersection is a geometric envelope ratio, not tissue damage.
Leaf-level disease boxes are not automatically treated as lesion area. No-detection
does not imply healthy. All results remain uncalibrated and require human review.
`SeverityEngine` is a future expert-calibrated policy seam; no clinical/insurance
thresholds or arbitrary percentage mapping have been added.

YOLO previews are NOT persisted into the legacy `ai_analyses` severity receipt table.
Current PHASE 0A receipts require valid legacy status/confidence/damage fields, which
an uncalibrated detector cannot honestly provide. Scan keeps the EfficientNet receipt
or explicit manual workflow for submission; fake detector fields cannot bypass it.
No database/schema changes were made in PHASE 1A. Persisting full detector evidence
with its own server-verifiable receipt is PHASE 1B scope and needs reviewed schema
work after the existing security integration blockers have been resolved.

## Frontend

Existing scan layout adds a gated detector section and reusable DetectionOverlay.
The same EXIF-normalized Blob is used for display, both analyses and reporting.
Overlay uses exact aspect ratio, `object-contain`, percentage scaling, and natural
dimension checks. No boxes are rendered until image dimensions match the response.
Labels, confidence, annotation level, model version, loading/unavailable/error states,
empty results and REVIEW_REQUIRED are visible. Legacy output is explicitly labeled
EfficientNet when detection is enabled; it is never represented as YOLO output.

## Dataset/training and verification

See `ai-service/training/yolo/README.md` for reviewed annotation inputs, class
enablement, group-aware splitting, reproducible local training, holdout evaluation,
ONNX export and tensor parity. Existing EfficientNet training files were not modified.

Synthetic unit tests are confined to temporary folders. Test ONNX graphs are marked
`purpose: synthetic_test`; production refuses them. Tests exercise ONNX Runtime,
coordinate geometry, head-specific NMS, validation, ASGI routing, severity review,
annotation validation, deduplication/splits and tamper detection. Existing real
EfficientNet weights are also exercised for contract compatibility, NOT accuracy.
Frontend tests render markup and validate geometry/provenance with synthetic fixtures;
they do not establish browser/device correctness or real trained-model performance.

Safe local checks (repository root):

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m unittest discover -s ai-service/tests -p 'test_*.py' -v
npm run test:security
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
git diff --check
```

### Executed local results

- Python runtime/ASGI/dataset tests: **28 passed** (15 detector/legacy compatibility,
  13 dataset/parity/artifact-publication tests). Synthetic ONNX graphs were executed by the real ONNX
  Runtime engine; they are not learned rice predictions.
- `npm run test:security`: **39 passed**, including the previous security suite,
  detection contracts/overlay markup, photo binding and legacy receipt protection.
- TypeScript no-emit check, production Next.js build and `git diff --check`: passed.
- All five workflow CLI `--help` entry points ran successfully. This validates
  entry-point loading only, NOT actual training/evaluation/export/parity execution.
- Toolchain used: Python **3.12.15**, ONNX Runtime **1.31.0**, Node **26.8.1**.
  The Docker Python 3.11 image and release-engine Node 24 were not executed here.
- PyTorch, Ultralytics and the ONNX authoring package are unavailable locally;
  actual trained-checkpoint export and PyTorch/ONNX parity remain **UNVERIFIED**.

## Remaining gates

- Real reviewed rice boxes, class adequacy/reviewer decisions, and local YOLO26n/s
  weights are not supplied by this foundation.
- Actual fine-tuning, detection mAP/recall/field validation, real-weight ONNX export
  and PyTorch/ONNX parity require the separate ML environment. No success is claimed
  for those stages until executed with the real checkpoint/data.
- Expert severity calibration, detector evidence persistence and full browser overlay
  testing remain subsequent work. Existing database/SMS/legacy-account production
  gates from PHASE 0A/0A.1 are unchanged; Node 24 release checks remain required.
- No automatic deploy, migration, commit/push, credential change, activation or
  large package/dataset download occurred.
