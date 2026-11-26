# PHASE 1B.0.3 — Human mixed-annotation QA and conversion policy PROPOSAL

**DRAFT / NOT APPROVED. No complete dataset conversion, group merge or training is
implemented or authorized by this review package.** This policy preserves the
PHASE 0A/0A.1 receipt/authorization boundaries and the OFF-by-default detector.

## Verified source identity and upstream discrepancy

Owner-verified original ZIP facts supplied for this phase:

- SHA-256: `f63259c3acac0ec059edc42ad478e1a4b29e6c69f3304b00f2cb3f6dd0c1543a`.
- ZIP integrity passed; **2217 files and 1107 images** in the ZIP itself.
- README says 1143 images. The **36-image difference is an unresolved upstream
  metadata discrepancy, NOT an extraction failure**. Do not invent missing files.
- These ZIP checks were reported by the owner, not re-downloaded/re-extracted by
  the gallery generator. Local source hashes/counts are independently checked.

`training/yolo/sources/rice-v1.archive-evidence.json` records these integrity facts;
they are explicitly NOT license, diagnostic, annotation or conversion approval.

## Local workflow and artifacts

From repository root (output must be NEW and outside the immutable source):

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.qa_gallery \
  --source-root /absolute/path/to/raw/rice-v1 \
  --output /absolute/path/to/NEW-rice-v1-qa \
  --samples 96 \
  --archive-evidence ai-service/training/yolo/sources/rice-v1.archive-evidence.json \
  --expected-source-sha256 93948191df66d81d64f83857c5795f9b100104cc48ce35dc34d3b4ee4b04ec48 \
  --expected-pair-count 985
```

Open generated `index.html` locally; no server/CDN/account or network is needed.

- `source-images/`: byte-identical review copies, not changed training data.
- `samples/`: all images with ORIGINAL annotations and exact original label-line
  references; only the selected representative sample has an additional visual
  proposal panel. Existing **blue solid bbox**, **green polygon**, and **orange
  dashed proposed envelope** have separate visual styles. L denotes source line,
  c denotes SOURCE class ID, not canonical AgriGuard ID.
- `contact-sheets/`: representative previews, not an unbiased evaluation sample.
- `pairs/`, `leakage_queue.csv`: complete prioritized cross-split dHash candidates.
- `qa_catalog.json`: original normalized annotation coordinates, image/label/line
  IDs and hashes, original split, scope unresolved, diagnostics and immutable visual
  evidence hashes. It contains no generated YOLO labels or full converted bbox set.
- `reviews.pending.jsonl`: distinct pending IMAGE, ANNOTATION and PAIR records.
  Nothing is pre-approved; license/training/conversion remain false.
- `qa_summary.json`: counts, coverage and initial pending-review gate.

Sampling covers actual classes, splits, resolutions and formats, with priority for
empty labels, mixed files, unsupported diagnoses, high envelope inflation, potential
shared objects, aug_ names and high-priority similarity buckets. Missing coverage is
reported rather than assumed. Selection never enables a class or changes a split.

## Proposal: polygon -> axis-aligned bounding box

For a valid normalized polygon with vertices `(xi, yi)`:

```text
xmin = min(xi); xmax = max(xi)
ymin = min(yi); ymax = max(yi)
cx = (xmin+xmax)/2; cy = (ymin+ymax)/2
w = xmax-xmin; h = ymax-ymin
```

Only after approval, a future derived label could preserve the SAME source class
ID with those coordinates, then apply a separately approved canonical mapping.
Current code computes envelopes for scalar QA and selected visual proposals ONLY;
no complete YOLO label conversion/export is executed.

Preconditions for a future converter:

1. Retain source path/ID, image SHA, complete original polygon/TXT, original label
   SHA, line number/line SHA, source class, normalization convention and orientation.
2. Check finite in-bounds coordinates, >=3 unique points, positive area/extents and
   topology. A repeated closing vertex is ordinary; malformed/self-intersecting or
   touching/overlapping-boundary cases need review, not silent repair/clipping.
3. Record polygon area by shoelace, envelope area and inflation factor
   `envelope_area / polygon_area` as geometric diagnostics. An axis-aligned envelope
   can include substantial background. None is actual tissue-damage percentage or
   severity. The >5x QA priority marker is a REVIEW heuristic, not an eligibility,
   insurance or expert-calibrated threshold.
4. Review possible duplicate objects when bbox and polygon coexist, or proposed
   envelopes overlap. QA flags same-source-class bbox/polygon envelope IoU >=0.8
   and same-format envelope IoU >=0.95. These are hints, NOT proof of one object;
   no automatic NMS, union, deletion or annotation-count reduction is permitted.
5. Explicitly resolve **lesion versus whole leaf** scope. Do not silently train the
   same canonical label using incompatible object scopes. A bbox may describe a
   lesion while a polygon describes its leaf; extrema alone cannot resolve that.
6. Write any later approved derived dataset to a NEW versioned directory with a
   per-annotation transformation ledger, policy version, source/derived checksums,
   reviewer decisions and timestamps. Retain original masks and attribution.
   Reversibility means recovering from preserved originals/lineage: the bbox alone
   cannot reconstruct its polygon. Never overwrite the raw export or source split.

Existing bbox-only import/training validators remain strict and unchanged. A future
mixed converter requires an explicit implementation/review gate; this phase does
not silently teach the importer to accept polygons or discard their geometry.

## Taxonomy PROPOSAL (not approval)

| Source label (source ID) | Proposed AgriGuard target |
|---|---|
| Rice-Blast (5) | 0 leaf_blast, after confirming leaf location/diagnosis |
| Bacterial-Leaf-Blight (0) | 1 bacterial_leaf_blight |
| Brown-Spot (1) | 2 brown_spot |
| Sheath-Blight (6) | 3 sheath_blight |
| Tungro-Virus (8) | 4 tungro_symptom, visual symptom not laboratory confirmation |
| Healthy (3) | Never a disease class; image-level target screening required for negatives |
| False-Smut (2), Narrow-Brown-Spot (4), Stem-Rot (7) | Unsupported, excluded from approved training pending separate policy |

5 `leaf_folder_damage` data is missing. Narrow-Brown-Spot is not a brown_spot alias.
Neither Healthy labels nor 13 empty TXT files prove absence of target diseases.
All current source/canonical proposal approvals and training enablement stay false.
Visual QA accept means a recorded source-annotation observation, not a scientific
diagnostic certification, license decision or approved training mapping.

## Leakage and grouping review

All **985 dHash <=4 cross-split pairs** are queued without truncation. Order favors
lower distances, aug_ provenance hints and differing class sets. These similarities
can be false positives (common leaf shape/background), including distance 0.
Review buckets are connected similarity components ONLY, explicitly NOT training
groups or proven original-image families. Source split values are never changed.

For each pair, inspect both originals/annotations and actual parentage evidence.
Record same original, same acquisition session, different original, visually similar
only, or unresolved. Shared ancestry requires explicit evidence (original ID,
source acquisition ledger, transformation parent), not filename/hash similarity
alone. A proposed group ID is a proposal; the tool never applies group merges.
Only a later reviewed GLOBAL grouping ledger may feed a new group-aware split.

## Structured human review and validation

Keep `qa_catalog.json` and static visual artifacts unchanged. Copy the pending
JSONL to a NEW private working review file. Generated IDs/context are immutable.

Each record includes image IDs; annotation IDs and source line references or pair
ID; source fingerprint; reviewer identity; decision/proposed action; scope; reason;
evidence references; timezone-qualified timestamp; relationship/group proposal;
explicit negative-review flag; training/conversion approvals fixed false.

- Initial decision `pending`: reviewer/action/time unset, no implicit approvals.
- Human decisions: `accept`, `revise`, `exclude`, `unresolved`; proposed_action must
  match and identity, reason, evidence and timestamp must be explicitly supplied.
- An accepted annotation needs observed scope `lesion`, `leaf` or `other`.
- Accepted pair review must resolve what relationship is actually supported.
- A negative verdict is explicit accepted IMAGE-level review, not empty-label
  inference; this tool rejects promotion of disease-labelled images to negatives.
- Missing/duplicate/altered IDs, incomplete accept fields, changed source/visual
  evidence, and attempts to set training/conversion approval are rejected.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.qa_review \
  --catalog /absolute/path/to/qa/qa_catalog.json \
  --reviews /absolute/path/to/NEW-human-review.jsonl \
  --source-root /absolute/path/to/raw/rice-v1
```

Pending/revise/unresolved records produce exit **2**, `approval_status: PENDING`,
`conversion_authorized: false`. Even a fully resolved QA file only records reviewer
declarations, not authenticated reviewer attendance or source rights; it never
authorizes conversion/training. Separate genuine mapping/license/grouping and
conversion-policy approvals remain prerequisites. This phase writes pending records
only; it does not fill real reviewer identities, timestamps or favorable verdicts.
