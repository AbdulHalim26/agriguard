# Serving adapter

The detector is disabled by default and independent of `predict.py`.
See `docs/PHASE-1A-YOLO.md` and `training/yolo/README.md` for configuration,
coordinate/severity contracts, model-manifest generation and known blockers.

Deployable artifacts must be exported through the reviewed workflow, have the
correct ONNX metadata and matching checksum-bound `.metadata.json`, and use a
supported static FP32 YOLO26 detection head. This directory intentionally has no
trained weights, simulated predictions, or automatic model download.
