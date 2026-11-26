# Official YOLO26 checkpoint acquisition — manual only

The official **`yolo26n.pt` detection checkpoint is general COCO-80 pretrained
weights**, not an AgriGuard rice disease model. It has no AgriGuard six-class mapping,
rice holdout evaluation, severity calibration or deployable detector manifest.

## Verified public references (2026-11-14)

- https://docs.ultralytics.com/models/yolo26/ identifies `yolo26n.pt` as detection
  weights and distinguishes detect from `-cls`, `-seg`, `-pose`, `-obb` variants.
- https://github.com/ultralytics/assets/releases/tag/v8.4.0 is the official YOLO26
  asset release. The upstream download helper defaults to this asset tag and lists
  `yolo26n.pt`: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/utils/downloads.py .
- Exact asset URL to inspect/download MANUALLY after approval:
  `https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt`.
  This implementation did not request its binary contents or invent its checksum.
- Licensing: https://www.ultralytics.com/license and the official model documentation
  state AGPL-3.0 / Enterprise options. Review the actual chosen terms for this use;
  public accessibility is not a blanket proprietary redistribution permission.

## Manual acquisition and evidence steps

1. Obtain explicit approval for the weight download and applicable license/use.
   Inspect the official release under `ultralytics/assets`; record tag, asset name,
   asset ID/upload timestamp if available, source URL and the actual license evidence.
2. Manually download **detection** `yolo26n.pt` into a separate immutable weights
   directory. Do not instantiate `YOLO('yolo26n.pt')` as a substitute: it may download
   implicitly. Do not obtain a renamed classifier, segmentation model, arbitrary
   mirror or hosted Roboflow model as the initial checkpoint.
3. Compute a local SHA-256 (`shasum -a 256 /absolute/path/to/yolo26n.pt`). If an official
   publisher digest is exposed in release/API metadata, save and compare it. A local
   hash alone provides identity/change detection, NOT independent authenticity.
4. Copy `training/yolo/checkpoint.example.json` outside the source tree. Fill actual
   release/version/license/source details, evidence paths and hashes, reviewer ID,
   approval status, and optional **real** upstream digest. Do not fill approval or
   hashes with placeholders to make a check pass.
5. Record the file without loading/unpickling or downloading it:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.checkpoint_record \
  --checkpoint /absolute/path/to/yolo26n.pt \
  --config /absolute/path/to/reviewed-checkpoint.json \
  --output /absolute/path/to/NEW-checkpoint-record.json
```

The output includes family, asset release, source/license evidence, file size and
SHA-256, and explicitly records `general_pretrained_detection` plus
`architecture_verified: false`. If no upstream digest was available it says
`LOCAL_DIGEST_ONLY`; it never claims unseen publisher verification or disease accuracy.
Existing metadata is never overwritten. Treat this record and the immutable file
as prerequisite evidence **before any checkpoint load or real training**.

6. In the separately approved ML environment, use `training.yolo.readiness` with
   the prepared dataset and explicit local `.pt` path. The existing `load_yolo`
   gate checks detection task, YOLO26 family/scale, DFL-free dual-head architecture
   and installed API compatibility. This loads trusted model code, so only use the
   official/reviewed file after the origin/license checks above.
7. Preserve the initial weights/record. Fine-tuning produces NEW rice-specific
   checkpoint/run metadata, validation-selected best.pt, holdout metrics and ONNX
   parity report. Only those later artifacts can support an AgriGuard detector.

No real checkpoint was acquired/recorded by this phase; its actual SHA-256 and
runtime compatibility remain **UNVERIFIED**. The record tool's tests use clearly
synthetic byte fixtures and do not claim to validate a trained checkpoint.
