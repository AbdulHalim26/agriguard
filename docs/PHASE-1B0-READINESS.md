# PHASE 1B.0 — Dataset & training readiness

## Decision: NO-GO for real PHASE 1B.1 training in the current environment

This stage prepared validation/configuration tooling; it did not train, evaluate,
download weights/data, install heavy packages, change flags/credentials, migrate,
deploy, commit or push. PHASE 0A/0A.1 and the independent PHASE 1A detector remain.

## Repository inventory actually inspected

| Available | What it proves / does not prove |
|---|---|
| `ai-service/model/model_v2.onnx`, legacy ONNX and safetensors | EfficientNet classifier artifacts, NOT YOLO26 rice detectors |
| `ai-service/tests/samples/` — 3 images | Classification/inference examples; no reviewed bounding-box annotations |
| `video_arsip/` — 18 videos | Raw archive only; no annotation inventory or verified rights/group manifest found; not decoded/modified |
| `ai-service/training/sources.example.json` | Disabled historical dataset candidates with claimed licenses; not downloaded data or a six-class detection dataset |
| `training/yolo/classes.example.json`, `data.example.yaml` | Inactive templates; sources/reviewer/adequacy floors still unfilled |

No actual YOLO `.pt` checkpoint or reviewed YOLO dataset manifest/inventory was
found under the repository's inspected data/model/training paths. No external
private directories/cloud accounts were searched. Per-class real box counts,
negative-image quality, source permissions and real train/val/test leakage are
therefore **UNVERIFIED**, not assumed zero defects or inferred from classification.

Canonical IDs remain: 0 `leaf_blast`, 1 `bacterial_leaf_blight`, 2 `brown_spot`,
3 `sheath_blight`, 4 `tungro_symptom`, 5 `leaf_folder_damage`. No class is enabled
merely because its name occurs in an old classification catalog.

## Local environment checked

- Python 3.12.15, Darwin arm64, Apple M1, 8 logical CPU cores, 16 GiB memory.
- ONNX Runtime 1.31.0, NumPy 2.5.3, Pillow 12.3.0, Pydantic 2.14.0,
  PyYAML 6.0.3 available.
- PyTorch, torchvision, Ultralytics and ONNX authoring package absent.
- Apple GPU hardware is present; **MPS/CUDA usability via PyTorch is UNVERIFIED**.
  No acceleration benchmark or training attempt was performed.
- Readiness CLI without supplied data/weights returns expected `NO_GO` with missing
  packages, unverified compute, absent prepared dataset and checkpoint blockers.

YOLO26n/s compatibility is enforced in code by architecture/scale/head checks and
the existing export parity gate. Compatibility of a real installed Ultralytics
version/checkpoint remains unverified until the separate ML environment exists.

## Necessary local improvements

1. Prepared dataset validation now rejects unmanifested image/label files, symlinks,
   inconsistent split paths and class mappings; the actual trainer scans folders.
2. Negative review evidence and exact input/dedup counts survive preparation.
3. `training.yolo.readiness` reports class/split/source distributions, negatives,
   group counts and bounded cross-group dHash similarity candidates, without editing
   inputs. Candidates are review hints, never automatically merged or relabeled.
4. Explicit AdamW schedule/early-stopping options and the planned baseline JSON
   reduce version-dependent defaults. Effective trainer arguments are hashed.

## Proposed baseline — PLANNED_NOT_RUN

| Parameter | Reference |
|---|---|
| Candidate | YOLO26n first; YOLO26s as a separate later comparison |
| Deployment head | `end2end_xyxy` (one-to-one / NMS-free) |
| Input | 640 × 640, batch 8 |
| Schedule | 50 epochs max, patience 15, seed 42 |
| Optimizer | AdamW, lr0 0.001, lrf 0.01, weight decay 0.0005 |
| Stability | deterministic true, workers 0, AMP false, close mosaic last 10 epochs |
| Compute | Prefer verified CUDA (`--device 0`); CPU reference remains available; MPS conditional |
| Split | Frozen group-aware ~70/15/15, class adequacy gates chosen by reviewer |
| Selection | Validation only selects best.pt; test holdout evaluated afterward |

These are baseline choices, not an accuracy/optimality claim. Preserve the exact
dataset manifest, class mapping, source/usage evidence, seed, package versions,
effective args and checkpoint hashes. Near-duplicate review must include frames,
crops and augmented derivatives of the same acquisition event across sources.

Export remains batch-1 static FP32 NCHW, opset 17 with matching native ONNX head
metadata and checksum-bound manifest. NMS-free output is `(1,N,6)` xyxy/confidence/
compact class ID; raw output `(1,4+nc,N)` requires class-aware NMS. PyTorch/ONNX
parity uses shared preprocessing and validation images. No change to these serving
contracts or legacy severity/receipt behavior occurred in PHASE 1B.0.

## Exact prerequisite handoff for PHASE 1B.1

1. Provide an approved local input root, CSV inventory, reviewed class/source config,
   and local YOLO26n detection `.pt` file. Preserve the canonical class IDs. Supply
   genuine normalized boxes and explicit reviewed negatives, source version/license/
   permitted training and redistribution usage evidence, and global session group IDs.
2. A reviewer must resolve annotation scope (lesion versus whole leaf), duplicates,
   source-derived leakage and per-class sample/group adequacy; keep insufficient
   classes disabled. Do not convert folder labels to invented boxes.
3. Provision an approved isolated ML environment manually; no heavy dependency or
   weight download is authorized/performed by this stage. Verify imports, actual
   YOLO26n/s head API compatibility and the intended CPU/CUDA/MPS device there.
4. Run `training.yolo.prepare_dataset` into a NEW directory, then
   `training.yolo.readiness --dataset <prepared> --weights <local.pt> --family yolo26n`.
   Review its class/split/negative/source/near-duplicate results; resolve blockers and
   record the human review. Reprepare rather than changing frozen split identities.
5. Only then explicitly launch `training.yolo.train` with the baseline command in
   `ai-service/training/yolo/README.md`, using a NEW run ID and the verified device.
   Evaluate the frozen checkpoint and export/verify ONNX after training, never enable
   the serving feature flag merely because training starts.

PHASE 1B.0 changes and tests do not independently verify external dataset licenses,
actual annotation correctness, detector mAP or field generalization. No fake training
run or replacement checkpoint was generated.

## Executed verification

- Python detector/legacy/dataset/readiness tests: **37 passed**. Nine new cases
  cover manifest closure, mapping/split paths, negative-review evidence, provenance
  counts, bounded near-duplicate hints, explicit baseline options, source review,
  symlinks and fail-closed readiness. Fixtures are synthetic, not trained results.
- `npm run test:security`: **39 passed**; existing auth/report/offline/detector
  contract regressions remain covered.
- `training.yolo.readiness` with no supplied dataset/checkpoint: expected
  **NO_GO**, exit 2, listing actual missing prerequisites.
- Updated training/readiness CLI `--help`: passed; no ML job was launched.
- `git diff --check`: passed.
- TypeScript and build were not rerun in this Python/documentation-only stage;
  their previously reported PHASE 1A results are not new PHASE 1B.0 evidence.
- Real dataset QA, real YOLO26n/s checkpoint compatibility, training/evaluation,
  ONNX authoring/export and real PyTorch/ONNX parity remain **UNVERIFIED/BLOCKED**.
