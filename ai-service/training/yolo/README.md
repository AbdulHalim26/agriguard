# AgriGuard — YOLO26 training foundation (PHASE 1A)

Separate from the existing EfficientNet scripts. Nothing here downloads a dataset,
starts training automatically, or makes a rice detection accuracy claim.

## Prerequisites and annotation protocol

- A dedicated approved ML environment with `training/yolo/requirements.txt`, a
  compatible PyTorch/torchvision pair, and locally supplied **YOLO26n or YOLO26s
  detection** weights. The serving image still requires no torch/Ultralytics.
- A real rice bounding-box dataset with source URLs, reviewed licensing, annotation
  reviewers/protocol, and **global** event/field/video/session group IDs. Classification
  labels, pseudo-labels inferred from folder names, or disease names alone are not boxes.
- Review licensing of Ultralytics (AGPL-3.0 / commercial alternatives) and the actual
  chosen weights/data before distribution; no license is assumed for external data.

`detection/taxonomy.json` defines canonical IDs 0–5:

| ID | Class |
|---|---|
| 0 | `leaf_blast` |
| 1 | `bacterial_leaf_blight` |
| 2 | `brown_spot` |
| 3 | `sheath_blight` |
| 4 | `tungro_symptom` |
| 5 | `leaf_folder_damage` |

Copy/edit `classes.example.json` OUTSIDE the source tree. All classes are disabled
by default. A reviewer must select enabled classes, annotation level (`lesion` or
`leaf`), source provenance, and positive **minimum instances AND independent
groups per class per split**. These are reviewer-specified data-quality gates,
not scientifically sufficient sample-size guarantees. If the data cannot meet
the floors, preparation stops rather than inventing labels or leaking groups.

One class has one annotation level for a run. Do not mix whole symptomatic leaves
with small lesions under the same class. `tungro_symptom` is a visual symptom label,
not confirmation of viral infection. No healthy/background class is inferred.
An empty TXT is allowed only for an explicitly reviewed negative image; it is not
a claim that the crop is healthy or that all possible disease classes were screened.

Input annotation TXT: canonical `class_id cx cy width height`, normalized to `[0,1]`
on the **EXIF-oriented image**. Five values per line, finite coordinates, positive
dimensions, and boxes inside the image. Disable a class only after filtering/reviewing
the dataset: annotations of disabled classes cause an error, never silent omission.

CSV inventory (relative paths under the supplied input root):

```csv
image,labels,group_id,source_id,reviewed,negative_reviewed
images/image_a.jpg,labels/image_a.txt,field_event_session_a,reviewed_source_a,true,false
```

This is a format example, NOT a supplied dataset. `sources` in the config must
contain matching `{id, url, license, license_verified: true}` records, using public
attribution URLs without credentials/query tokens. Local/private image paths are
not exposed by the detection API.

## Prepare and validate

Run from the repository root (absolute data paths recommended):

```sh
PYTHONPATH=ai-service ai-service/.venv/bin/python -m training.yolo.prepare_dataset \
  --root /absolute/path/to/reviewed-input \
  --inventory /absolute/path/to/inventory.csv \
  --config /absolute/path/to/reviewed-classes.json \
  --output /absolute/path/to/new-prepared-dataset --seed 42
```

Preparation rejects paths outside the input root, malformed/classification labels,
unreviewed records, unsupported images, duplicate/conflicting annotations, and
insufficient independent groups. Exact EXIF-normalized RGB duplicates are counted
once and connect related groups before splitting. Near-duplicates require human
review and shared group IDs; pixel deduplication does not solve near-duplicate leakage.

Images become EXIF-free RGB PNGs, max side 1280 (normalized boxes unchanged). Compact
training IDs are generated only for enabled classes; the manifest records their
mapping back to stable canonical IDs. Outputs include `data.yaml`, `manifest.json`,
and `images/labels/{train,val,test}`. Target split is 70/15/15; actual proportions vary
because groups never split. All enabled classes must meet the chosen floors in all
three splits. Seeded bounded split search is reproducible and fails closed when no
adequate assignment is found. Existing output directories are never overwritten.

Every ML command rechecks image/label hashes, manifest identity, group isolation,
class mapping, and the YAML. `download` directives and arbitrary YAML overrides are
not accepted. If moving a prepared dataset, regenerate its YAML `path` deliberately;
do not change its image/label contents or split identities to make a test pass.

PHASE 1B.0 additionally rejects undeclared image/label files and symlinks in the
prepared dataset; directory-scanning trainers must not silently include data absent
from the manifest. Negative-image review evidence is retained per sample. Older
prepared manifests with negative images but no review evidence must be recreated
from their reviewed inventory into a NEW directory, not silently approved.

## Read-only training-readiness gate (PHASE 1B.0)

```sh
# No dataset/checkpoint needed: reports versions and detected PyTorch devices.
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.readiness --environment-only

# Validates actual prepared data and existing local weights. Never trains/downloads.
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.readiness --dataset /absolute/path/to/new-prepared-dataset \
  --weights /absolute/path/to/local-yolo26n.pt --family yolo26n
```

Output goes to stdout, without writing a report or mutating the dataset. Exit 2 /
`NO_GO` means missing/invalid inputs/dependencies or synthetic-only data. An otherwise
passing preflight is `CONDITIONAL_GO`: reviewed permissions, near-duplicate candidates,
hardware suitability and the actual experiment still require operator verification.

The report counts images/instances/groups per class and split, reviewed negatives,
exact duplicates removed and declared source provenance. Canonical IDs remain stable
even if compact training IDs differ. A bounded dHash scan flags visually similar
images from different groups/splits. It neither changes groups nor asserts disease
labels. Candidate pairs can be false positives; an absent match does not prove no
leakage. Truncation is explicit and requires additional review for large datasets.
Usage/licensing status remains reviewer-declared, not independently verified by a
boolean flag. Real permissions and source/version evidence must be checked manually.

## Explicit training, evaluation and export

Install the separate requirements only in an approved ML environment. Local PHASE
1A development did not install torch/Ultralytics/onnx or execute these ML stages.
No command below uses the internet to fetch weights or data. Supply existing local
files; Ultralytics auto-install is disabled. AMP checks/plots that may fetch extra
weights/fonts are disabled. Exact GPU bitwise reproducibility is not guaranteed;
run metadata records versions, seed, configuration and weight/dataset hashes.

```sh
PYTHONPATH=ai-service ai-service/.venv/bin/python -m training.yolo.train \
  --dataset /absolute/path/to/new-prepared-dataset \
  --weights /absolute/path/to/local-yolo26n.pt --family yolo26n \
  --output /absolute/path/to/new-run --output-format end2end_xyxy \
  --epochs 50 --batch 8 --imgsz 640 --seed 42 --device cpu \
  --lr0 0.001 --lrf 0.01 --weight-decay 0.0005 --patience 15

PYTHONPATH=ai-service ai-service/.venv/bin/python -m training.yolo.evaluate \
  --dataset /absolute/path/to/new-prepared-dataset --run /absolute/path/to/new-run \
  --checkpoint /absolute/path/to/new-run/weights/best.pt \
  --output /absolute/path/to/new-evaluation --device cpu

PYTHONPATH=ai-service ai-service/.venv/bin/python -m training.yolo.export_onnx \
  --dataset /absolute/path/to/new-prepared-dataset --run /absolute/path/to/new-run \
  --checkpoint /absolute/path/to/new-run/weights/best.pt \
  --metrics /absolute/path/to/new-evaluation/metrics.json \
  --output /absolute/path/to/new-artifacts/rice.onnx --model-version rice-yolo26n-v1
```

Use the intended device explicitly; none of these commands is automatically run by
the application. Only validation selects `best.pt`; test is evaluated afterward.
Reported metrics are genuine `model.val(split="test")` results, not placeholders.
Architecture, compact names and dataset/checkpoint/head provenance are checked.
Unknown Ultralytics head APIs or layouts stop export instead of guessing.

`baseline.yolo26n.json` records this **PLANNED_NOT_RUN** reference experiment and
matches the explicit CLI defaults. It is not an automatic launch configuration.
Use a verified CUDA host (`--device 0`) for the full baseline when available; CPU is
portable but can be slow, and Apple MPS needs a real PyTorch compatibility check.
If changing batch/device/augmentation, use a new run ID and record the difference.
`run.json` records the optimizer schedule and hashes Ultralytics' effective
`args.yaml`; learning-rate/early-stopping defaults are no longer implicit in a package
version. These hyperparameters are starting choices, not validated optimal settings.

The exporter uses static batch 1, FP32, NCHW, opset 17. It runs ONNX checker and
compares PyTorch and ONNX on the SAME shared preprocessing tensors: two seeded
random inputs plus real validation images covering every enabled class. It then
exercises the actual serving adapter. Shape/nonfinite/numeric mismatches fail the
export. NMS-free top-k ties can cause parity failure; inspect the artifact rather
than relaxing checks silently. `.onnx`, `.metadata.json`, `.export-report.json`
are published in a NEW slot only after success (readiness sidecar last).

The reusable parity command is `python -m training.yolo.parity --help`. Its report
proves tensor compatibility only, not rice detection quality, field generalization,
or calibrated damage. Datasets marked `purpose: synthetic_test` export test-only
artifacts which the production loader refuses.

## Decoder compatibility reference

Reviewed upstream documentation: https://docs.ultralytics.com/guides/end2end-detection/
and https://docs.ultralytics.com/models/yolo26/ . These docs distinguish:

- `raw_cxcywh_bcn`: `nms=None`, `(1,4+nc,N)` cx/cy/w/h + per-class probabilities;
  adapter confidence filter and class-aware NMS.
- `end2end_xyxy`: `nms=False`, `(1,N,6)` x1/y1/x2/y2/confidence/compact-class-id;
  one-to-one head, confidence filtering only, NO second NMS pass.

`nms=True` embedded-NMS exports, segmentation, pose, OBB, objectness-style YOLOv5,
dynamic batches and FP16 are not supported in this foundation. Tensor shape alone
cannot identify the head. Exporter writes explicit format/family ONNX metadata;
serving verifies it against the checksum-bound manifest and native class metadata.

## Manual dataset acquisition and annotation import (PHASE 1B.0.1)

See `docs/DATASET-SOURCES-1B01.md` for the two candidate source/version reviews,
`docs/APPLE-M1-YOLO-SETUP.md` for an isolated approved ML environment, and
`docs/YOLO26-CHECKPOINT-ACQUISITION.md` for official initial-weight provenance.
No dataset/model download, automatic extraction, heavy installation, or training
is performed by the importer. Keep raw exports/archives unchanged outside outputs.

### 1. Inspect a MANUALLY obtained YOLO TXT export

Use an extracted directory with `data.yaml` plus `train/valid/test` (or equivalent)
`images`/`labels` pairs. Classification-only folders and segmentation polygons are
not accepted as detection boxes. Source YAML paths/download instructions are never
executed; actual local pairs are inspected. Missing label files are errors, not
invented negative annotations.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.import_yolo inspect \
  --source-root /absolute/path/to/immutable-manual-export \
  --output /absolute/path/to/NEW-inspection
```

`inspection.json` records actual source class names/counts and an export fingerprint.
`review.csv` starts with `pending`, blank groups/reviewer IDs and negatives false.
Inspection is not approval and creates no training input. It reads valid normalized
5-column bbox rows only, never inventing boxes or inferring diagnoses from filenames.

### 2. Real source/mapping/image review

Copy the matching `sources/*.proposal.json` to a private review directory. These
proposals are intentionally inactive. A real reviewer must:

- Check the **actual** `data.yaml` labels, not assume overview ordering/taxonomy.
  Unknown labels stop import until explicitly reviewed. Use `map`, `exclude_image`
  or `healthy_background`; there is no fuzzy matching or implicit alias collapse.
- Fill selected version, fingerprint, license URL/attribution, genuine permitted-use
  review for training/evaluation, and source/license snapshot files with real SHA-256.
  Evidence paths are relative to the policy file's directory, confined there, and
  copied/checksummed into the imported bundle.
- Supply reviewer/protocol, reviewed global grouping, explicit per-label approval
  and actual `lesion` versus `leaf` scope. Aliases with conflicting scope cannot be
  merged. All existing canonical training classes remain inactive until the later
  reviewed class config meets instance/group floors; importing does not enable them.
- For EVERY image, set `include` or `exclude`, reviewer ID and note. Included rows
  need a global event/field/session/progenitor group ID. Images sharing an original
  across augmentations, source splits or datasets must share the same global group.
- Mark an included empty/Healthy-only image negative only after actual visual review
  for the selected target classes. Healthy boxes never become disease detections.
  Mixed Healthy + approved disease can retain only the real disease boxes, with the
  explicit healthy omission recorded. Unsupported/ambiguous disease in ANY box
  requires exclusion of the whole image, preventing unlabelled disease background.

Never fill reviewer/approval/evidence fields with invented values. If a source
annotation needs correction, make a NEW reviewed source copy and inspect it again;
do not mutate the preserved original export to bypass its fingerprint.

### 3. Import into a NEW reviewed bundle

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.import_yolo import \
  --source-root /absolute/path/to/immutable-manual-export \
  --review /absolute/path/to/NEW-inspection/review.csv \
  --config /absolute/path/to/genuinely-reviewed-source-policy.json \
  --output /absolute/path/to/reviewed-root/source-a
```

This copies approved images into new names, translates real box IDs to canonical
IDs, preserves hashes/reviewer decisions/attribution/evidence and source-split
history, and generates an existing-pipeline `inventory.csv`. `import.manifest.json`
contains canonical distribution and exclusions; `training_enabled` remains false.
No numeric coordinates are fabricated. Copy/label/evidence changes are detected.
The output must not exist and cannot be inside/above the immutable raw input.

### 4. Combine before a NEW global split, never merge existing source splits

Import each approved source/version to a distinct child under the same reviewed
root. Source IDs must be unique. The combine step also works for a single bundle:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.import_yolo combine --root /absolute/path/to/reviewed-root \
  --bundles /absolute/path/to/reviewed-root/source-a /absolute/path/to/reviewed-root/source-b \
  --output /absolute/path/to/NEW-combined-index
```

It verifies bundle/data/evidence/policy hashes and consistent annotation scope,
then writes a combined inventory and `sources.json` without modifying bundles.
Copy the source records into a genuinely reviewed `classes.example.json` derivative;
set only supported, adequately annotated canonical classes active and their reviewed
floors. Do not blindly enable the absent `leaf_folder_damage` class or ambiguous
source labels. Preserve the two sources' attributions and modification notices.

Run existing `prepare_dataset` with `--root` equal to the common reviewed root,
`--inventory` equal to the combined inventory, and a NEW output directory. Run the
existing readiness report and resolve exact/near-duplicate, class, negative-image
and grouping issues BEFORE freezing any split or training. Evidence paths in source
records describe original review files; copied evidence lives in each bundle's
`provenance/<index>.<extension>` and is checked during combine. Never delete these
bundles or the source evidence ledger merely because preparation succeeded.

## Mixed bbox/polygon VISUAL QA (PHASE 1B.0.3)

The real rice-v1 export is mixed-format and remains rejected by the bbox-only
importer. Do not skip polygon rows or mark their images negative to make it pass.
Use `python -m training.yolo.qa_gallery --help` to build an offline review package
in a NEW directory outside the immutable source. It keeps original annotations,
shows selected orange-dashed envelope proposals separately, creates contact sheets
and queues all cross-split similarity pairs. It does NOT export converted labels.

See `docs/MIXED-ANNOTATION-QA-1B003.md` for the draft conversion/scope/mapping policy,
verified ZIP provenance and structured human workflow. `qa_review` validates a
human-edited copy of `reviews.pending.jsonl` against the catalog, original source
and hashed visuals. Pending/revise/unresolved records remain PENDING (exit 2), never
approved training. Even resolved QA records do not authorize conversion or group
merges. Source splits, canonical IDs, licenses and detector flags are unchanged.

## Offline interactive human-review pilot (PHASE 1B.0.4)

`python -m training.yolo.review_dashboard --help` builds a NEW interactive dashboard
over an unchanged QA package. It reuses review IDs/source hashes, the 96-image
representative selection and a focused pair queue. Local classic scripts need no
server/CDN or ML dependency. Decisions live in memory until the reviewer explicitly
downloads a versioned delta; no source/repository auto-save occurs.

See `docs/OFFLINE-REVIEW-PILOT-1B004.md` for zoom/filters, one-record-only decisions,
strict version-chain import/export, conflict handling and Python validation:
`python -m training.yolo.review_export --help`. Initial/partial decisions remain
pending; read-only conversion assessments are NOT converted datasets or approvals.

### UI-only refinement (PHASE 1B.0.4A)

Use `review_dashboard --refresh-from <existing-dashboard> --source-root <raw> --output
<NEW-output>` for the responsive three-panel workspace, literal search/pagination,
fit/zoom and readable metadata. It preserves the old logical dashboard ID and exact
decision core so saved revision chains remain compatible. Old directories/tabs and
human files are not overwritten. See `docs/OFFLINE-REVIEW-UX-1B004A.md`. No review
schema, Python validator, source/catalog fingerprint or training gate changes.
