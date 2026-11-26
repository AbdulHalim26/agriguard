"""Holdout detection metrics, never classifier accuracy or percent tissue damage."""
import argparse
from pathlib import Path

from detection.adapter import file_sha256
from .data import write_json
from .workflow import add_run_arguments, check_names, head_nms, load_run, load_yolo, versions


def evaluate(args):
    if args.output.exists():
        raise ValueError("Evaluation output already exists")
    manifest, run = load_run(args.dataset, args.run, args.checkpoint)
    model = load_yolo(args.checkpoint, run["config"]["family"])
    check_names(model, manifest["classes"])
    args.output.mkdir(parents=True, exist_ok=False)
    metrics = model.val(data=str(args.dataset.resolve() / "data.yaml"), split="test", imgsz=run["config"]["imgsz"],
                        nms=head_nms(run["config"]["output_format"]), device=args.device, workers=0,
                        plots=False, save_json=False, project=str(args.output.parent), name=args.output.name, exist_ok=True)
    result = {"purpose": manifest["purpose"], "dataset_manifest_sha256": manifest["manifest_sha256"],
              "checkpoint_sha256": file_sha256(args.checkpoint), "classes": manifest["classes"],
              "output_format": run["config"]["output_format"], "split": "test",
              "test_images": sum(row["split"] == "test" for row in manifest["samples"]),
              "metrics": {key: float(value) for key, value in metrics.results_dict.items()},
              "environment": versions(), "scope": "Bounding-box detection holdout only; no tissue/severity calibration"}
    write_json(args.output / "metrics.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description="Evaluate frozen YOLO checkpoint on group-isolated holdout.")
    add_run_arguments(parser)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", default="cpu")
    evaluate(parser.parse_args())


if __name__ == "__main__":
    main()
