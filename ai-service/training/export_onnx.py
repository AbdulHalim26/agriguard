"""Export the evaluated v2 checkpoint, then check ONNX/PyTorch logit parity."""

import argparse
import tempfile
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from common import (
    IMAGE_SIZE, LABELS, ManifestDataset, file_sha256, load_checkpoint, load_manifest,
    make_model, read_json, utc_now, write_json,
)

# Match runtime v1's tensor names. Small, enforced FP32 parity tolerances.
OPSET = 14
ATOL = 1e-5
RTOL = 1e-4
VERIFICATION_SEED = 123
CPU_THREADS = 4


def export(args):
    if not 0 < args.atol <= 1e-4 or not 0 < args.rtol <= 1e-3:
        raise ValueError("Toleransi harus kecil: atol <= 1e-4, rtol <= 1e-3")
    if args.output.exists() or args.output.with_suffix(".metadata.json").exists():
        raise ValueError("Artefak sudah ada; pilih output baru agar hasil terverifikasi tetap utuh")
    torch.set_num_threads(CPU_THREADS)
    manifest = load_manifest(args.dataset)
    checkpoint = load_checkpoint(args.checkpoint)
    metrics = read_json(args.metrics)
    checkpoint_hash = file_sha256(args.checkpoint)
    if (not checkpoint.get("evaluation_snapshot")
            or checkpoint["dataset"]["manifest_sha256"] != manifest["manifest_sha256"]
            or metrics.get("manifest_sha256") != manifest["manifest_sha256"]
            or metrics.get("checkpoint", {}).get("sha256") != checkpoint_hash
            or metrics.get("label_schema") != checkpoint["model"]["label_schema"]
            or metrics.get("labels") != checkpoint["model"]["labels"]
            or metrics.get("label_to_status") != checkpoint["model"]["label_to_status"]
            or metrics.get("dataset_sources") != manifest["dataset_sources"]
            or metrics.get("composition") != manifest["composition"]
            or metrics.get("split") != manifest["split"]
            or metrics.get("purpose") != checkpoint["purpose"]):
        raise ValueError("Checkpoint, evaluasi, label schema, atau identitas split tidak cocok")
    model = make_model()
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    generator = torch.Generator().manual_seed(VERIFICATION_SEED)
    inputs = [torch.randn(batch, 3, IMAGE_SIZE, IMAGE_SIZE, generator=generator) for batch in (1, 2)]
    validation = [row for row in manifest["samples"] if row["split"] == "val"]
    examples = []
    for label in LABELS:
        row = next(row for row in validation if row["label"] == label)
        inputs.append(ManifestDataset(args.dataset, [row])[0][0].unsqueeze(0))
        examples.append(row["id"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".onnx-", dir=args.output.parent) as folder:
        temporary = Path(folder) / "model_v2.onnx"
        with torch.inference_mode():
            torch.onnx.export(
                model, (inputs[0],), str(temporary), opset_version=OPSET,
                input_names=["pixel_values"], output_names=["logits"],
                dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
                do_constant_folding=True, dynamo=False,
            )
        onnx.checker.check_model(str(temporary))
        options = ort.SessionOptions()
        options.intra_op_num_threads = CPU_THREADS
        session = ort.InferenceSession(str(temporary), sess_options=options, providers=["CPUExecutionProvider"])
        differences = []
        for tensor in inputs:
            with torch.inference_mode():
                expected = model(tensor).numpy()
            actual = session.run(["logits"], {"pixel_values": tensor.numpy()})[0]
            if actual.shape != (tensor.size(0), len(LABELS)) or not np.isfinite(actual).all():
                raise ValueError("ONNX memiliki shape/logits tidak valid")
            np.testing.assert_allclose(actual, expected, atol=args.atol, rtol=args.rtol)
            differences.append(float(np.abs(actual - expected).max()))
        # Publish the model only after every comparison succeeded.
        temporary.replace(args.output)
    smoke = checkpoint["purpose"] == "pipeline_smoke_test"
    report = {
        "verified": True, "checked_at": utc_now(), "opset": OPSET,
        "atol": args.atol, "rtol": args.rtol, "max_absolute_logit_difference": max(differences),
        "cases": len(inputs), "random_batch_sizes": [1, 2], "validation_sample_ids": examples,
        "scope": "FP32 logits on random inputs and one real validation tensor per label; not a model accuracy claim",
        "versions": {"torch": str(torch.__version__), "onnx": onnx.__version__, "onnxruntime": ort.__version__},
    }
    metadata = {
        "schema_version": 1, **checkpoint["model"], "trained_on": checkpoint["created_at"],
        "purpose": checkpoint["purpose"], "ready_for_integration": not smoke,
        "checkpoint_sha256": checkpoint_hash, "manifest_sha256": manifest["manifest_sha256"],
        "split_id": manifest["split"]["id"], "metrics_sha256": file_sha256(args.metrics),
        "onnx_sha256": file_sha256(args.output), "input_name": "pixel_values", "output_name": "logits",
        "export_verification": report,
    }
    write_json(args.output.with_suffix(".metadata.json"), metadata)
    status_path = args.dataset / "retraining_status.json"
    status = read_json(status_path)
    write_json(status_path, {**status, "stage": "export_verified", "updated_at": utc_now(),
                             "ready_for_integration": not smoke})
    print(f'ONNX terverifikasi: {args.output}; max|logit diff|={max(differences):.8g}')
    if smoke:
        print("SMOKE TEST ONLY — artefak ini tidak boleh dipakai sebagai model v2 produksi.")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Destination model_v2.onnx in your artifacts folder")
    parser.add_argument("--atol", type=float, default=ATOL)
    parser.add_argument("--rtol", type=float, default=RTOL)
    args = parser.parse_args()
    try:
        export(args)
    except (ValueError, OSError, AssertionError) as exc:
        parser.exit(1, f"export_onnx: {exc}\n")


if __name__ == "__main__":
    main()
