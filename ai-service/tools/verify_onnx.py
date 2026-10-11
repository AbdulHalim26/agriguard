"""Verifikasi ONNX hasil ekspor vs model PyTorch asli + cek konsistensi preprocessing.

Tujuan:
  1. Pastikan logits ONNX ~= logits PyTorch (toleransi kecil).
  2. Bandingkan pipeline preprocessing numpy (yang dipakai runtime) dengan
     HF AutoImageProcessor pada gambar nyata.

Jalankan dengan env yang punya torch+transformers+onnxruntime (env konversi).
"""

import os
import sys
import numpy as np
from PIL import Image

import torch
import onnxruntime as ort
from transformers import AutoImageProcessor, AutoModelForImageClassification

MODEL_DIR = "model"
ONNX_PATH = os.path.join(MODEL_DIR, "model.onnx")
IMAGE_SIZE = 224
RESCALE = 1.0 / 255.0
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.47853944, 0.4732864, 0.47434163], dtype=np.float32)


def my_preprocess(path, resample):
    im = Image.open(path).convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), resample)
    arr = np.asarray(im, dtype=np.float32) * RESCALE
    arr = (arr - MEAN) / STD
    return np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def main():
    model = AutoModelForImageClassification.from_pretrained(MODEL_DIR).eval()
    proc = AutoImageProcessor.from_pretrained(MODEL_DIR)
    sess = ort.InferenceSession(ONNX_PATH, providers=["CPUExecutionProvider"])
    id2label = model.config.id2label

    # --- Isolate model divergence (same fixed input to both) ---
    rng = np.random.default_rng(0)
    fixed = rng.standard_normal((1, 3, 224, 224)).astype(np.float32)
    with torch.no_grad():
        lt = model(pixel_values=torch.from_numpy(fixed)).logits.numpy()[0]
    lo = sess.run(["logits"], {"pixel_values": fixed})[0][0]
    print("MODEL DIVERGENCE (fixed random input):")
    print(f"  max|torch-onnx| = {np.abs(lt - lo).max():.6f}")
    print(f"  torch top: {id2label[int(lt.argmax())]}  onnx top: {id2label[int(lo.argmax())]}")

    images = sys.argv[1:] or []
    for img in images:
        pil = Image.open(img).convert("RGB")

        # --- PyTorch reference ---
        pv = proc(images=pil, return_tensors="pt")["pixel_values"][0].numpy()

        # --- ONNX with processor-equal preprocessing (NEAREST per config resample=0) ---
        x = my_preprocess(img, Image.NEAREST)[0]
        # --- ONNX with BICUBIC (alternative) ---
        xb = my_preprocess(img, Image.BICUBIC)[0]

        with torch.no_grad():
            logits_t = model(pixel_values=torch.from_numpy(pv)[None]).logits[0].numpy()
        logits_o = sess.run(["logits"], {"pixel_values": x[None]})[0][0]
        logits_b = sess.run(["logits"], {"pixel_values": xb[None]})[0][0]

        pt = softmax(logits_t)
        po = softmax(logits_o)
        pb = softmax(logits_b)
        print("=" * 70)
        print(os.path.basename(img))
        print(f"  preprocess max|proc-myNEAREST| = {np.abs(pv - x).max():.6f}")
        print(f"  preprocess max|proc-myBICUBIC| = {np.abs(pv - xb).max():.6f}")
        print(f"  torch  top: {id2label[int(pt.argmax())]:<24} p={pt.max():.4f}")
        print(f"  onnxNEAREST: {id2label[int(po.argmax())]:<24} p={po.max():.4f}")
        print(f"  onnxBICUBIC: {id2label[int(pb.argmax())]:<24} p={pb.max():.4f}")
        print(f"  max|torch-onnxNEAREST| = {np.abs(logits_t - logits_o).max():.5f}")
        print(f"  max|torch-onnxBICUBIC| = {np.abs(logits_t - logits_b).max():.5f}")


if __name__ == "__main__":
    main()
