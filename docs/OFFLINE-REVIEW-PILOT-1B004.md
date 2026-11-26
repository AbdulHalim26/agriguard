# PHASE 1B.0.4 — Offline human-review pilot

**QA decisions only. No training/conversion permission, group application or label
export.** All initial reviewer names, verdicts and review timestamps stay unset.
The existing raw dataset and PHASE 1B.0.3 package remain immutable.

## Build/open (no application server)

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.review_dashboard \
  --qa-root /absolute/path/to/rice-v1-qa-1b003 \
  --source-root /absolute/path/to/raw/rice-v1 \
  --output /absolute/path/to/NEW-rice-v1-review-1b004 --pilot-pairs 40
```

Open the NEW `index.html` directly in a modern local browser. It embeds the QA data
to avoid file:// fetch/CORS dependencies, loads classic local scripts/CSS, has no
CDN/network connection, and copies hashed QA evidence byte-for-byte under `qa/`.
No service, credentials, Supabase or source-watching process is started.

The builder rejects edited original pending queues rather than silently resetting
possible user work. It preserves every review/image/annotation/pair ID, raw source
fingerprint and original catalog hash. Its own generated files are hash-checked by
the Python validator. Keep the old package, new dashboard and source intact.

## Focused pilot

- Reuse the existing **96** representative image IDs and their original annotation
  records, including nine source classes, observed splits/resolutions/formats,
  empty-label cases, mixed annotations and high envelope-inflation examples.
- Add up to **40** existing pair records, selecting diverse heuristic review buckets
  first and prioritizing aug_ lineage hints. Buckets are NOT proven families or
  training groups. All 985 pairs remain available in the full queue/old QA gallery.
- Pair endpoint images can be shown outside the 96-image pilot. A pair verdict
  never reviews those images or annotations automatically.
- Potential bbox/polygon duplicate-object cases are included when present. A zero
  heuristic hit count is reported honestly, not filled with fabricated issues.
- `pilot_queue.json` records exact membership and actual composition; this focused
  workflow is not a statistically representative test set or acceptance proof.

## Review interaction

1. Enter your actual reviewer identity/alias. It is kept in memory only; an alias
   needs an external identity ledger if institutional accountability requires one.
2. Select pilot/full queue, record type, class, split, issue and status. Previous/
   next navigation applies to the full filtered list; the list displays a window
   of at most 100 entries. You may inspect a parent/annotation separately.
3. View original pixels with blue bbox/green polygon overlays. Zoom/scroll without
   cropping. Orange proposed polygon envelopes are optional and OFF initially.
   Dimension/orientation mismatch disables unsafe overlays. These visual envelopes
   never become training annotations.
4. Choose ACCEPT, REVISE, EXCLUDE or UNRESOLVED deliberately, provide observed scope,
   reason and actual evidence references. The reference helper only adds a chosen
   artifact reference when clicked; it does not claim review or approve anything.
5. For a pair, record the relationship supported by evidence. Similarity/hash score
   alone is not shared ancestry. Proposed group IDs are never applied.
6. Negative review requires an explicit eligible IMAGE-level checkbox, not empty
   label/Healthy inference. Disease-labelled images cannot become verified negatives.
7. Click **Save this record to memory**. Only that record changes; parent, children
   and pair endpoints remain at their own statuses. Timestamp is created on this
   explicit action. Incomplete decisions are rejected.

ACCEPT records a source-QA observation, not license/diagnosis certification or
canonical mapping approval. REVISE/UNRESOLVED still count as needing work. Progress
distinguishes touched, pending and resolved QA; class/issue categories overlap.

## Explicit, versioned file exports

The dashboard has NO localStorage/IndexedDB auto-save, filesystem write API or
automatic repository/source output. Unsaved work lives in browser memory. Closing/
reloading can lose it: explicitly download and verify your review file first.

**Export decisions** creates `agriguard-human-review-delta` schema v1 with:

- dashboard ID, original catalog hash and source fingerprint;
- export UUID, revision, previous export UUID, exporter identity and timestamp;
- only explicitly changed records, each with EXACT `before` and `after` values.

Unmentioned records remain pending. An empty export is not generated. Read-only
assessment downloads have a different format and are NOT decision imports.

Base/version advances only after **explicit file re-import**. After downloading
v1, confirm that the file really exists and import that same file. If your in-memory
state exactly matches it, this acknowledges v1 without overwriting any edits. If
additional unsaved edits differ, import is rejected; export those edits into a new
candidate file or reload and choose the intended chain deliberately. Download alone
never assumes successful disk persistence.

After v1 import, new changes export as v2 with parent=v1. After a page reload, import
v1 then v2 in order. Competing v1 branches, stale before-values, duplicate records,
changed IDs, incomplete fields, approval flags or backwards timestamps are rejected
atomically, without partial application. Keep each actual exported version; do not
overwrite an earlier file or combine conflicting reviewers by last-write-wins.

These are declared human identities/evidence, not authenticated digital signatures.
The tooling does not manufacture attendance, reviewer approval or source rights.

## Authoritative validation and read-only conversion assessment

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.review_export \
  --dashboard /absolute/path/to/rice-v1-review-1b004 \
  --source-root /absolute/path/to/raw/rice-v1 \
  --exports /absolute/path/to/review-v1.json /absolute/path/to/review-v2.json
```

No exports means v0/all pending. Validator rechecks raw source, original catalog,
QA visuals and dashboard file hashes before applying the explicit chain in memory.
It reuses existing `ReviewRecord`/`validate_reviews` guards. Summary goes to stdout;
optional `--report /path/to/NEW-assessment.json` is an explicit exclusive write,
not permitted inside immutable raw/QA evidence and never a label dataset.

Assessment includes manually reviewed samples only, original annotation references,
proposed method and area-inflation diagnostics (NOT converted coordinates), geometry
concerns, accepted scope conflicts, unresolved related pairs/duplicate-object
concerns and remaining human record IDs. Pair-only reviews do not mark endpoint
images manually reviewed. Parent acceptance never resolves children.

Exit 2 / needs-work is expected for partial or initial reviews. Even all-resolved
QA returns `conversion_authorized: false`, `training_authorized: false` and
`groups_applied: false`. Global mapping/license, conversion-policy and grouping
approvals are still absent. A separate approved converter and derived lineage
ledger are required before any training-ready dataset can exist.

## Criteria before approved dataset conversion

- Genuine reviewer decisions/evidence for included images and every retained
  annotation, including exact lesion-versus-leaf scope; reject mixed target scope.
- Resolve geometry, high-inflation suitability and suspected shared-object cases;
  never silently NMS/merge/discard annotations or use confidence as severity.
- Resolve ancestry concerns touching included data and approve a GLOBAL grouping
  ledger; keep similarity buckets separate from training group IDs.
- Separate real license/permitted-use, canonical mapping, negative-image and
  conversion-policy approvals. Unsupported diagnoses stay out; Healthy is not a
  disease class; `leaf_folder_damage` is still missing.
- Preserve original ZIP identity/raw assets/original labels; record the known
  36-image discrepancy as upstream metadata, not extraction failure.
- Implement/review a separate reversible NEW derived-data writer with per-row
  provenance and checksums. This dashboard contains no such converter.
- Keep YOLO OFF and production security gates intact; training requires its own
  reviewed dataset/checkpoint/ML environment gates after conversion acceptance.
