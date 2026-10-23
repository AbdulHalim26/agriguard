"""Evaluate the frozen checkpoint on its exact, untouched test split."""

import argparse
import shutil
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from common import (
    LABELS, LABEL_TO_STATUS, ManifestDataset, classification_metrics, file_sha256,
    inside, load_checkpoint, load_manifest, make_model, read_json, utc_now, write_json,
)

# Evaluation never augments images, changes weights, or tunes gates on the test set.
BATCH_SIZE = 32
MAX_MISCLASSIFIED_EXAMPLES = 24
CPU_THREADS = 4


def evaluate(args):
    if args.batch_size < 1:
        raise ValueError("batch-size harus positif")
    torch.set_num_threads(CPU_THREADS)
    manifest = load_manifest(args.dataset)
    checkpoint = load_checkpoint(args.checkpoint)
    if checkpoint["dataset"]["manifest_sha256"] != manifest["manifest_sha256"]:
        raise ValueError("Identitas dataset/split tidak sama dengan checkpoint")
    # No threshold tuning / selection of a different epoch using test results.
    if not checkpoint.get("evaluation_snapshot"):
        raise ValueError("Evaluasi harus memakai best.pt hasil seleksi validation")
    rows = [row for row in manifest["samples"] if row["split"] == "test"]
    smoke = checkpoint["purpose"] == "pipeline_smoke_test"
    if not smoke and any(row["kind"] != "flood_paddy" for row in rows):
        raise ValueError("Test set v2 harus data banjir padi utama, bukan data penyakit pendukung")
    device = torch.device(args.device)
    model = make_model().to(device)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    loader = DataLoader(ManifestDataset(args.dataset, rows), batch_size=args.batch_size, shuffle=False)
    predicted, confidences = [], []
    with torch.inference_mode():
        for images, _ in loader:
            logits = model(images.to(device))
            if logits.shape[1] != len(LABELS) or not torch.isfinite(logits).all():
                raise ValueError("Shape/logits model tidak valid")
            scores, indices = logits.softmax(1).max(1)
            predicted.extend(LABELS[index] for index in indices.cpu().tolist())
            confidences.extend(scores.cpu().tolist())
    truth = [row["label"] for row in rows]
    result = classification_metrics(truth, predicted, LABELS, LABEL_TO_STATUS)
    mistakes = []
    example_dir = args.output.parent / "misclassified"
    for row, label, confidence in zip(rows, predicted, confidences):
        if row["label"] == label or len(mistakes) >= MAX_MISCLASSIFIED_EXAMPLES:
            continue
        example_dir.mkdir(parents=True, exist_ok=True)
        destination = example_dir / f'{row["id"]}.jpg'
        shutil.copy2(inside(args.dataset, row["path"]), destination)
        mistakes.append({
            "sample_id": row["id"], "source_id": row["source_id"], "group_id": row["group_id"],
            "actual_label": row["label"], "predicted_label": label,
            "confidence": confidence, "image": f"misclassified/{destination.name}",
        })
    metrics = {
        "schema_version": 1, **checkpoint["model"], "evaluated_at": utc_now(),
        "trained_on": checkpoint["created_at"], "purpose": checkpoint["purpose"],
        "checkpoint": {
            "file": args.checkpoint.name, "sha256": file_sha256(args.checkpoint),
            "epoch": checkpoint["epoch"], "selection": checkpoint["training_config"]["selection"],
        },
        "dataset_size": manifest["dataset_size"],
        "dataset_sources": manifest["dataset_sources"], "composition": manifest["composition"],
        "split": manifest["split"], "manifest_sha256": manifest["manifest_sha256"],
        "training_config": checkpoint["training_config"],
        "training_environment": checkpoint["environment"],
        "evaluation": {
            "context": (
                "Uji pipeline pada fixture; bukan metrik akurasi model untuk publikasi."
                if smoke else
                "Holdout test banjir/genangan padi berlabel kerusakan visual, dikelompokkan "
                "per kejadian/lahan/video; sumber penyakit hanya di train. Bukan test set "
                "penulis v1 dan bukan evaluasi independen v1 pada 42 gambar."
            ),
            "split": "test", "sample_count": len(rows),
            "gates_applied": False,
            "scope": "Classifier top-1 sebelum gerbang HSV 15% dan confidence 50%; bukan akurasi endpoint end-to-end.",
            "status_accuracy_note": "Mapping tiga label v2 ke tiga status bersifat 1:1; akurasi kelas dan status sama secara matematis.",
            **result,
            "misclassified_count": sum(actual != label for actual, label in zip(truth, predicted)),
            "misclassified_examples": mistakes,
            "source_counts": {
                source["id"]: sum(row["source_id"] == source["id"] for row in rows)
                for source in manifest["dataset_sources"]
            },
        },
    }
    write_json(args.output, metrics)
    status_path = args.dataset / "retraining_status.json"
    status = read_json(status_path)
    write_json(status_path, {**status, "stage": "evaluated", "updated_at": utc_now()})
    print(f'Metrics: {args.output}; test={len(rows)}, '
          f'class_acc={result["class_accuracy"]:.4f}, status_acc={result["status_accuracy"]:.4f}')
    if smoke:
        print("SMOKE TEST ONLY — jangan publikasikan angka ini sebagai akurasi model.")
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Path metrics.json")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    args = parser.parse_args()
    try:
        evaluate(args)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"evaluate: {exc}\n")


if __name__ == "__main__":
    main()
