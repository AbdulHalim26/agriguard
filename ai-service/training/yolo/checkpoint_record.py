"""Record a MANUALLY acquired checkpoint without unpickling or downloading it."""
import argparse
import json
import re
from pathlib import Path

from detection.adapter import file_sha256
from .import_yolo import local_file, public_url


def record_checkpoint(checkpoint, config_path, output):
    checkpoint, config_path, output = Path(checkpoint).resolve(), Path(config_path).resolve(), Path(output).resolve()
    if not checkpoint.is_file() or checkpoint.suffix != ".pt" or checkpoint.stat().st_size == 0:
        raise ValueError("An existing nonempty manually acquired .pt file is required")
    if output.exists():
        raise ValueError("Checkpoint provenance output already exists")
    config = json.loads(config_path.read_text())
    if config.get("approved") is not True or not config.get("reviewed_by", "").strip() or config.get("license_verified") is not True:
        raise ValueError("Manual checkpoint origin/license approval required")
    source = public_url(config["source_url"])
    match = re.fullmatch(r"https://github\.com/ultralytics/assets/releases/download/(v[0-9.]+)/(yolo26[ns])\.pt", source)
    if not match or match[1] != config.get("release_tag") or match[2] != config.get("model_family"):
        raise ValueError("Use the explicit official release asset for the selected YOLO26n/s detector")
    public_url(config["license_url"])
    if not config.get("license") or not config.get("evidence"):
        raise ValueError("License/source evidence required")
    for entry in config["evidence"]:
        if file_sha256(local_file(config_path.parent, entry["path"])) != entry.get("sha256"):
            raise ValueError("Checkpoint source/license evidence hash mismatch")
    checksum = file_sha256(checkpoint)
    upstream = config.get("upstream_sha256")
    if upstream is not None and (not re.fullmatch(r"[a-f0-9]{64}", upstream) or upstream != checksum):
        raise ValueError("Checkpoint does not match the recorded publisher checksum")
    record = {**config, "purpose": "general_pretrained_detection", "documented_pretraining": "COCO-80",
              "checkpoint_sha256": checksum, "bytes": checkpoint.stat().st_size, "architecture_verified": False,
              "checksum_verification": "MATCHED_RECORDED_UPSTREAM_DIGEST" if upstream else "LOCAL_DIGEST_ONLY",
              "scope": "Recorded local file and reviewer declarations only; not disease training, architecture validation, or detection evaluation"}
    with output.open("x") as handle:
        json.dump(record, handle, indent=2, allow_nan=False)
        handle.write("\n")
    return {"checkpoint_sha256": checksum, "checksum_verification": record["checksum_verification"], "architecture_verified": False}


def main():
    parser = argparse.ArgumentParser(description="Record local official YOLO26 detection checkpoint provenance; no network, pickle loading, or training.")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(record_checkpoint(args.checkpoint, args.config, args.output), indent=2))


if __name__ == "__main__":
    main()
