#!/usr/bin/env python3
"""Read-only artifact reconciliation. Never train/download/export/unpickle weights.

Searches the workspace (including ignored model/run folders), pruning dependency
and generated application folders. Extra roots must be provided explicitly. Model
metadata, actual ONNX I/O and hashes are evidence; filenames are not architecture.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRUNE = {".git", ".next", "node_modules", "__pycache__", ".venv", ".venv-ml-m1", "video_arsip"}
WEIGHTS = {".pt", ".pth", ".ckpt", ".onnx", ".safetensors"}
RUN_FILES = {"results.csv", "args.yaml", "metrics.json", "run.json", "best.pt", "last.pt"}


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def inventory(roots):
    weights, runs, unavailable, links = [], [], [], []
    for root in roots:
        if not root.is_dir():
            unavailable.append(str(root))
            continue
        for directory, folders, files in os.walk(root, followlinks=False):
            folders[:] = sorted(name for name in folders if name not in PRUNE and not (Path(directory) / name).is_symlink())
            for name in sorted(files):
                path = Path(directory) / name
                if path.suffix.lower() in WEIGHTS or name in RUN_FILES or name.endswith(".export-report.json"):
                    if path.is_symlink():
                        links.append(str(path))
                    elif path.suffix.lower() in WEIGHTS:
                        weights.append(path)
                    else:
                        runs.append(str(path))
    return sorted(set(weights)), sorted(set(runs)), unavailable, links


def inspect_weight(path):
    size = path.stat().st_size
    result = {"path": str(path), "bytes": size, "sha256": digest(path), "architecture_verified": False}
    if path.suffix.lower() == ".onnx":
        try:
            import onnxruntime as ort
            session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            result["onnx"] = {"providers": session.get_providers(),
                "inputs": [{"name": item.name, "shape": item.shape, "type": item.type} for item in session.get_inputs()],
                "outputs": [{"name": item.name, "shape": item.shape, "type": item.type} for item in session.get_outputs()],
                "custom_metadata": {key: value for key, value in session.get_modelmeta().custom_metadata_map.items()
                    if key in ("task", "names", "agriguard_output_format", "agriguard_model_family", "agriguard_model_version")}}
        except Exception as error:
            result["onnx_inspection_error"] = type(error).__name__
        metadata = path.with_suffix(".metadata.json")
        if metadata.is_file() and metadata.stat().st_size <= 1024 * 1024:
            value = json.loads(metadata.read_text())
            result["sidecar"] = {key: value[key] for key in (
                "architecture", "task", "model_family", "model_version", "purpose", "labels", "classes",
                "trained_on", "checkpoint_sha256", "manifest_sha256", "dataset_manifest_sha256", "metrics_sha256",
                "export_parity_verified", "export_verification") if key in value}
            expected = value.get("onnx_sha256", value.get("model_sha256"))
            result["sidecar_hash_matches"] = expected == result["sha256"] if expected else None
    elif path.suffix.lower() == ".safetensors":
        # Read the non-executable JSON header only; no torch/deserialization.
        with path.open("rb") as handle:
            header_length = struct.unpack("<Q", handle.read(8))[0]
            if not 0 < header_length <= min(size - 8, 8 * 1024 * 1024):
                raise ValueError("Invalid bounded safetensors header")
            header = json.loads(handle.read(header_length))
        result["safetensors_header"] = {"tensor_count": len(header) - int("__metadata__" in header),
            "classifier_tensors": {key: {"shape": item.get("shape"), "dtype": item.get("dtype")}
                for key, item in header.items() if "classifier" in key and isinstance(item, dict)}}
    else:
        result["checkpoint_load"] = "NOT_LOADED_OPAQUE_HASH_ONLY"
    return result


def inspect_xlsx(path):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(item.itertext()) for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns)]
        sheets = []
        for name in sorted(archive.namelist()):
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                rows = []
                for row in ET.fromstring(archive.read(name)).findall("m:sheetData/m:row", ns):
                    cells = {}
                    for cell in row.findall("m:c", ns):
                        value = cell.findtext("m:v", default="", namespaces=ns)
                        if cell.get("t") == "s":
                            value = shared[int(value)]
                        elif cell.get("t") == "inlineStr":
                            value = "".join(cell.find("m:is", ns).itertext())
                        cells[cell.get("r")] = value
                    rows.append(cells)
                sheets.append({"sheet_xml": name, "row_count": len(rows), "first_rows": rows[:2], "last_rows": rows[-2:]})
    return {"path": str(path), "sha256": digest(path), "sheets": sheets,
            "scope": "Recorded workbook values only; no independent accuracy reproduction or detector mAP"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-root", type=Path, action="append", default=[])
    args = parser.parse_args()
    roots = [ROOT, *args.include_root]
    weights, runs, unavailable, links = inventory(roots)
    result = {"read_only": True, "roots": [str(root) for root in roots], "unavailable_roots": unavailable,
              "symlink_candidates_not_loaded": links, "weights": [inspect_weight(path) for path in weights],
              "run_and_evaluation_files": runs,
              "scope": "Absence applies only to inspected roots; does NOT assert YOLO has never been trained elsewhere"}
    workbook = ROOT / "ai-service/model/training_metrics.xlsx"
    if workbook.is_file():
        result["historical_workbook"] = inspect_xlsx(workbook)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
