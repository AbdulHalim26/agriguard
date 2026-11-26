# PHASE 2.0A — Rencana benchmark EfficientNet-B0 vs MobileNetV3

Tanggal: **16 November 2026**. Status: **PROPOSED / PLANNED_NOT_RUN**.
Pelaksanaan accuracy comparison **BLOCKED** oleh reviewed data, checkpoint yang
comparable, dan environment ML approved. Tidak ada hasil latency/F1 baru di sini.

## 1. Pertanyaan eksperimen

Dengan taxonomy, reviewed images, frozen group split, preprocessing, budget
training dan CPU deployment yang sama, apakah MobileNetV3-Small atau Large
memberikan trade-off kualitas/latency/peak memory lebih baik dari EfficientNet-B0?
Inference berada di server FastAPI; nama “Mobile” bukan alasan pemilihan.

Pisahkan dua task yang tidak boleh dipool:

- **C-DISEASE**: klasifikasi gejala penyakit padi, jika label ahli tersedia.
- **C-VISUAL-DAMAGE**: kelas kerusakan visual dengan bukti konteks, bukan otomatis
  penyebab banjir atau persen kehilangan hasil. Protokol reviewer harus spesifik.

Dataset mixed detection yang masih pending bukan classification ground truth.
Tidak membuat label klasifikasi dari folder/box tanpa persetujuan scope dan label.

## 2. Inspeksi kandidat — metadata referensi, bukan benchmark AgriGuard

Dokumentasi resmi Torchvision diakses 16 November 2026:

| Builder default, head ImageNet 1.000 kelas | Parameter dipublikasikan | File weights referensi dipublikasikan | Serving AgriGuard |
|---|---:|---:|---|
| [EfficientNet-B0](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.efficientnet_b0.html) | 5.288.548 | 20,5 MB | B0 v2 ONNX existing 16.035.581 bytes, head 3 kelas. |
| [MobileNetV3-Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html) | 2.542.856 | 9,8 MB | Checkpoint/export AgriGuard **MISSING**. |
| [MobileNetV3-Large](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_large.html) | 5.483.032 | 21,1 MB | Checkpoint/export AgriGuard **MISSING**. |

Angka publik memakai head/format weights berbeda dari ONNX tiga kelas existing;
tidak boleh dibandingkan langsung sebagai deployed-size improvement. Parameter
run nyata harus dihitung dari model instantiated dengan **K yang sama**
(`sum(p.numel() ...)`, trainable dicatat terpisah). Catat ONNX bytes, initializer
bytes, metadata, dan precision secara terpisah; ukuran disk bukan peak memory.

B0 memakai MBConv/SiLU/SE, MobileNetV3 depthwise/inverted residual, SE dan
hard-swish. Operasi ini masuk akal untuk ekspor ONNX CPU tetapi kompatibilitas
checkpoint/exporter/opset dan fusion/latency target tetap **UNVERIFIED**. MobileNet
Large referensi justru mempunyai parameter lebih banyak daripada B0.

Transform weights resmi juga berbeda: B0 resize 256 BICUBIC + center crop 224;
MobileNet Small/Large V1 BILINEAR 256→224, Large V2 232→224. **Jangan** memakai
`.transforms()` berbeda-beda lalu menyebut eksperimen terkontrol identik.

## 3. Prasyarat sebelum eksekusi — REQUIRES_APPROVAL

1. Taxonomy dan pedoman label disetujui reviewer agronomi; semua sumber punya
   version/usage/license evidence dan label review yang dapat ditelusuri.
2. Manifest immutable mencatat image SHA, label, reviewer/protocol, source,
   acquisition field/event/session/video dan global group ID. Derivatives dan
   reused images lintas sumber tidak terpisah ke split berbeda.
3. Bekukan train/validation/test sekali, misalnya target group-aware 70/15/15;
   laporkan rasio aktual serta support dan independent groups setiap kelas.
   Pilih floor kecukupan oleh reviewer sebelum eksperimen, bukan mengarang angka
   minimum seolah guarantee statistik. Jangan memecah satu video agar floor lolos.
4. Dataset holdout lapangan Karawang yang independen bila tersedia; perangkat,
   musim, stadium tanaman, sudut, cahaya, refleksi, blur dan non-padi tercatat.
   Tanpa holdout ini, robustness lokal tetap UNVERIFIED.
5. Tiga checkpoint fine-tuned pada manifest yang sama, atau izin menjalankan
   controlled training. Existing B0 v2 boleh diinspeksi sebagai baseline legacy,
   tetapi **bukan** pasangan fair bila dataset/checkpoint identity tidak terbukti.
6. Izin dependency ML terpisah dan local weights dengan checksum; tidak ada
   auto-download atau pemasangan ke serving venv. Torch/torchvision/Ultralytics/
   ONNX authoring saat audit tidak tersedia. ORT 1.31.0 tersedia.
7. Setujui CPU/RAM/container/thread budget dan SLO calon deployment serta toleransi
   quality degradation sebelum melihat hasil. Target Linux CPU perlu diukur;
   angka Apple M1 tidak mewakili Render.

## 4. Protokol terkontrol

### 4.1 Data dan training (belum dijalankan)

- Common transform: EXIF-normalized RGB, direct resize **224×224 BICUBIC**, `/255`,
  mean/std ImageNet, NCHW FP32. Gunakan tensor/citra sumber yang sama untuk semua
  kandidat. Catat risiko distorsi aspect ratio sebagai limitation bersama.
- Eksperimen native-transform dapat menjadi ablation terpisah; tidak dicampur ke
  ranking utama atau mengubah runtime existing diam-diam.
- Pin builder, explicit weight enum/hash, package lock, K dan label order. Hindari
  `DEFAULT` berubah antarversi. Random/untrained weights hanya menguji mekanik,
  tidak dievaluasi sebagai rice model.
- Referensi usulan: seeds **42/43/44**, 15 epoch maksimum, budget optimasi dan
  augmentasi train identik, class weights hanya train, head warm-up 2 epoch dan
  patience 5. Hyperparameter ini **PROPOSED**, bukan hasil optimum.
- Optimizer, LR, scheduler, unfreezing, batch, resolution, augmentation dan waktu
  compute budget ditetapkan dalam run config sebelum eksperimen. Jika tuning per
  arsitektur diperbolehkan, beri budget pencarian yang sama dan laporkan seluruh run.
- Validation macro-F1 memilih checkpoint/ties berdasarkan validation loss yang
  telah ditetapkan; test tidak memilih epoch/gates/architecture tuning. Catat
  setiap seed, termasuk failed runs. Jika test sudah berulang dipakai untuk
  keputusan, tandai sebagai development set dan kumpulkan holdout baru.

### 4.2 Evaluasi ilmiah

Existing `training/common.py::classification_metrics` sudah menghitung accuracy,
per-class row accuracy (recall) dan confusion matrix. Precision/macro-F1 dan
benchmark multi-architecture **belum diimplementasi**.

Runner/evaluator baru yang diusulkan harus menyimpan per-sample truth,
prediction, probabilities, model hash dan group ID sehingga dapat dihitung ulang:

- Accuracy dan majority-class baseline dari holdout yang sama.
- Confusion matrix K×K, **rows=actual / columns=predicted**, dengan label order.
- Untuk kelas c: precision `TP/(TP+FP)`, recall `TP/(TP+FN)`,
  F1 `2TP/(2TP+FP+FN)`; support, TP/FP/FN, macro-F1 unweighted K kelas.
- Zero predictions pada kelas yang mempunyai support → precision/F1 0 dengan
  catatan eksplisit. Kelas tanpa support → not evaluable; tidak mengeluarkan kelas
  itu diam-diam untuk memperbaiki macro average. Readiness task perlu ditinjau.
- Laporkan distribusi tiga seed; paired cluster-bootstrap menurut acquisition
  group (usulan 1.000 resamples, seed 42) untuk CI/delta antar kandidat. Jumlah
  gambar bukan jumlah independensi. Jangan menyebut CI stabil bila groups minim.
- Jalur raw classifier dan full endpoint (HSV/confidence rejection) dievaluasi
  terpisah: rejection/coverage, false rejection, accepted-set performance dan
  seluruh denominator. Skor softmax tidak otomatis calibrated probability.
- Slice robustness lapangan: cahaya/glare/blur, stadium, device, background,
  genangan/vegetasi rendah, non-padi/OOD. Laporkan penurunan kelas kritis serta
  reviewer error analysis. Transform robustness test bukan data independen baru.

Tidak membandingkan metrik penyakit v1, 42 gambar historis dan 145 gambar source
v2 seolah berasal dari test set yang sama. Tidak mengukur “akurasi banjir” dengan
label penyakit atau visual symptom saja.

### 4.3 ONNX correctness dan deployment benchmark

1. Ekspor slot **NEW** terpisah, FP32, batch 1 untuk serving comparison; opset
   dipin yang kompatibel untuk ketiga model (usulan 17, perlu verifikasi). Legacy
   v2 yang ada memakai opset 14 menurut metadata; tidak ditimpa.
2. Periksa tensor names/shapes, preprocessing, label order dan checksum; ONNX
   checker serta PyTorch–ORT logits parity pada seeded tensor dan reviewed
   validation images tiap kelas. Usulan toleransi `atol=1e-5`, `rtol=1e-4`, output
   finite dan argmax agreement; gagal parity berarti investigasi, bukan relaksasi
   threshold tanpa dokumentasi.
3. Gunakan Linux/container/CPU target yang sama, CPUExecutionProvider, batch 1,
   FP32, explicit ORT threads (usulan intra=4/inter=1) dan CPU limits. Catat cold
   import+session load, model-only, decode/preprocess, postprocess dan total
   inference secara terpisah. HTTP upload/auth/receipt DB adalah lapisan lain.
4. Usulan 20 warm-up + **1.000 timed calls ×5 repeats** setiap kandidat pada corpus
   tensor identik dan randomized candidate order. Simpan raw timings, p50/p95/p99,
   mean/std dan throughput. Laporkan concurrency 1 dahulu, lalu 2/4 sebagai
   load test terpisah. Hindari background workloads/thermal drift tak tercatat.
5. Peak RSS di fresh process per kandidat termasuk Python/ORT/session/buffer,
   steady RSS, baseline RSS dan headroom; normalisasi unit alat (macOS bytes,
   Linux `ru_maxrss` KiB). Ukur peak saat cold load dan request concurrency;
   perbedaan RSS snapshot bukan otomatis peak. Jangan tambah psutil tanpa approval.
6. Ulangi di deployment-equivalent environment setelah izin staging. Uji cold
   start service terpisah dari CPU inference; service sleep/network bukan latency
   arsitektur. INT8/quantization kelak run terpisah dengan calibration data train/
   validation, parity dan re-evaluation, bukan mencampur FP32 dengan INT8.

## 5. Artefak reproducible yang wajib diserahkan

**PROPOSED**, belum ada benchmark runner multi-model atau hasil folder ini:

```text
NEW-benchmark-run/
  protocol.json           # preregistered task, taxonomy, split, transforms, SLO
  environment.json        # OS/CPU/RAM/container/providers/threads/package versions
  inputs.sha256           # dataset/checkpoint/config identities
  runs/<arch>/<seed>/      # config, validation selection, immutable model metadata
  predictions.jsonl       # exact sample IDs, truth, scores, group IDs
  metrics.json            # K fixed, class support, confusion, precision/recall/F1
  parity.json             # tensors/cases/tolerances and actual measured results
  timings.jsonl           # raw cold/warm/component/concurrency timings
  memory.json             # measurement tool, units, baseline/peak/headroom
  decision.md             # evidence, limitations, reviewer and approval
```

Prosedur reproducible kelak: validate manifest → train/load approved comparable
checkpoints → select on validation → freeze → evaluate once on holdout → export/
parity → CPU/RSS benchmark → review decision. Bukan perintah executable yang sudah
tersedia. Seluruh output NEW, tanpa mutasi raw/review atau auto serving activation.

## 6. Decision rule dan acceptance criteria

- **BENCH-AC1**: common data/split/K/transform/environment hashes identik; label,
  source rights, group leakage dan per-class adequacy disetujui sebelum training.
- **BENCH-AC2**: seluruh quality metrics/denominator, per-class precision/recall,
  macro-F1/confusion dan uncertainty dapat dihitung ulang dari raw predictions.
- **BENCH-AC3**: latency/size/peak RSS diukur di target setara, bukan dari GFLOPS
  atau nama arsitektur; parity terpisah dari akurasi.
- **BENCH-AC4**: model baru harus memenuhi SLO CPU/RAM dan non-inferiority quality
  margin yang **ditetapkan reviewer sebelum run**, termasuk kelas minoritas dan
  false rejection; tanpa angka SLO/margin disetujui tidak ada keputusan pemenang.
- **BENCH-AC5**: bila hasil tidak comparable/inconclusive, baseline dipertahankan;
  sign-off eksperimen tidak mengotorisasi deployment, flood-loss atau insurance use.

Hasil saat ini: hanya architecture inspection dan file identity existing. Semua
kolom candidate latency/RSS/accuracy/F1 baru adalah **NOT_MEASURED**, bukan nol.
