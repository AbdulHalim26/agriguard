"""Read-only dataset/environment preflight. Never trains, downloads or sets flags."""
import argparse
import json
import os
import platform
from collections import Counter
from importlib import metadata
from pathlib import Path

import numpy as np
from PIL import Image

from detection.contracts import CLASS_NAMES
from .data import SPLITS, load_dataset
from .workflow import load_yolo

PACKAGES = ("torch", "torchvision", "ultralytics", "onnx", "onnxruntime", "numpy", "pillow", "pydantic", "PyYAML")


def environment_report():
    packages = {}
    for name in PACKAGES:
        try:
            packages[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            packages[name] = None
    result = {"python": platform.python_version(), "system": platform.system(), "architecture": platform.machine(),
              "logical_cpus": os.cpu_count(), "packages": packages,
              "compute": {"cpu": True, "cuda": None, "mps": None, "torch_import_verified": False}}
    if packages["torch"]:
        try:
            import torch
            result["compute"].update({"cuda": bool(torch.cuda.is_available()),
                                      "mps": bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available()),
                                      "torch_import_verified": True})
        except Exception:
            result["compute"]["error"] = "Installed torch cannot be imported; inspect the approved ML environment"
    return result


def difference_hash(path):
    """64-bit dHash is a REVIEW hint only, not proof of duplicate/independence."""
    with Image.open(path) as image:
        pixels = np.asarray(image.convert("L").resize((9, 8), Image.Resampling.BILINEAR)).reshape(-1)
    value = 0
    for y in range(8):
        for x in range(8):
            value = (value << 1) | int(pixels[y * 9 + x] > pixels[y * 9 + x + 1])
    return value


def near_duplicate_candidates(root, rows, max_distance=4, max_comparisons=250_000, max_pairs=50):
    if not 0 <= max_distance <= 8 or max_comparisons < 1 or max_pairs < 1:
        raise ValueError("Bounded positive near-duplicate limits required")
    signatures = [(row, difference_hash(Path(root) / row["image"])) for row in rows]
    pairs, comparisons = [], 0
    for i, (left, left_hash) in enumerate(signatures):
        for right, right_hash in signatures[i + 1:]:
            if left["group_id"] == right["group_id"]:
                continue
            if comparisons >= max_comparisons or len(pairs) >= max_pairs:
                return {"method": "dhash64_review_candidates", "hamming_threshold": max_distance,
                        "comparisons": comparisons, "truncated": True, "pairs": pairs}
            comparisons += 1
            distance = (left_hash ^ right_hash).bit_count()
            if distance <= max_distance:
                pairs.append({"left_sample_id": left["id"], "right_sample_id": right["id"],
                              "hamming_distance": distance, "cross_split": left["split"] != right["split"]})
    return {"method": "dhash64_review_candidates", "hamming_threshold": max_distance,
            "comparisons": comparisons, "truncated": False, "pairs": pairs}


def dataset_report(root):
    manifest = load_dataset(root)
    rows = manifest["samples"]
    enabled = {entry["class_id"]: (index, entry) for index, entry in enumerate(manifest["classes"])}
    classes = []
    for cid, name in enumerate(CLASS_NAMES):
        info = {"canonical_class_id": cid, "class_name": name, "enabled": cid in enabled}
        if cid in enabled:
            info.update({"compact_model_index": enabled[cid][0], "annotation_level": enabled[cid][1]["annotation_level"]})
            for split in SPLITS:
                subset = [row for row in rows if row["split"] == split]
                positive = [row for row in subset if any(box[0] == cid for box in row["boxes"])]
                info[split] = {"images": len(positive), "instances": sum(box[0] == cid for row in subset for box in row["boxes"]),
                               "groups": len({row["group_id"] for row in positive})}
        classes.append(info)
    sources = Counter(source for row in rows for source in row["source_ids"])
    return {"purpose": manifest["purpose"], "manifest_sha256": manifest["manifest_sha256"],
            "unique_images": len(rows), "independent_groups": len({row["group_id"] for row in rows}),
            "input_records": manifest.get("input_records"),
            "exact_duplicate_records_removed": manifest.get("exact_duplicate_records_removed"),
            "splits": {split: {"images": sum(r["split"] == split for r in rows),
                               "negative_images": sum(r["split"] == split and not r["boxes"] for r in rows),
                               "groups": len({r["group_id"] for r in rows if r["split"] == split})} for split in SPLITS},
            "classes": classes,
            "source_provenance": [{"source_id": source["id"], "unique_images": sources[source["id"]],
                                   "declared_license": source["license"], "usage_verification": "DECLARED_REVIEW_NOT_INDEPENDENTLY_VERIFIED"}
                                  for source in manifest["config"]["sources"]],
            "exact_group_split_checks": "PASSED", "near_duplicates": near_duplicate_candidates(root, rows),
            "limitations": ["dHash candidates need manual review; no automatic class/group changes",
                            "No near-duplicate candidates does not prove all images independent",
                            "License flags record reviewer declarations, not an independent legal/source verification"]}


def readiness(dataset=None, weights=None, family="yolo26n"):
    environment = environment_report()
    blockers, warnings, report = [], [], None
    missing = [name for name, installed in environment["packages"].items() if installed is None]
    if missing:
        blockers.append("Missing training packages: " + ", ".join(missing))
    if not environment["compute"]["torch_import_verified"]:
        blockers.append("PyTorch compute backend is not verified")
    if dataset is None:
        blockers.append("No reviewed prepared bounding-box dataset provided")
    else:
        try:
            report = dataset_report(dataset)
            if report["purpose"] != "model_training":
                blockers.append("Synthetic datasets are not real-training evidence")
            if report["near_duplicates"]["pairs"] or report["near_duplicates"]["truncated"]:
                warnings.append("Near-duplicate/group review still required; no data changed")
        except Exception:
            blockers.append("Dataset validation failed; run load_dataset locally for detailed diagnostics")
    checkpoint = {"provided": weights is not None, "architecture_verified": False, "family": family}
    if weights is None or not Path(weights).is_file():
        blockers.append("No existing local YOLO26 .pt checkpoint provided")
    elif not missing:
        try:
            load_yolo(weights, family)
            checkpoint["architecture_verified"] = True
        except Exception:
            blockers.append("Checkpoint architecture/Ultralytics compatibility failed")
    else:
        blockers.append("Checkpoint compatibility requires the missing training environment")
    return {"decision": "NO_GO" if blockers else "CONDITIONAL_GO", "environment": environment,
            "dataset": report, "checkpoint": checkpoint, "blockers": blockers, "review_actions": warnings,
            "scope": "Preflight only; no training/evaluation/export or serving activation performed"}


def main():
    parser = argparse.ArgumentParser(description="Read-only dataset/training readiness report; no downloads or training.")
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--weights", type=Path)
    parser.add_argument("--family", choices=("yolo26n", "yolo26s"), default="yolo26n")
    parser.add_argument("--environment-only", action="store_true")
    args = parser.parse_args()
    result = environment_report() if args.environment_only else readiness(args.dataset, args.weights, args.family)
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0 if args.environment_only or result["decision"] != "NO_GO" else 2


if __name__ == "__main__":
    raise SystemExit(main())
