# PHASE 1B.0.1 — Isolated Python 3.12 / Apple Silicon ML setup

**Guide only. Heavy installations, checkpoint downloads and training below have NOT
been run or approved by this implementation.** Keep `ai-service/.venv` intact for
the current EfficientNet/ONNX service; use a NEW environment for ML dependencies.
Never set `AGRIGUARD_YOLO_ENABLED` as part of environment setup.

## Reviewed platform/version evidence

- https://developer.apple.com/metal/pytorch/ documents Apple Silicon MPS with Python
  >=3.10, macOS >=14 for its documented torch 2.11 line, and Xcode command-line tools.
- https://github.com/pytorch/vision#installation pairs torch **2.11** with torchvision
  **0.26**, with Python 3.12 inside the listed supported range.
- https://github.com/ultralytics/ultralytics/releases/tag/v8.4.212 is an official
  software release observed 2026-11-14. It is distinct from weights asset release
  `ultralytics/assets v8.4.0`. A version pin is a candidate, not proof that every
  MPS operator or export works on this machine.
- `training/yolo/constraints-macos-arm64.txt` pins this reviewed candidate pair and
  Ultralytics version; the separate requirements include ONNX authoring/runtime,
  NumPy, Pillow, Pydantic and PyYAML. Freeze the FULL solved environment after checks.

Local inspection found macOS **26.6.2**, arm64 Python **3.12.15**, Apple M1, 16 GiB RAM
and command-line tools at `/Library/Developer/CommandLineTools`. torch/torchvision/
Ultralytics/ONNX authoring are still absent. **Actual MPS availability is UNVERIFIED.**

## Manual steps AFTER explicit installation approval

From the repository root, verify the parent and ensure the new environment does
not already exist before creating it. Do not overwrite/reuse the serving venv.

```sh
uname -m
sw_vers -productVersion
xcode-select -p
python3.12 -c 'import platform; print(platform.python_version(), platform.machine())'
ls -d ai-service
test ! -e ai-service/.venv-ml-m1 && python3.12 -m venv ai-service/.venv-ml-m1
```

The architecture must be `arm64`, not an x86 Python under Rosetta. Missing command-
line tools require a separately approved manual Apple installation. No nightly,
CUDA package/index or source build is required for the proposed MPS environment.

```sh
ai-service/.venv-ml-m1/bin/python -m pip install --upgrade pip
ai-service/.venv-ml-m1/bin/python -m pip install --dry-run --only-binary=:all: \
  -r ai-service/training/yolo/requirements.txt \
  -c ai-service/training/yolo/constraints-macos-arm64.txt
```

Even pip `--dry-run` can retrieve metadata/wheels; it also belongs AFTER download/
installation approval. Inspect solver output and download size before the actual heavy install. If no
compatible wheels exist, STOP and select a reviewed compatible version pair rather
than silently switching architecture, installing nightlies or building from source.

```sh
ai-service/.venv-ml-m1/bin/python -m pip install --only-binary=:all: \
  -r ai-service/training/yolo/requirements.txt \
  -c ai-service/training/yolo/constraints-macos-arm64.txt
ai-service/.venv-ml-m1/bin/python -m pip check
ai-service/.venv-ml-m1/bin/python -c 'import torch, torchvision, ultralytics, onnx, onnxruntime; print(torch.__version__, torchvision.__version__, ultralytics.__version__, onnx.__version__, onnxruntime.__version__)'
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv-ml-m1/bin/python \
  -m training.yolo.readiness --environment-only
```

## Actual MPS and torchvision operation probes (not training)

After approval/install, execute this small numeric sanity check explicitly; it
does not load weights, download examples, train, or make disease predictions:

```sh
ai-service/.venv-ml-m1/bin/python -c 'import torch; print("MPS built:", torch.backends.mps.is_built(), "available:", torch.backends.mps.is_available()); assert torch.backends.mps.is_available(); x=torch.ones((2,2), device="mps", requires_grad=True); (x@x).sum().backward(); torch.mps.synchronize(); print("MPS forward/backward numeric probe passed")'
ai-service/.venv-ml-m1/bin/python -c 'import torch; from torchvision.ops import nms; b=torch.tensor([[0.,0.,10.,10.],[0.,0.,10.,10.]]); print("CPU NMS probe:", nms(b,torch.tensor([0.9,0.8]),0.5).tolist())'
```

A passing tensor probe is NOT proof that YOLO26 dual-head training/export works.
Do not silently enable MPS CPU fallback or disable determinism to hide unsupported
operators. Use a separately named CPU experiment if MPS is unsupported. A verified
CUDA host remains an alternative later, requiring its own approved environment.

For 16 GiB unified memory, begin a later approved real-data experiment with an
explicit batch **2** on MPS; adjust only under a new run ID. Preserve 640px, seed
42, AMP false and workers 0 initially. The reference batch-8 baseline stays intact;
MPS batch-2 is a documented resource variant, not an unreported equivalent run.
Do not change `PYTORCH_MPS_HIGH_WATERMARK_RATIO` to bypass memory protections.

ONNX export/parity remains **CPU FP32, static batch 1, opset 17**. An MPS-trained
checkpoint must be reloaded on CPU for parity, following the existing exporter.
Only the real selected head/output manifest may be served; no automatic flag flip.

Record `pip freeze --all`, `pip check`, Python/macOS/architecture, torch/MPS probe
results and selected checkpoint provenance in the private experiment ledger. The
current stage did not execute these post-install probes or confirm runtime support.
