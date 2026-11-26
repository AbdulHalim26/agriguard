# PHASE 1B.0.1 — Public dataset source review and mapping proposal

Public metadata checked **2026-11-14**, without requesting dataset archives, weights,
image batches, hosted inference or authenticated account access. Counts below are
publisher catalog/version counts, NOT verified unique/usable training images.

## 1. RICE_LEAF_DISEASE_DETECTOR — preferred first candidate for manual QA

- Project: https://universe.roboflow.com/ricedisease-zwll3/rice_leaf_disease_detector
- Displayed uploader: `ricedisease`; task **Object Detection**; displayed **CC BY 4.0**.
- Overview shows **950 images**, 3 versions and 7 classes. No project description
  establishes original photographers, collection sites, annotation protocol or
  diagnostic expertise. The uploader's underlying rights are **UNVERIFIED**.
- Version 3: https://universe.roboflow.com/ricedisease-zwll3/rice_leaf_disease_detector/dataset/3
  shows **2268 outputs**, train/valid/test **1977/194/97**, auto-orient, 3 outputs per
  training example and flips/rotations/crops/shears (including box transforms).
  These transformed outputs are not independent acquisition events.
- Version 1: https://universe.roboflow.com/ricedisease-zwll3/rice_leaf_disease_detector/dataset/1
  shows **1143 images**, **799/231/113**, auto-orient and no version-level augmentation.
  However its previews include **False-Smut and Stem-Rot**, absent from the current
  overview's seven classes. Do not assume identical taxonomy across versions or
  that no offline augmentation exists in the original uploads (`aug_...` names
  already appear in overview previews).
- Both inspected version pages advertise YOLO26/v8 TXT + YAML and other exports.
  Actual archive annotations, bbox scope/completeness, duplicates and class
  distribution remain **UNVERIFIED** until manually obtained and reviewed.

Recommendation: inspect a specific export's `data.yaml`, original/progenitor image
availability, attribution and boxes before selecting the version. Prefer original
unaugmented inputs **if taxonomy/provenance can also be established**; do not select
v1 blindly, combine versions as independent samples, or trust the source split.

## 2. Project titled IRRI rice leaf Disease Detection — secondary, higher QA burden

- https://universe.roboflow.com/irri-rice-leaf/irri-rice-leaf-disease-detection
- Displayed workspace `IRRI rice leaf`, task **Object Detection**, **CC BY 4.0**,
  overview **342 images**, 4 versions and 11 classes. A workspace name does not
  establish official IRRI institutional affiliation, original authorship, or
  diagnosis validation. No project description is supplied.
- Version 4: https://universe.roboflow.com/irri-rice-leaf/irri-rice-leaf-disease-detection/dataset/4
  shows **822 outputs**, **720/51/51**, stretch to 512x512, auto-orient and 3 outputs
  per training example with flips/rotations/color/blur. Geometric stretching and
  offline derivatives need review; there is no verified acquisition-group ledger.
- Its version list names v3 `SRC Image`, 342 images, stretch to 640x640. Direct v3
  retrieval returned **403** during review; its full preprocessing/augmentation
  details must not be assumed. A manually inspected v3 export may be preferable,
  but this is not yet a verified unaugmented source.
- YOLO26/v8 TXT + YAML export is advertised by v4. Actual numeric class IDs are
  unknown until the chosen archive's YAML is read. Do not copy overview order into
  a label decoder. Hosted model metrics are unrelated to AgriGuard and not evidence
  of annotation correctness or a trained AgriGuard checkpoint.

## 3. Exact-label mapping PROPOSAL — no approvals or class enablement

Canonical IDs stay fixed. Mapping proposal files are inactive (`approved: false`,
null bbox scope/version/fingerprint, empty reviewer/evidence) until genuine review.

| Actual documented source label | Canonical target | Decision before review |
|---|---|---|
| `Rice-Blast`; `Blast of rice` | 0 `leaf_blast` | Candidate only; confirm **leaf** blast, not neck/panicle blast |
| `Bacterial-Leaf-Blight`; `Bacterial leaf blight of Rice` | 1 `bacterial_leaf_blight` | Candidate; review diagnosis and bbox scope |
| `Brown-Spot` | 2 `brown_spot` | Candidate; do not include narrow brown spot |
| `Brown spot of leaf`; `Brown spot of rice leaf`; `Brown spot of riceleaf` | 2 `brown_spot` | Separate approval per label; aliases are NOT silently merged |
| `Sheath-Blight` | 3 `sheath_blight` | Candidate from source 1; verify anatomy/scope |
| `Tungro-Virus` | 4 `tungro_symptom` | Candidate visual symptom, NOT confirmation of viral infection |
| `Healthy` | No disease class | Explicit background action; separate image-level negative review required |
| `Narrow-Brown-Spot` | None | Exclude images containing unsupported diagnosis, not relabel as brown_spot |
| `Blight of rice`, `Dot diseases`, `b`, `objects` | None | Ambiguous; exclude pending expert correction in a NEW reviewed copy |
| `bite of caterpillar` | None | Generic caterpillar injury is not proven leaf-folder damage |
| `Smut`, `False-Smut`, `Stem-Rot` | None | Outside the six-class canonical taxonomy |

**5 `leaf_folder_damage` is not supported by an unambiguous documented label in
either project.** All six canonical training classes remain inactive in the existing
template until actual reviewed counts meet the chosen class/group adequacy floors.
Scope must be `lesion` or `leaf`, approved from the actual boxes, not guessed from
the label. Sources with inconsistent scope for the same canonical class cannot be
combined by the importer.

## 4. License and provenance evidence required before import

Both project pages currently link https://creativecommons.org/licenses/by/4.0/ .
CC BY 4.0 allows sharing/adaptation, including commercial purposes, subject to
attribution, license link, change notices and no additional legal/technical
restrictions on licensed material. This does not independently establish uploader
rights or grant unrelated privacy/publicity rights.

Keep the chosen version URL, download date, archive SHA-256, original attribution/
README/license files, source/license page snapshots and evidence checksums. Review
training/evaluation permission explicitly; assess derived-model/data redistribution
separately for the intended release. Retain earlier credits and modification notes
when remapping labels or omitting Healthy boxes. Do not imply source endorsement.
No source/license reviewer approval was supplied or fabricated in this phase.

## 5. Acquisition procedure (manual only)

1. An authorized reviewer chooses a fixed version after checking taxonomy and rights.
2. Manually download a **YOLO object detection TXT + YAML** export (not classifier,
   segmentation polygon, hosted inference or an unrelated trained model).
3. Preserve the archive unchanged, compute `shasum -a 256` locally and record it.
   Extract manually into a separate immutable-source directory; importer never
   extracts archives or invokes export YAML download directives.
4. Retain source README/license and record raw-to-derived parentage for videos,
   crops, augmentations and redistributed images. Do not invent group IDs from
   disease names. Different sources may reuse the same original photos.
5. Follow the importer and review instructions in `ai-service/training/yolo/README.md`.
   Group IDs must be global across both sources. Combine reviewed inventories
   **before** creating the new group-aware train/val/test split.

Source project/version pages, the CC deed and official environment/checkpoint docs
were read as public documentation only. No dataset files were acquired, box quality
was not visually certified, and no disease detection results are asserted.

## Executed local tooling verification

- **51 Python tests passed**, including 14 synthetic manual-import/provenance cases
  and the existing detector/legacy/dataset suite. Real EfficientNet compatibility
  still executes; no real data approvals or rice-detector evaluation are simulated.
- **39 Node security/contract tests passed**; prior receipt/auth/offline guards remain.
- Importer and checkpoint recorder CLI `--help` entry points executed successfully.
- `git diff --check` and targeted new-file whitespace checks passed.
- No TypeScript/build rerun was needed for this Python/tooling/documentation-only
  change; no new frontend/deployment validation is claimed.
- Real source import, actual license/diagnosis QA, official weight checksum, ML
  package installation, MPS operation probes, real training and export remain
  **UNVERIFIED/BLOCKED pending the manual prerequisites**. Tooling is ready for
  reviewed acquisition; PHASE 1B.1 real training remains **NO-GO**.
