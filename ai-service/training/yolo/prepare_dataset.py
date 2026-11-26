"""Run from ai-service: python -m training.yolo.prepare_dataset --help."""
import argparse
from pathlib import Path

from .data import prepare


def main():
    parser = argparse.ArgumentParser(description="Validate reviewed rice boxes and prepare immutable group-aware YOLO dataset; never downloads data.")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    manifest = prepare(args.root, args.inventory, args.config, args.output, args.seed)
    print(f"Prepared {len(manifest['samples'])} reviewed unique images; manifest {manifest['manifest_sha256']}")


if __name__ == "__main__":
    main()
