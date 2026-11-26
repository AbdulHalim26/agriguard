"""Shared provenance/preconditions. Heavy ML imports occur only on explicit runs."""
import json
import os
import platform
from importlib.metadata import version
from pathlib import Path

from detection.adapter import file_sha256
from .data import load_dataset


def require_dependencies(*packages):
    missing = []
    for package in packages:
        try:
            version(package)
        except Exception:
            missing.append(package)
    if missing:
        raise RuntimeError(f"Training dependencies unavailable: {', '.join(missing)}. Install training/yolo/requirements.txt in a separate approved training environment.")


def versions():
    return {"python": platform.python_version(), **{name: version(name) for name in ("ultralytics", "torch", "torchvision", "numpy", "onnxruntime")}}


def load_yolo(weights, family):
    weights = Path(weights).resolve()
    if not weights.is_file() or weights.suffix != ".pt":
        raise ValueError("Explicit existing local .pt weights required; automatic downloads are disabled")
    if family not in ("yolo26n", "yolo26s"):
        raise ValueError("Only YOLO26n/s detection candidates supported")
    require_dependencies("ultralytics", "torch", "torchvision")
    os.environ["YOLO_AUTOINSTALL"] = "false"
    from ultralytics import YOLO
    model = YOLO(str(weights), task="detect")
    configuration = model.model.yaml
    head = model.model.model[-1]
    # Validate architecture, NOT just a renamed weight filename. Version-specific
    # export support is subsequently proven by tensor inspection and real parity.
    if model.task != "detect" or "yolo26" not in Path(str(configuration.get("yaml_file", ""))).stem.lower() or configuration.get("scale") != family[-1]:
        raise ValueError("Checkpoint architecture/scale is not the requested YOLO26 detector")
    if not hasattr(head, "one2one_cv2") or not hasattr(head, "end2end") or int(getattr(head, "reg_max", 0)) != 1:
        raise ValueError("Installed Ultralytics/checkpoint lacks supported YOLO26 dual detection heads")
    return model


def check_names(model, classes):
    expected = {i: entry["class_name"] for i, entry in enumerate(classes)}
    if model.names != expected:
        raise ValueError("Checkpoint class mapping differs from reviewed dataset")


def load_run(dataset, run_dir, checkpoint):
    manifest = load_dataset(dataset)
    run_dir, checkpoint = Path(run_dir).resolve(), Path(checkpoint).resolve()
    run = json.loads((run_dir / "run.json").read_text())
    if run.get("stage") != "trained" or run.get("dataset_manifest_sha256") != manifest["manifest_sha256"] or run.get("purpose") != manifest["purpose"]:
        raise ValueError("Completed training run and exact dataset provenance required")
    if checkpoint != run_dir / "weights" / "best.pt" or not checkpoint.is_file() or file_sha256(checkpoint) != run.get("checkpoint_sha256"):
        raise ValueError("Checkpoint identity mismatch; only the validation-selected best.pt is accepted")
    return manifest, run


def add_run_arguments(parser):
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)


def head_nms(output_format):
    if output_format not in ("end2end_xyxy", "raw_cxcywh_bcn"):
        raise ValueError("Unsupported detector output format")
    return False if output_format == "end2end_xyxy" else None
