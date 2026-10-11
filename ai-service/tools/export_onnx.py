"""One-time exporter: Hugging Face image-classification checkpoint -> ONNX.

Model sumber : SodaXII/efficientnet-b0_rice-leaf-disease-augmented-v4_fft
               (fine-tune dari google/efficientnet-b0, 8 kelas daun padi)
Input        : ai-service/model/  (config.json + model.safetensors + preprocessor_config.json)
Output       : ai-service/model/model.onnx

Jalankan sekali (butuh torch + transformers + onnx, TIDAK dibutuhkan saat runtime):
    python tools/export_onnx.py --model-dir model --out model/model.onnx

Runtime produksi hanya memakai onnxruntime (lihat requirements.txt).
"""

import argparse
import os

import torch
from transformers import AutoModelForImageClassification


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default="model")
    ap.add_argument("--out", default="model/model.onnx")
    ap.add_argument("--opset", type=int, default=14)
    args = ap.parse_args()

    model = AutoModelForImageClassification.from_pretrained(args.model_dir)
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    torch.onnx.export(
        model,
        (dummy,),
        args.out,
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
        do_constant_folding=True,
        dynamo=False,
    )
    print("exported ->", args.out, os.path.getsize(args.out), "bytes")


if __name__ == "__main__":
    main()
