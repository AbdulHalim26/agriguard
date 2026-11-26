"""Manual-export ingestion only: inspect -> HUMAN review -> immutable import.

Never downloads/extracts archives, trusts source splits, guesses groups/diagnoses,
or creates boxes. All coordinates are copied from validated detection TXT rows.
"""
import argparse
import csv
import json
import re
import shutil
import tempfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

import yaml

from detection.adapter import file_sha256
from detection.contracts import CLASS_NAMES, ClassSpec
from .data import digest, inside, normalized_image, parse_annotations, write_json

REVIEW_FIELDS = ("image", "image_sha256", "labels_sha256", "decision", "group_id", "reviewer_id", "negative_reviewed", "review_note")


def public_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Use a public attribution URL without credentials/query tokens")
    return value


def local_file(root, relative):
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Relative paths confined to the source/evidence root required")
    path = inside(root, relative)
    if any((root / Path(*relative.parts[:i])).is_symlink() for i in range(1, len(relative.parts) + 1)):
        raise ValueError("Symlinks are not accepted in immutable inputs")
    return path


def output_slot(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists() or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Choose a NEW output directory outside immutable input")
    return source, output


def scan_export(root):
    root = Path(root).resolve()
    yaml_path = local_file(root, "data.yaml")
    data = yaml.safe_load(yaml_path.read_text())
    if not isinstance(data, dict) or data.get("task", "detect") != "detect":
        raise ValueError("A YOLO object-detection YAML export is required")
    names = data.get("names")
    if isinstance(names, dict):
        names = {int(key): value for key, value in names.items()}
        if sorted(names) != list(range(len(names))):
            raise ValueError("Source model class indices must be contiguous")
        names = [names[i] for i in range(len(names))]
    if not isinstance(names, list) or not names or any(not isinstance(name, str) or not name.strip() for name in names) or len(set(names)) != len(names):
        raise ValueError("Explicit unique source class names required")
    if "nc" in data and data["nc"] != len(names):
        raise ValueError("Source class count mismatch")
    allowed = [{"class_id": i} for i in range(len(names))]
    samples = []
    labels_found, labels_used = set(), set()
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlinks are not accepted in immutable exports")
        relative = path.relative_to(root)
        if not path.is_file():
            continue
        if "labels" in relative.parts and path.suffix.lower() == ".txt":
            labels_found.add(relative.as_posix())
        if "images" not in relative.parts:
            continue
        if path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            if path.name == ".DS_Store":
                continue
            raise ValueError("Only JPG/PNG images are accepted; do not silently omit unsupported source images")
        parts = list(relative.parts)
        parts[len(parts) - 1 - parts[::-1].index("images")] = "labels"
        label = Path(*parts).with_suffix(".txt").as_posix()
        label_path = local_file(root, label)  # missing labels never imply healthy
        boxes = parse_annotations(label_path, allowed, negative_reviewed=True)
        _, _, size = normalized_image(path)
        labels_used.add(label)
        samples.append({"image": relative.as_posix(), "labels": label, "image_sha256": file_sha256(path),
                        "labels_sha256": file_sha256(label_path), "boxes": boxes, "width": size[0], "height": size[1],
                        "source_split": relative.parts[0] if relative.parts[0] != "images" else "unspecified"})
    if not samples or labels_found != labels_used:
        raise ValueError("No detection pairs found or source labels lack matching images")
    payload = {"source_names": names, "yaml_sha256": file_sha256(yaml_path), "samples": samples}
    return {**payload, "export_fingerprint": digest(payload)}


def inspect_export(root, output):
    root, output = output_slot(root, output)
    scanned = scan_export(root)
    output.mkdir(parents=True, exist_ok=False)
    with (output / "review.csv").open("x", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_FIELDS)
        writer.writeheader()
        for sample in scanned["samples"]:
            writer.writerow({key: sample[key] for key in ("image", "image_sha256", "labels_sha256")} |
                            {"decision": "pending", "group_id": "", "reviewer_id": "", "negative_reviewed": "false", "review_note": ""})
    counts = Counter(int(box[0]) for sample in scanned["samples"] for box in sample["boxes"])
    report = {"export_fingerprint": scanned["export_fingerprint"], "images": len(scanned["samples"]),
              "empty_label_images": sum(not s["boxes"] for s in scanned["samples"]),
              "source_class_distribution": [{"source_class_id": i, "source_name": name, "instances": counts[i]} for i, name in enumerate(scanned["source_names"])],
              "review_status": "NOT_REVIEWED", "source_split_policy": "Do not inherit; reviewer supplies global groups, prepare_dataset resplits"}
    write_json(output / "inspection.json", report)
    return report


def reviewed_policy(config_path, scan):
    config_path = Path(config_path).resolve()
    policy = json.loads(config_path.read_text())
    if policy.get("status") != "APPROVED" or not policy.get("reviewed_by", "").strip() or not policy.get("review_protocol", "").strip() or policy.get("grouping_reviewed") is not True:
        raise ValueError("Genuine reviewer approval/protocol and global grouping review required")
    if policy.get("coordinate_space") != "exif_oriented_normalized_xywh" or policy.get("export_fingerprint") != scan["export_fingerprint"]:
        raise ValueError("Reviewed export fingerprint/coordinate convention mismatch")
    source = policy["source"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", source.get("id", "")) or not str(source.get("version") or "").strip():
        raise ValueError("Source identity and selected version required")
    public_url(source["url"])
    public_url(source["license_url"])
    if not source.get("license") or source.get("license_verified") is not True or not source.get("attribution", "").strip():
        raise ValueError("License/attribution review required")
    if not {"training", "evaluation"}.issubset(source.get("permitted_uses_reviewed", [])) or not source.get("evidence"):
        raise ValueError("Permitted usage and source/license evidence required")
    evidence = []
    for entry in source["evidence"]:
        path = local_file(config_path.parent, entry["path"])
        if not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", "")) or file_sha256(path) != entry["sha256"]:
            raise ValueError("License/source evidence hash mismatch")
        evidence.append(path)
    mapping = policy.get("mappings", {})
    if set(scan["source_names"]) - set(mapping):
        raise ValueError("Unknown actual source labels need explicit review; overview labels are not sufficient")
    levels = {}
    for name in scan["source_names"]:
        rule = mapping[name]
        if rule.get("approved") is not True or not rule.get("reason", "").strip():
            raise ValueError("Each actual source label requires explicit reviewed mapping/exclusion")
        if name.strip().lower() == "healthy" and rule.get("action") == "map":
            raise ValueError("Healthy source labels cannot become canonical disease detections; correct any mislabels in a separately reviewed source copy")
        if rule.get("action") == "map":
            spec = ClassSpec(class_id=rule["canonical_class_id"], class_name=rule["canonical_class_name"], annotation_level=rule["annotation_level"])
            if spec.class_id in levels and levels[spec.class_id] != spec.annotation_level:
                raise ValueError("Aliases cannot silently mix lesion-level and leaf-level boxes")
            levels[spec.class_id] = spec.annotation_level
        elif rule.get("action") not in ("exclude_image", "healthy_background"):
            raise ValueError("Unsupported mapping action; no implicit dropping or fuzzy diagnosis merging")
        if rule.get("action") == "healthy_background" and name.strip().lower() != "healthy":
            raise ValueError("Only an explicitly Healthy source label may use healthy_background")
    return policy, evidence


def import_export(root, review_path, config_path, output):
    root, output = output_slot(root, output)
    scan = scan_export(root)
    policy, evidence = reviewed_policy(config_path, scan)
    with Path(review_path).open(newline="") as handle:
        reader = csv.DictReader(handle)
        if not set(REVIEW_FIELDS).issubset(reader.fieldnames or []):
            raise ValueError("Use the generated image review CSV")
        reviews = list(reader)
    if len({r["image"] for r in reviews}) != len(reviews) or {r["image"] for r in reviews} != {s["image"] for s in scan["samples"]}:
        raise ValueError("Every actual image requires one explicit review decision")
    decisions = {r["image"]: r for r in reviews}
    accepted, excluded = [], []
    for sample in scan["samples"]:
        review = decisions[sample["image"]]
        if not review["reviewer_id"].strip() or not review["review_note"].strip() or review["decision"] not in ("include", "exclude"):
            raise ValueError("No fabricated/pending image approvals; reviewer, decision and note required")
        if review["image_sha256"] != sample["image_sha256"] or review["labels_sha256"] != sample["labels_sha256"]:
            raise ValueError("Reviewed image/labels changed")
        if review["decision"] == "exclude":
            excluded.append({"image_sha256": sample["image_sha256"], "reason": review["review_note"]})
            continue
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", review["group_id"]):
            raise ValueError("Included images require manually reviewed GLOBAL event/session group IDs")
        converted, healthy = [], 0
        for box in sample["boxes"]:
            rule = policy["mappings"][scan["source_names"][box[0]]]
            if rule["action"] == "exclude_image":
                raise ValueError("Image contains unsupported diagnosis; exclude the WHOLE image rather than making unlabelled disease background")
            if rule["action"] == "healthy_background":
                healthy += 1
            else:
                converted.append([rule["canonical_class_id"], *box[1:]])
        if not converted and review["negative_reviewed"].lower() != "true":
            raise ValueError("Healthy/empty images need genuine image-level negative review")
        if len({tuple(box) for box in converted}) != len(converted):
            raise ValueError("Alias mapping creates duplicate boxes; correct annotations in a separately reviewed source copy")
        accepted.append({**sample, "canonical_boxes": sorted(converted), "healthy_boxes_removed": healthy,
                         "group_id": review["group_id"], "reviewer_id": review["reviewer_id"],
                         "negative_reviewed": review["negative_reviewed"].lower() == "true"})
    if not accepted:
        raise ValueError("No reviewed usable images; do not manufacture training data")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".reviewed-import-", dir=output.parent) as temporary:
        staging = Path(temporary) / "bundle"
        for branch in ("images", "labels", "provenance"):
            (staging / branch).mkdir(parents=True)
        records = []
        for sample in accepted:
            identifier = digest({"source": policy["source"]["id"], "image": sample["image"]})
            image_relative = f'images/{identifier}{Path(sample["image"]).suffix.lower()}'
            labels_relative = f"labels/{identifier}.txt"
            shutil.copyfile(local_file(root, sample["image"]), staging / image_relative)
            if file_sha256(staging / image_relative) != sample["image_sha256"] or file_sha256(local_file(root, sample["labels"])) != sample["labels_sha256"]:
                raise ValueError("Source changed during import")
            (staging / labels_relative).write_text("".join(f'{box[0]} ' + " ".join(format(v, ".10g") for v in box[1:]) + "\n" for box in sample["canonical_boxes"]))
            records.append({**sample, "original_image": sample["image"], "original_labels": sample["labels"],
                            "image": image_relative, "labels": labels_relative, "imported_labels_sha256": file_sha256(staging / labels_relative)})
        for index, path in enumerate(evidence):
            destination = staging / "provenance" / f"{index}{path.suffix}"
            shutil.copyfile(path, destination)
            if file_sha256(destination) != policy["source"]["evidence"][index]["sha256"]:
                raise ValueError("Evidence changed during import")
        write_json(staging / "policy.json", policy)
        with (staging / "inventory.csv").open("x", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=("image", "labels", "group_id", "source_id", "reviewed", "negative_reviewed"))
            writer.writeheader()
            for row in records:
                writer.writerow({key: row[key] for key in ("image", "labels", "group_id")} |
                                {"source_id": policy["source"]["id"], "reviewed": "true", "negative_reviewed": str(row["negative_reviewed"]).lower()})
        manifest = {"purpose": "reviewed_manual_import", "source": policy["source"], "export_fingerprint": scan["export_fingerprint"],
                    "source_names": scan["source_names"], "source_yaml_sha256": scan["yaml_sha256"],
                    "review_csv_sha256": file_sha256(review_path), "policy_sha256": file_sha256(staging / "policy.json"),
                    "inventory_sha256": file_sha256(staging / "inventory.csv"), "samples": records, "excluded": excluded,
                    "changes": "Source IDs remapped explicitly; approved Healthy boxes omitted, source splits not reused; no invented boxes"}
        class_counts = Counter(box[0] for row in records for box in row["canonical_boxes"])
        manifest["class_distribution"] = [{"class_id": cid, "class_name": name, "instances": class_counts[cid],
                                            "coverage": "MISSING" if not class_counts[cid] else "ADEQUACY_NOT_YET_VERIFIED",
                                            "training_enabled": False} for cid, name in enumerate(CLASS_NAMES)]
        manifest["manifest_sha256"] = digest(manifest)
        write_json(staging / "import.manifest.json", manifest)
        staging.rename(output)
    return {"accepted_images": len(accepted), "excluded_images": len(excluded), "manifest_sha256": manifest["manifest_sha256"]}


def combine_imports(root, bundles, output):
    """Join reviewed inventories under a common root; do NOT combine old splits."""
    root, output = output_slot(root, output)
    inventory, sources, fingerprints, levels = [], [], [], {}
    for bundle in bundles:
        bundle = Path(bundle).resolve()
        if not bundle.is_relative_to(root):
            raise ValueError("All imported bundles must be inside the explicit common input root")
        prefix = bundle.relative_to(root)
        manifest = json.loads(local_file(root, prefix / "import.manifest.json").read_text())
        if manifest.get("purpose") != "reviewed_manual_import" or manifest.get("manifest_sha256") != digest({k: v for k, v in manifest.items() if k != "manifest_sha256"}):
            raise ValueError("Imported manifest changed or is not reviewed")
        for name in ("policy", "inventory"):
            path = local_file(root, prefix / ("policy.json" if name == "policy" else "inventory.csv"))
            if file_sha256(path) != manifest[f"{name}_sha256"]:
                raise ValueError("Reviewed policy/inventory changed")
        policy = json.loads((bundle / "policy.json").read_text())
        for entry in policy["mappings"].values():
            if entry.get("action") == "map" and entry.get("approved") is True:
                cid, level = entry["canonical_class_id"], entry["annotation_level"]
                if cid in levels and levels[cid] != level:
                    raise ValueError("Sources disagree on annotation level for the same canonical class")
                levels[cid] = level
        for index, entry in enumerate(manifest["source"]["evidence"]):
            destination = prefix / "provenance" / f'{index}{Path(entry["path"]).suffix}'
            if file_sha256(local_file(root, destination)) != entry["sha256"]:
                raise ValueError("Copied source/license evidence changed")
        source = manifest["source"]
        if any(s["id"] == source["id"] for s in sources):
            raise ValueError("Duplicate source IDs; select one reviewed version or assign distinct explicit IDs")
        sources.append(source)
        fingerprints.append(manifest["manifest_sha256"])
        for row in manifest["samples"]:
            if file_sha256(local_file(root, prefix / row["image"])) != row["image_sha256"] or file_sha256(local_file(root, prefix / row["labels"])) != row["imported_labels_sha256"]:
                raise ValueError("Imported image/labels changed")
            inventory.append({"image": (prefix / row["image"]).as_posix(), "labels": (prefix / row["labels"]).as_posix(),
                              "group_id": row["group_id"], "source_id": source["id"], "reviewed": "true",
                              "negative_reviewed": str(row["negative_reviewed"]).lower()})
    if not inventory:
        raise ValueError("At least one reviewed import required")
    output.mkdir(parents=True, exist_ok=False)
    with (output / "inventory.csv").open("x", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("image", "labels", "group_id", "source_id", "reviewed", "negative_reviewed"))
        writer.writeheader()
        writer.writerows(inventory)
    write_json(output / "sources.json", {"sources": sources, "import_manifest_sha256": fingerprints,
                                          "group_policy": "Global group IDs retained; freeze a NEW split only after cross-source duplicate review"})
    return {"images": len(inventory), "sources": len(sources), "source_splits_inherited": False}


def main():
    parser = argparse.ArgumentParser(description="Inspect or import MANUALLY obtained YOLO TXT exports; never download.")
    commands = parser.add_subparsers(dest="command", required=True)
    for action in ("inspect", "import"):
        child = commands.add_parser(action)
        child.add_argument("--source-root", type=Path, required=True)
        child.add_argument("--output", type=Path, required=True)
        if action == "import":
            child.add_argument("--review", type=Path, required=True)
            child.add_argument("--config", type=Path, required=True)
    combined = commands.add_parser("combine")
    combined.add_argument("--root", type=Path, required=True)
    combined.add_argument("--bundles", type=Path, nargs="+", required=True)
    combined.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "combine":
        result = combine_imports(args.root, args.bundles, args.output)
    else:
        result = inspect_export(args.source_root, args.output) if args.command == "inspect" else import_export(args.source_root, args.review, args.config, args.output)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
