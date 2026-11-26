"""Explicit local fine-tuning only. No weights or dataset downloads."""
import argparse
import math
from pathlib import Path

from detection.adapter import file_sha256
from .data import load_dataset, write_json
from .workflow import check_names, head_nms, load_yolo, versions


def training_config(args):
    if args.epochs < 1 or args.batch < 1 or args.imgsz < 32 or args.imgsz > 2048 or args.imgsz % 32:
        raise ValueError("Positive epochs/batch and static stride-32 image size required")
    head_nms(args.output_format)
    lr0, lrf = getattr(args, "lr0", .001), getattr(args, "lrf", .01)
    weight_decay, patience = getattr(args, "weight_decay", .0005), getattr(args, "patience", 15)
    if not all(math.isfinite(v) for v in (lr0, lrf, weight_decay)) or not (0 < lr0 <= 1 and 0 < lrf <= 1 and 0 <= weight_decay <= 1):
        raise ValueError("Invalid explicit optimizer schedule")
    if patience < 1 or not 0 <= args.seed < 2**32:
        raise ValueError("Positive patience and uint32 seed required")
    config = {
        "family": args.family, "imgsz": args.imgsz, "epochs": args.epochs, "batch": args.batch,
        "seed": args.seed, "device": args.device, "output_format": args.output_format,
        "optimizer": "AdamW", "amp": False, "deterministic": True,
        "lr0": lr0, "lrf": lrf, "weight_decay": weight_decay, "patience": patience,
        "close_mosaic": min(10, args.epochs), "workers": 0,
    }
    return config


def train(args):
    if args.output.exists():
        raise ValueError("Training output already exists; do not overwrite a prior run")
    config = training_config(args)
    manifest = load_dataset(args.dataset)
    model = load_yolo(args.weights, args.family)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    run = {"stage": "started", "purpose": manifest["purpose"], "dataset_manifest_sha256": manifest["manifest_sha256"],
           "initial_weights_sha256": file_sha256(args.weights), "config": config, "environment": versions()}
    write_json(output / "run.json", run)
    # Explicit amp=False avoids Ultralytics AMP self-check weight downloads.
    # Plotting disabled to avoid font downloads; dataset YAML forbids download.
    model.train(data=str(args.dataset.resolve() / "data.yaml"), epochs=args.epochs, batch=args.batch,
                imgsz=args.imgsz, seed=args.seed, deterministic=True, device=args.device, workers=0,
                amp=False, optimizer="AdamW", cache=False, plots=False, val=True,
                lr0=config["lr0"], lrf=config["lrf"], weight_decay=config["weight_decay"],
                patience=config["patience"], close_mosaic=config["close_mosaic"],
                nms=head_nms(args.output_format), project=str(output.parent), name=output.name,
                exist_ok=True, save=True)
    checkpoint = output / "weights" / "best.pt"
    trained = load_yolo(checkpoint, args.family)
    check_names(trained, manifest["classes"])
    write_json(output / "run.json", {**run, "stage": "trained", "checkpoint_sha256": file_sha256(checkpoint),
                                     "effective_args_sha256": file_sha256(output / "args.yaml")})
    return checkpoint


def main():
    parser = argparse.ArgumentParser(description="Fine-tune reviewed rice detection boxes; no implicit downloads.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--family", choices=("yolo26n", "yolo26s"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--output-format", choices=("end2end_xyxy", "raw_cxcywh_bcn"), default="end2end_xyxy")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--lr0", type=float, default=.001)
    parser.add_argument("--lrf", type=float, default=.01)
    parser.add_argument("--weight-decay", type=float, default=.0005)
    parser.add_argument("--patience", type=int, default=15)
    args = parser.parse_args()
    print(f"Training checkpoint: {train(args)}")


if __name__ == "__main__":
    main()
