# PHASE 1B.0.4A — Three-panel offline review workspace

UI-only refinement. Decision schema, `core.js`, Python review/export validators,
source/catalog fingerprints and training/conversion gates are UNCHANGED.

## Open/build without overwriting prior review work

The current dataset's new entry point is:

```sh
open "$HOME/Documents/agriguard-datasets/rice-v1-review-1b004a/index.html"
```

The previous `rice-v1-review-1b004` directory and any open browser tab remain intact.
If that tab has edits, explicitly export them before leaving it. No browser memory
is automatically migrated, discarded or saved. Import your existing saved revision
chain into the new UI in order; the logical dashboard ID is preserved for this
same-workspace refresh, so old decision exports remain compatible.

For a NEW UI package from an existing validated dashboard:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.review_dashboard \
  --refresh-from /absolute/path/to/rice-v1-review-1b004 \
  --source-root /absolute/path/to/raw/rice-v1 \
  --output /absolute/path/to/NEW-rice-v1-review-1b004a
```

It validates/copies existing hashed evidence and updates only new-package UI assets.
It rejects a changed decision core, an existing destination, or a destination within
immutable inputs. The new package has new UI/file hashes but the SAME source,
catalog, record IDs, pilot membership and logical export context. No user exports
or unknown files from the old directory are overwritten or silently imported.

## Layout and controls

- **Left:** literal searchable queue (ID/class/source image), status/class badges,
  explicit search application, filters and 20/50/100-row pagination. Current record
  has an outline and `aria-current`; record navigation spans all filtered results.
- **Center:** original aspect-ratio viewer, centered fit view, non-cropped scroll/pan
  at higher zoom, blue existing bbox, green original polygon and optional orange
  envelope proposal (OFF initially). Image and SVG share the exact same scene.
  Natural-dimension/orientation guards still hide unsafe overlays. Annotation buttons
  navigate to individual records; none inherit a verdict.
- **Right:** reviewer identity, readable record summary, QA issue chips, explicit
  decision/scope/reason/evidence, save-to-memory action and record navigation.
  Save remains visible while the form body can scroll on desktop. Full technical
  JSON lives only in closed details, not as the primary content.
- At desktop widths the panels use the viewport with independent scrolling. Tablet
  and mobile layouts stack/reflow; source image proportions and safe controls remain.
- Focus outlines, explicit form labels, status text (not color alone), a skip link,
  queue pagination announcements and focusable image scroll regions are provided.

Optional Alt+Left / Alt+Right navigation is OFF by default, works only after opt-in,
and is ignored in inputs, textareas, selects or editable text. It never saves or
chooses a decision; unsaved-form navigation still requires explicit discard consent.

## Existing workflow stays unchanged

Choose ACCEPT/REVISE/EXCLUDE/UNRESOLVED yourself, supply required real reviewer data
and evidence, then explicitly save ONE record to memory. No geometry/AI-based
verdicts, inherited approvals, localStorage, dataset writes or auto disk persistence
exist. A persistent banner distinguishes unsaved form fields, memory deltas and a
requested download. Download does not assume that a file was saved successfully.

Explicitly export a versioned delta and import the actually saved file to acknowledge
its base. Stale/conflicting versions, incomplete changes and attempts at approval
remain rejected by the unchanged core and Python validator. Source integrity still
requires the authoritative CLI; this UI does not certify licenses or reviewer identity.

Use the unchanged validation command with the NEW package path:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python \
  -m training.yolo.review_export \
  --dashboard /absolute/path/to/rice-v1-review-1b004a \
  --source-root /absolute/path/to/raw/rice-v1 \
  --exports /absolute/path/to/review-v1.json /absolute/path/to/review-v2.json
```

With no exports, v0 remains all pending and exit 2 is expected. Read-only assessment
exports are not decision imports or converted training data. YOLO remains OFF and
all existing source, mapping, license, grouping and conversion approvals remain pending.
