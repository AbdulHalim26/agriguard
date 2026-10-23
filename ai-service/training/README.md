# Training AgriGuard v2 — Colab manual

Pipeline Task 1 untuk fine-tune EfficientNet-B0 dan menyiapkan artefak v2.
Training penuh dijalankan manual di **Google Colab GPU**. Perintah di bawah
dijalankan dari root clone repo. Dependensi training terpisah dari runtime AI.

## Label dan batas klaim

`label_schema = v2_3label`, dengan urutan output ONNX berikut:

| Indeks | Label visual netral | Status API | Pedoman anotasi |
|---|---|---|---|
| 0 | `tanpa_kerusakan_terlihat` | `aman` | Tidak tampak kerusakan pada bagian padi yang terlihat; bukan jaminan tanaman sehat atau bebas banjir. |
| 1 | `kerusakan_ringan_terlihat` | `rusak_ringan` | Kerusakan visual terbatas, masih tampak bagian tanaman utuh; perlu konteks dan review penilai. |
| 2 | `kerusakan_berat_terlihat` | `rusak_berat` | Kerusakan visual luas/berat menurut review penilai; bukan pengukuran persen kehilangan hasil. |

Label menunjukkan **tingkat kerusakan visual**. Konteks genangan/banjir dicatat
pada sumber utama, bukan disimpulkan dari nama penyakit, keberadaan air saja,
atau augmentasi. Foto yang tidak cukup jelas sebaiknya dikeluarkan dari dataset
berlabel, bukan dipaksakan ke salah satu kelas.

Mapping delapan penyakit v1 (`v1_8label`) tetap menjadi kontrak fallback runtime.
Dataset penyakit hanya **data pendukung train**, bukan test set banjir. Semua
label v2, termasuk pada gambar penyakit, harus hasil review visual eksplisit.
Pemetaan v2 1:1: akurasi kelas dan status akan sama secara matematis; jangan
menampilkannya sebagai dua bukti peningkatan independen.

## Sumber konkret yang sudah diperiksa

Pemeriksaan 23 Oktober 2026; lihat `sources.example.json` untuk konfigurasi,
atribusi, lisensi, versi, dan keterbatasan masing-masing sumber.

| Kandidat | Lisensi yang ditampilkan | Informasi katalog | Kesesuaian |
|---|---|---|---|
| [Roboflow Wet Rice — no](https://universe.roboflow.com/no-85bd3/wet-rice-lvtac) | CC BY 4.0 | 1.377 gambar, satu label `Wet`, versi ekspor tersedia | Kandidat untuk ditinjau: belum terbukti sebagai tiga kelas kerusakan banjir padi; ada frame video. |
| [Roboflow Rice Crop Damage — root](https://universe.roboflow.com/root-knimz/rice-crop-damage) | CC BY 4.0 | 533 gambar, segmentation `damage/leaf`, belum ada dataset version | Kandidat pendukung setelah fork/ekspor dan review; penyebab banjir tidak dinyatakan, ada gambar augmented. |
| [Kaggle Rice Leaf Disease Images](https://www.kaggle.com/datasets/nirmalsankalana/rice-leaf-disease-image) | CC0 menurut metadata Kaggle | Deskripsi menyebut 5.932 gambar / empat penyakit, versi 1 | Pendukung saja. Pertahankan atribusi dataset asal Prabira Kumar Sethy dkk., [DOI 10.1016/j.compag.2020.105527](https://doi.org/10.1016/j.compag.2020.105527). |

Belum ditemukan sumber terverifikasi yang langsung menyediakan tiga label
kerusakan banjir padi tersebut. Karena itu semua kandidat **nonaktif** secara
default. Angka katalog bukan jumlah training; pipeline menghitung gambar unik
yang benar-benar lolos review, decode, dan deduplikasi.

Cari sumber lanjutan dengan kata kunci `rice flood damage`, `paddy flood`, dan
`rice crop disease`. Tambahkan sumber foto lahan padi tergenang yang valid ke
konfigurasi dengan URL publik dan lisensi sebenarnya. Banjir jalan/kota,
dataset CSV hasil panen, atau gambar penyakit tidak boleh dilabeli seolah-olah
merupakan dataset kerusakan banjir padi.

## 1. Siapkan Colab dan penyimpanan persisten

Pilih **Runtime → Change runtime type → GPU**. Clone versi commit Task 1:

```python
!git clone https://github.com/AbdulHalim26/agriguard.git /content/agriguard
%cd /content/agriguard
!pip install -r ai-service/training/requirements.txt

from google.colab import drive
from pathlib import Path
drive.mount('/content/drive')
WORK = Path('/content/drive/MyDrive/agriguard-v2')
WORK.mkdir(parents=True, exist_ok=True)
```

Pertahankan pasangan torch/torchvision bawaan Colab jika sudah memenuhi versi.
GPU gratis dapat terputus: simpan checkpoint ke Drive. Simpan juga dataset
hasil prepare agar identitas split tidak berubah ketika resume.

## 2. Download/inventory, lalu review anotasi

Salin `sources.example.json` ke `WORK/sources.json`, pilih sumber yang relevan
(`enabled: true`), dan isi path `local_dir` atau parameter download. Semua path
di konfigurasi relatif terhadap lokasi `sources.json`, kecuali path absolut.

- **Lokal:** ekstrak arsip sendiri ke `local_dir`; script membaca folder itu.
- **Kaggle:** `--download` menggunakan handle dan versi eksplisit. Bila perlu,
  isi `KAGGLE_USERNAME` dan `KAGGLE_KEY` dari Colab Secrets, bukan di file JSON.
- **Roboflow:** ekspor ZIP, lalu masukkan URL bertanda tangan ke env yang disebut
  `download_url_env`. URL ekspor/API key tidak disimpan ke manifest atau log.
  Pilih export **tanpa augmentasi offline** bila tersedia.
- Bila download programatis tidak tersedia, gunakan export manual + `local_dir`.

Contoh membaca secret (hanya jika memakai export Roboflow ini):

```python
import os
from google.colab import userdata
os.environ['ROBOFLOW_WET_RICE_ZIP_URL'] = userdata.get('ROBOFLOW_WET_RICE_ZIP_URL')
```

Inventory tidak mengklaim label severity atau memulai training:

```python
!python ai-service/training/prepare_dataset.py --sources "{WORK}/sources.json" --download --inventory-only --cache /content/raw-cache --output "{WORK}/inventory"
```

Edit inventory menjadi CSV hasil review; pindahkan ke path `annotations` pada
konfigurasi. Kolom wajib: `path,label,group_id`; pertahankan `original_label`
untuk audit label asal. Contoh **format**, bukan anotasi siap pakai:

```csv
path,original_label,label,group_id
train/Wet/foto1.jpg,Wet,kerusakan_ringan_terlihat,karawang-lahanA-kejadian001
```

Ketentuan penting untuk split:

- `group_id` global mengidentifikasi kejadian/lahan/sesi/video asal. Semua frame,
  crop, dan augmentasi dari satu sumber asli harus satu kelompok, termasuk jika
  gambar didistribusikan ulang melalui sumber berbeda.
- Inventory menyarankan ID dari nama video/Roboflow; **review manual tetap
  diperlukan** untuk nama arbitrer, gambar hampir sama, dan sesi lahan yang sama.
- Deduplikasi menangkap pixel RGB ternormalisasi/JPEG identik, bukan seluruh
  near-duplicate. Kelompok terkait duplikat digabung sebelum split; konflik label
  pada gambar identik menggagalkan prepare.
- Setelah selesai, set `labels_reviewed: true`, `reviewed_by` (ID tim/penilai),
  dan `review_protocol` yang menjelaskan pedoman dan konteks foto.

## 3. Normalisasi dan bekukan split

```python
!python ai-service/training/prepare_dataset.py --sources "{WORK}/sources.json" --download --cache /content/raw-cache --output "{WORK}/dataset-v2" --seed 42
```

Output: RGB JPEG tanpa EXIF, sisi maksimum 1.280 px; folder
`{train,val,test}/{label}/`; `manifest.json`, `distribution.json`, serta
`retraining_status.json`. Seed dan input sama menghasilkan identitas sama.

- Target split **70/15/15**, dikelompokkan per kejadian dan distratifikasi kelas.
  Proporsi aktual boleh berbeda karena kelompok tidak dipecah.
- Tiap kelas harus terwakili dalam ketiga split data utama. Jika tidak mungkin,
  script berhenti: tambah kelompok independen/review grouping, jangan memecah
  video demi memenuhi kuota. Sampel kecil bukan bukti generalisasi yang kuat.
- Pendukung penyakit hanya masuk train. Val/test hanya sumber `flood_paddy`.
- Folder output tidak ditimpa; pakai folder baru jika sengaja mengubah dataset.
- `manifest_sha256`, `split.id`, seed, jumlah per split, SHA setiap gambar,
  checksum anotasi, sumber, lisensi, dan komposisi sumber/label menjadi jejak audit.

## 4. Fine-tune manual

```python
!python ai-service/training/train.py --dataset "{WORK}/dataset-v2" --output "{WORK}/run-v2" --epochs 15 --batch-size 32 --device cuda
```

Default: ImageNet-pretrained torchvision EfficientNet-B0, input RGB 224×224
BICUBIC dan mean/std sesuai runtime; dua epoch pemanasan head, lalu unfreeze
backbone. Class weights dihitung **hanya dari train**. Augmentasi on-the-fly
hanya train: blur ringan, glare/refleksi lokal halus, kemiringan kamera, horizontal
flip, dan cahaya lapangan. Ini **tidak membuat label banjir baru**. Validation
memilih checkpoint; early stopping setelah lima epoch tanpa perbaikan.

Setiap epoch menghasilkan `epoch_NNN.pt` atomik (model, optimizer, scheduler,
scaler, RNG, best state, provenance), ditambah `best.pt`, `history.json`, dan
`run.json`. Versi dependensi dan referensi bobot pretrained tercatat. Test set
tidak digunakan untuk memilih epoch/threshold. Jika memori GPU tidak cukup,
mulai run baru dengan batch lebih kecil; jangan mengubah konfigurasi di tengah
resume.

Resume setelah sesi Colab terputus, memakai parameter run yang sama:

```python
!python ai-service/training/train.py --dataset "{WORK}/dataset-v2" --output "{WORK}/run-v2" --epochs 15 --batch-size 32 --device cuda --resume "{WORK}/run-v2/epoch_003.pt"
```

Gunakan checkpoint epoch terakhir yang utuh, **bukan `best.pt`**. Resume menolak
dataset/split/konfigurasi berbeda dan run yang sudah early-stop. Split dapat
direproduksi lintas mesin; bitwise training tetap bergantung hardware/software.
Run baru menolak output yang tidak kosong; resume dari epoch lama juga menolak
menimpa checkpoint yang lebih baru di folder output.

## 5. Evaluasi holdout dan ekspor ONNX

```python
!python ai-service/training/evaluate.py --dataset "{WORK}/dataset-v2" --checkpoint "{WORK}/run-v2/best.pt" --output "{WORK}/run-v2/metrics.json"
!python ai-service/training/export_onnx.py --dataset "{WORK}/dataset-v2" --checkpoint "{WORK}/run-v2/best.pt" --metrics "{WORK}/run-v2/metrics.json" --output "{WORK}/run-v2/model_v2.onnx"
```

`metrics.json` berisi:

- `label_schema`, urutan `labels`, `label_to_status`, preprocessing dan estimasi
  `damage_pct`;
- `dataset_sources`: URL, lisensi, versi, penilai, checksum anotasi, jumlah gambar
  diterima serta jumlah duplikat/file rusak yang dikeluarkan;
- `composition[source_id][label]`: jumlah gambar unik per sumber per label;
- `split`: ID, seed, strategi, target rasio, jumlah gambar/kelompok per split;
- identitas checkpoint dan manifest, konfigurasi/lingkungan training;
- `evaluation.context`, jumlah test, akurasi kelas/status, akurasi per kelas,
  confusion matrix dengan label dan orientasi, serta contoh salah klasifikasi
  pada `misclassified/`.

Evaluasi mengukur **classifier top-1 sebelum gerbang HSV/confidence**, bukan
akurasi endpoint sesudah penolakan. Export mencocokkan identitas checkpoint,
metrik, dan dataset; memeriksa model ONNX; lalu membandingkan logits FP32
PyTorch–ONNX pada batch acak 1/2 serta satu gambar validation per label.
Default `atol=1e-5`, `rtol=1e-4`. Perbedaan floating point kecil diperbolehkan,
bukan klaim bit-identik. Jika tidak lolos, file ONNX final tidak diterbitkan.

`model_v2.metadata.json` menyimpan checksum model/metrik, kontrak input/output,
dan laporan parity. `ready_for_integration` berarti kelengkapan teknis lolos;
bukan klaim akurasi yang memadai atau aktivasi model di produksi.

### Estimasi `damage_pct`

Rentang dan rumus mengikuti v1: `aman` → `(1-confidence)×15`,
`rusak_ringan` → `30+30×confidence`, `rusak_berat` → `60+35×confidence`;
dibulatkan dan dibatasi maksimum 95. Pada v1 status diturunkan dari penyakit;
pada v2 status berasal langsung dari label kerusakan visual. Keduanya merupakan
**estimasi heuristik, belum terkalibrasi terhadap persen kerusakan terukur**.
Task 2 nantinya memakai metadata label/preprocessing/rentang ini untuk jalur v2.

## Serah terima setelah training

Simpan dan serahkan:

1. `run-v2/model_v2.onnx` dan `model_v2.metadata.json`;
2. `run-v2/metrics.json`, termasuk `misclassified/` untuk audit;
3. `dataset-v2/manifest.json`, `distribution.json`, `retraining_status.json`;
4. `run-v2/run.json`, `history.json`, dan `best.pt` untuk reproduksi.

Jangan salin model ke slot runtime sampai Task 2 dikonfirmasi. Jika data utama
belum memadai, catat progres sebenarnya; **jangan membuat metrik v2 placeholder**.

## Verifikasi pipeline lokal

```bash
python -m unittest discover -s ai-service/training -p test_pipeline.py -v
AGRIGUARD_TRAINING_SMOKE=1 python -m unittest discover -s ai-service/training -p test_pipeline.py -v
```

Uji kedua menjalankan EfficientNet-B0 asli pada fixture sintetis kecil (CPU,
tiga epoch, satu batch per epoch), menguji resume, evaluasi, dan ekspor. Artefak
ditandai `purpose: pipeline_smoke_test`, `ready_for_integration: false`, disimpan
sementara dan dihapus setelah uji. **Angkanya bukan hasil training/evaluasi v2.**
Tambahkan env `AGRIGUARD_SMOKE_PRETRAINED=1` untuk menguji juga download/bobot
ImageNet asli; arahkan `TORCH_HOME` ke cache lokal yang sesuai.
