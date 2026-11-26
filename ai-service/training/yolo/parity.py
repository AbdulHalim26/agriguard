"""Exact-head FP32 tensor parity on identical preprocessing; not accuracy proof."""
import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

from detection.adapter import preprocess
from .data import load_dataset, write_json
from .workflow import check_names, load_yolo


def compare_predictions(expected, actual, atol=1e-3, rtol=1e-3):
    expected, actual = np.asarray(expected), np.asarray(actual)
    if expected.shape != actual.shape or expected.ndim != 3 or expected.shape[0] != 1:
        raise ValueError("PyTorch/ONNX tensor layout mismatch")
    if not np.isfinite(expected).all() or not np.isfinite(actual).all():
        raise ValueError("Nonfinite parity tensors")
    if not (0 < atol <= 1e-2 and 0 < rtol <= 1e-2):
        raise ValueError("Explicit small FP32 tolerances required")
    np.testing.assert_allclose(actual, expected, atol=atol, rtol=rtol)
    return float(np.max(np.abs(expected - actual))) if expected.size else 0.0


def check_parity(checkpoint, onnx_path, dataset, family, output_format, imgsz, atol=1e-3, rtol=1e-3):
    import torch
    manifest = load_dataset(dataset)
    model = load_yolo(checkpoint, family)
    check_names(model, manifest["classes"])
    head = model.model.model[-1]
    head.end2end = output_format == "end2end_xyxy"
    if bool(head.end2end) != (output_format == "end2end_xyxy"):
        raise ValueError("PyTorch head selection unsupported")
    model.model.float().cpu().eval()
    model.model.fuse(verbose=False)
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    source, target = session.get_inputs()[0], session.get_outputs()[0]
    if len(session.get_inputs()) != 1 or len(session.get_outputs()) != 1 or source.shape != [1, 3, imgsz, imgsz]:
        raise ValueError("Unexpected exported inputs/outputs")
    feature_axis, features = (2, 6) if output_format == "end2end_xyxy" else (1, 4 + len(manifest["classes"]))
    if len(target.shape) != 3 or target.shape[0] != 1 or target.shape[feature_axis] != features:
        raise ValueError("Exported graph does not match selected head")
    inputs = [np.random.default_rng(seed).random((1, 3, imgsz, imgsz), dtype=np.float32) for seed in (42, 43)]
    selected = {}
    for entry in manifest["classes"]:
        row = next(r for r in manifest["samples"] if r["split"] == "val" and any(b[0] == entry["class_id"] for b in r["boxes"]))
        selected[row["id"]] = row
    for row in selected.values():
        tensor, _ = preprocess((Path(dataset) / row["image"]).read_bytes(), (imgsz, imgsz))
        inputs.append(tensor)
    differences = []
    for tensor in inputs:
        with torch.inference_mode():
            expected = model.model(torch.from_numpy(tensor))
            if isinstance(expected, tuple):
                expected = expected[0]
            if not isinstance(expected, torch.Tensor):
                raise ValueError("Unsupported PyTorch prediction structure")
            expected = expected.detach().cpu().numpy()
        actual = session.run([target.name], {source.name: tensor})[0]
        differences.append(compare_predictions(expected, actual, atol, rtol))
    return {"verified": True, "max_absolute_tensor_difference": max(differences), "cases": len(inputs),
            "atol": atol, "rtol": rtol, "validation_sample_ids": sorted(selected),
            "scope": "Same-head FP32 random/validation tensor parity, NOT object detection accuracy"}


def main():
    parser = argparse.ArgumentParser(description="Check real PyTorch/ONNX head parity on validation tensors.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--family", choices=("yolo26n", "yolo26s"), required=True)
    parser.add_argument("--output-format", choices=("end2end_xyxy", "raw_cxcywh_bcn"), required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.report.exists():
        raise ValueError("Parity report already exists")
    report = check_parity(args.checkpoint, args.onnx, args.dataset, args.family, args.output_format, args.imgsz)
    write_json(args.report, report)


if __name__ == "__main__":
    main()
