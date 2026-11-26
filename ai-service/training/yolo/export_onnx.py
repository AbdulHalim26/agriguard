"""Export into a NEW artifact slot; publish only after real tensor parity passes."""
import argparse
import json
import shutil
import tempfile
from pathlib import Path

from detection.adapter import YoloDetector, file_sha256
from detection.contracts import ModelSpec
from .data import write_json
from .parity import check_parity
from .workflow import add_run_arguments, check_names, head_nms, load_run, load_yolo, require_dependencies, versions


def publish_artifacts(artifact: Path, report: Path, output: Path):
    """Exclusive creation also prevents concurrent exports replacing a prior run.

    A partial I/O failure leaves an unavailable slot, never an overwritten model.
    The loader requires the checksum-bound metadata, which is written LAST.
    """
    for source, destination in (
        (artifact, output),
        (report, output.with_suffix(".export-report.json")),
        (artifact.with_suffix(".metadata.json"), output.with_suffix(".metadata.json")),
    ):
        with source.open("rb") as reader, destination.open("xb") as writer:
            shutil.copyfileobj(reader, writer)


def export(args):
    output = args.output.resolve()
    metadata_path, report_path = output.with_suffix(".metadata.json"), output.with_suffix(".export-report.json")
    if output.suffix != ".onnx" or any(path.exists() for path in (output, metadata_path, report_path)):
        raise ValueError("Choose a NEW .onnx destination; existing artifacts must not be overwritten")
    manifest, run = load_run(args.dataset, args.run, args.checkpoint)
    metrics = json.loads(args.metrics.read_text())
    if metrics.get("dataset_manifest_sha256") != manifest["manifest_sha256"] or metrics.get("checkpoint_sha256") != run["checkpoint_sha256"] or metrics.get("output_format") != run["config"]["output_format"] or metrics.get("purpose") != manifest["purpose"] or metrics.get("split") != "test":
        raise ValueError("Holdout evaluation/dataset/checkpoint/head provenance mismatch")
    require_dependencies("onnx", "ultralytics", "torch", "torchvision")
    import onnx
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".export-yolo-", dir=output.parent) as temporary:
        staging = Path(temporary)
        checkpoint = staging / "source.pt"
        shutil.copyfile(args.checkpoint, checkpoint)
        model = load_yolo(checkpoint, run["config"]["family"])
        check_names(model, manifest["classes"])
        fmt, size = run["config"]["output_format"], run["config"]["imgsz"]
        exported = Path(model.export(format="onnx", imgsz=size, batch=1, dynamic=False, half=False,
                                     simplify=False, opset=17, nms=head_nms(fmt), device="cpu"))
        if not exported.resolve().is_relative_to(staging):
            raise ValueError("Exporter wrote outside isolated artifact directory")
        graph = onnx.load(str(exported), load_external_data=False)
        if any(t.data_location == onnx.TensorProto.EXTERNAL for t in graph.graph.initializer):
            raise ValueError("External tensor files not supported in serving artifact")
        metadata = {item.key: item.value for item in graph.metadata_props}
        metadata.update({"agriguard_output_format": fmt, "agriguard_model_family": run["config"]["family"]})
        onnx.helper.set_model_props(graph, metadata)
        onnx.checker.check_model(graph)
        artifact = staging / output.name
        onnx.save(graph, str(artifact))
        verification = check_parity(checkpoint, artifact, args.dataset, run["config"]["family"], fmt, size)
        import onnxruntime as ort
        session = ort.InferenceSession(str(artifact), providers=["CPUExecutionProvider"])
        spec = ModelSpec(
            purpose=manifest["purpose"], model_version=args.model_version, model_family=run["config"]["family"],
            model_sha256=file_sha256(artifact), dataset_manifest_sha256=manifest["manifest_sha256"], export_parity_verified=True,
            input_name=session.get_inputs()[0].name, output_name=session.get_outputs()[0].name,
            input_size=(size, size), output_format=fmt, classes=manifest["classes"],
        )
        write_json(artifact.with_suffix(".metadata.json"), spec.model_dump())
        # Exercise exactly the deployed loader and its result validation on REAL
        # validation images. Synthetic test artifacts can never load in production.
        detector = YoloDetector(artifact, allow_synthetic=manifest["purpose"] == "synthetic_test")
        for identifier in verification["validation_sample_ids"]:
            row = next(r for r in manifest["samples"] if r["id"] == identifier)
            detector.detect((args.dataset / row["image"]).read_bytes())
        report = {"parity": verification, "environment": {**versions(), "onnx": onnx.__version__},
                  "model_sha256": spec.model_sha256, "checkpoint_sha256": file_sha256(args.checkpoint),
                  "metrics_sha256": file_sha256(args.metrics), "purpose": manifest["purpose"],
                  "scope": "Export compatibility/parity only; field accuracy and severity calibration require separate acceptance"}
        write_json(staging / report_path.name, report)
        publish_artifacts(artifact, staging / report_path.name, output)
    return spec


def main():
    parser = argparse.ArgumentParser(description="Export reviewed YOLO26 FP32 ONNX with explicit head manifest and parity gate.")
    add_run_arguments(parser)
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-version", required=True)
    spec = export(parser.parse_args())
    print(f"Export complete: {spec.model_version}, format {spec.output_format}")


if __name__ == "__main__":
    main()
