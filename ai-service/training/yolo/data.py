"""Reviewed bounding boxes only; global groups, deterministic splits, no downloads.

Input TXT IDs use the canonical taxonomy. Prepared IDs are compact model indices
with an explicit index -> canonical ClassSpec mapping stored in the manifest.
"""
import csv
import hashlib
import io
import json
import math
import random
import re
import tempfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageOps

from detection.adapter import file_sha256
from detection.contracts import ClassSpec

SPLITS = ("train", "val", "test")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def inside(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Annotation/image path missing or outside input root")
    return path


def load_config(path):
    config = json.loads(Path(path).read_text())
    return validate_config(config)


def validate_config(config):
    if config.get("schema_version") != 1 or config.get("coordinate_space") != "exif_oriented_normalized_xywh":
        raise ValueError("Explicit reviewed EXIF-oriented xywh annotation convention required")
    if config.get("purpose") not in ("model_training", "synthetic_test"):
        raise ValueError("Explicit dataset purpose required")
    if not config.get("reviewed_by", "").strip() or not config.get("review_protocol", "").strip():
        raise ValueError("Dataset review and annotation-level protocol required")
    for key in ("minimum_instances_per_class_per_split", "minimum_groups_per_class_per_split"):
        if type(config.get(key)) is not int or config[key] < 1:
            raise ValueError("Set expert-reviewed positive instance/group adequacy floors")
    enabled, seen = [], set()
    for entry in config.get("classes", []):
        spec = ClassSpec.model_validate({k: v for k, v in entry.items() if k != "enabled"})
        if spec.class_id in seen or type(entry.get("enabled")) is not bool:
            raise ValueError("Invalid/duplicate class enablement")
        seen.add(spec.class_id)
        if entry["enabled"]:
            enabled.append(spec.model_dump())
    if not enabled:
        raise ValueError("No classes enabled: provide adequate reviewed bounding-box data first")
    enabled.sort(key=lambda c: c["class_id"])
    sources = config.get("sources", [])
    if not sources or len({s.get("id") for s in sources}) != len(sources):
        raise ValueError("Unique source provenance records required")
    for source in sources:
        url = urlsplit(source.get("url", ""))
        if not source.get("id") or not source.get("license") or source.get("license_verified") is not True:
            raise ValueError("Reviewed source identity/license required")
        if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password or url.query or url.fragment:
            raise ValueError("Source URL must be public provenance, not a signed download URL")
    return config, enabled


def parse_annotations(path, classes, negative_reviewed=False):
    """Reject classification labels, disabled IDs, malformed and out-of-image boxes."""
    allowed = {entry["class_id"] for entry in classes}
    boxes = []
    for number, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        columns = line.split()
        if len(columns) != 5:
            raise ValueError(f"Line {number}: expected class_id cx cy width height, not classification/mask labels")
        try:
            cid = int(columns[0])
            cx, cy, width, height = map(float, columns[1:])
        except ValueError as exc:
            raise ValueError(f"Line {number}: invalid numeric annotation") from exc
        if cid not in allowed:
            raise ValueError(f"Line {number}: unknown/disabled class ID")
        if not all(math.isfinite(v) for v in (cx, cy, width, height)) or width <= 0 or height <= 0:
            raise ValueError(f"Line {number}: nonfinite or nonpositive box")
        if cx - width / 2 < -1e-8 or cy - height / 2 < -1e-8 or cx + width / 2 > 1 + 1e-8 or cy + height / 2 > 1 + 1e-8:
            raise ValueError(f"Line {number}: normalized box exceeds image")
        box = [cid, cx, cy, width, height]
        if box in boxes:
            raise ValueError(f"Line {number}: duplicate annotation")
        boxes.append(box)
    if not boxes and not negative_reviewed:
        raise ValueError("Empty labels require explicit negative_reviewed=true; not automatically healthy")
    return sorted(boxes)


def normalized_image(path):
    with Image.open(path) as source:
        if source.format not in ("JPEG", "PNG") or source.width * source.height > 20_000_000 or max(source.size) > 16384:
            raise ValueError("Unsupported image format/dimensions")
        image = ImageOps.exif_transpose(source).convert("RGB")
        if max(image.size) > 1280:
            scale = 1280 / max(image.size)
            image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
        pixels = image.tobytes()
        identifier = hashlib.sha256(str(image.size).encode() + pixels).hexdigest()
        out = io.BytesIO()
        # A fresh image drops EXIF/GPS and other source metadata, including
        # non-orientation EXIF tags retained by ImageOps.exif_transpose.
        Image.frombytes("RGB", image.size, pixels).save(out, format="PNG")
        return identifier, out.getvalue(), image.size


def adequate(rows, classes, min_instances, min_groups):
    for split in SPLITS:
        selected = [row for row in rows if row["split"] == split]
        counts = Counter(box[0] for row in selected for box in row["boxes"])
        for entry in classes:
            cid = entry["class_id"]
            groups = {row["group_id"] for row in selected if any(box[0] == cid for box in row["boxes"])}
            if counts[cid] < min_instances or len(groups) < min_groups:
                return False
    return True


def assign_groups(rows, classes, seed, min_instances, min_groups):
    groups = sorted({row["group_id"] for row in rows})
    if len(groups) < 3:
        raise ValueError("At least three independent groups required")
    train_count = min(len(groups) - 2, max(1, round(len(groups) * .7)))
    val_count = min(len(groups) - train_count - 1, max(1, round(len(groups) * .15)))
    best, best_score = None, float("inf")
    # Bounded deterministic search; never split a group to force coverage.
    for attempt in range(256):
        shuffled = groups.copy()
        random.Random(seed + attempt).shuffle(shuffled)
        assignments = {group: "train" if i < train_count else "val" if i < train_count + val_count else "test"
                       for i, group in enumerate(shuffled)}
        candidate = [{**row, "split": assignments[row["group_id"]]} for row in rows]
        if not adequate(candidate, classes, min_instances, min_groups):
            continue
        counts = Counter(row["split"] for row in candidate)
        score = sum(abs(counts[s] / len(rows) - target) for s, target in zip(SPLITS, (.7, .15, .15)))
        if score < best_score:
            best, best_score = candidate, score
    if best is None:
        raise ValueError("Group-aware split cannot meet reviewed per-class adequacy floors; add independent labeled groups")
    return sorted(best, key=lambda row: row["id"])


def prepare(root, inventory, config_path, output, seed=42):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output.exists():
        raise ValueError("Output already exists; prepared datasets are immutable")
    config, classes = load_config(config_path)
    sources = {source["id"] for source in config["sources"]}
    records, pixels, parents, input_records = {}, {}, {}, 0

    def find(group):
        parents.setdefault(group, group)
        while parents[group] != group:
            group = parents[group]
        return group

    with Path(inventory).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"image", "labels", "group_id", "source_id", "reviewed", "negative_reviewed"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Inventory requires image,labels,group_id,source_id,reviewed,negative_reviewed")
        for row in reader:
            input_records += 1
            group = row["group_id"].strip()
            if not group or row["source_id"] not in sources or row["reviewed"].lower() != "true":
                raise ValueError("Every image needs reviewed boxes, a global group ID and source provenance")
            negative_reviewed = row["negative_reviewed"].lower() == "true"
            labels = parse_annotations(inside(root, row["labels"]), classes, negative_reviewed)
            identifier, image, size = normalized_image(inside(root, row["image"]))
            find(group)
            if identifier in records:
                previous = records[identifier]
                if previous["boxes"] != labels:
                    raise ValueError("Identical pixels have conflicting annotations")
                a, b = sorted((find(group), find(previous["group_id"])))
                parents[b] = a  # connect duplicate-related groups across all sources
                previous["source_ids"] = sorted(set(previous["source_ids"] + [row["source_id"]]))
            else:
                records[identifier] = {"id": identifier, "group_id": group, "source_ids": [row["source_id"]],
                                       "boxes": labels, "width": size[0], "height": size[1],
                                       "negative_reviewed": negative_reviewed}
                pixels[identifier] = inside(root, row["image"])
    rows = [{**row, "group_id": find(row["group_id"])} for row in records.values()]
    rows = assign_groups(rows, classes, seed, config["minimum_instances_per_class_per_split"], config["minimum_groups_per_class_per_split"])
    compact = {entry["class_id"]: index for index, entry in enumerate(classes)}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".prepare-yolo-", dir=output.parent) as temporary:
        staging = Path(temporary) / "dataset"
        for split in SPLITS:
            (staging / "images" / split).mkdir(parents=True)
            (staging / "labels" / split).mkdir(parents=True)
        samples = []
        for row in rows:
            image_path, labels_path = f'images/{row["split"]}/{row["id"]}.png', f'labels/{row["split"]}/{row["id"]}.txt'
            identifier, image, _ = normalized_image(pixels[row["id"]])
            if identifier != row["id"]:
                raise ValueError("Source image changed during preparation")
            (staging / image_path).write_bytes(image)
            text = "".join(f'{compact[box[0]]} ' + " ".join(format(v, ".10g") for v in box[1:]) + "\n" for box in row["boxes"])
            (staging / labels_path).write_text(text)
            samples.append({**row, "image": image_path, "labels": labels_path,
                            "image_sha256": file_sha256(staging / image_path), "labels_sha256": file_sha256(staging / labels_path)})
        manifest = {"schema_version": 1, "label_schema": "rice_detection_v1", "purpose": config["purpose"],
                    "classes": classes, "config": config, "seed": seed, "samples": samples,
                    "input_records": input_records, "exact_duplicate_records_removed": input_records - len(samples),
                    "split_strategy": "global_group_aware_pixel_deduplicated_70_15_15_target"}
        manifest["manifest_sha256"] = digest(manifest)
        write_json(staging / "manifest.json", manifest)
        import yaml
        (staging / "data.yaml").write_text(yaml.safe_dump({"path": str(output), "train": "images/train", "val": "images/val", "test": "images/test",
                                                          "names": {i: entry["class_name"] for i, entry in enumerate(classes)}}))
        staging.rename(output)
    return manifest


def load_dataset(root):
    """Recheck hashes, grouping, compact mapping and YAML before every ML command."""
    root = Path(root).resolve()
    manifest = json.loads((root / "manifest.json").read_text())
    if digest({k: v for k, v in manifest.items() if k != "manifest_sha256"}) != manifest.get("manifest_sha256"):
        raise ValueError("Dataset manifest checksum mismatch")
    if manifest.get("label_schema") != "rice_detection_v1" or manifest.get("purpose") not in ("model_training", "synthetic_test"):
        raise ValueError("Incompatible dataset contract")
    config, classes = validate_config(manifest["config"])
    if classes != manifest["classes"] or config["purpose"] != manifest["purpose"]:
        raise ValueError("Prepared taxonomy/config provenance mismatch")
    compact = [{**c, "class_id": i} for i, c in enumerate(classes)]
    ids, groups, expected_files = set(), {}, {"images": set(), "labels": set()}
    for row in manifest["samples"]:
        if row["id"] in ids or row["split"] not in SPLITS:
            raise ValueError("Duplicate sample or invalid split")
        ids.add(row["id"])
        if not re.fullmatch(r"[a-f0-9]{64}", row["id"]):
            raise ValueError("Invalid prepared sample identity")
        if row["image"] != f'images/{row["split"]}/{row["id"]}.png' or row["labels"] != f'labels/{row["split"]}/{row["id"]}.txt':
            raise ValueError("Prepared sample path does not match its split/identity")
        if groups.setdefault(row["group_id"], row["split"]) != row["split"]:
            raise ValueError("Group leakage across dataset splits")
        for key in ("image", "labels"):
            if file_sha256(inside(root, row[key])) != row[f"{key}_sha256"]:
                raise ValueError("Prepared image/labels changed")
            expected_files["images" if key == "image" else "labels"].add(row[key])
        # Prepared labels use compact model IDs, translated back to canonical IDs.
        boxes = parse_annotations(root / row["labels"], compact, negative_reviewed=row.get("negative_reviewed") is True)
        restored = [[classes[box[0]]["class_id"], *box[1:]] for box in boxes]
        if any(a[0] != b[0] or any(abs(x - y) > 1e-8 for x, y in zip(a[1:], b[1:])) for a, b in zip(restored, row["boxes"])) or len(restored) != len(row["boxes"]):
            raise ValueError("Prepared annotation mapping mismatch")
    # Ultralytics discovers files by directory, not by our manifest. Reject any
    # undeclared input that could silently enter training or a held-out split.
    image_extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp", ".dng", ".heic", ".avif", ".mpo", ".pfm", ".jfif", ".jp2"}
    for branch, expected in expected_files.items():
        directory = root / branch
        if directory.is_symlink():
            raise ValueError("Prepared dataset directories cannot be symlinks")
        discovered = set()
        for path in directory.rglob("*"):
            if path.is_symlink():
                raise ValueError("Prepared dataset entries cannot be symlinks")
            if path.is_file() and (path.suffix.lower() in image_extensions if branch == "images" else path.suffix.lower() == ".txt"):
                discovered.add(path.relative_to(root).as_posix())
        if discovered != expected:
            raise ValueError("Unmanifested or missing image/label files in prepared dataset")
    if not adequate(manifest["samples"], classes, config["minimum_instances_per_class_per_split"], config["minimum_groups_per_class_per_split"]):
        raise ValueError("Prepared dataset no longer meets adequacy floors")
    import yaml
    expected = {"path": str(root), "train": "images/train", "val": "images/val", "test": "images/test", "names": {i: c["class_name"] for i, c in enumerate(classes)}}
    if yaml.safe_load((root / "data.yaml").read_text()) != expected:
        raise ValueError("Dataset YAML mismatch or undeclared download directive")
    return manifest
