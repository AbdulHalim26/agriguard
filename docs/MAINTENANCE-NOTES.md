# Catatan Maintenance Final — AgriGuard

## Tahap dan batas eksekusi

- Task 1: pipeline training saja; training penuh dilakukan pemilik proyek di Colab.
- Setelah serah terima Task 1, berhenti menunggu konfirmasi sebelum Task 2–4.
- Setiap task memakai commit tersendiri dan ringkasan file/cara verifikasi.

## Keputusan yang disetujui

1. **Label v2:** tiga tingkat kerusakan visual dengan nama netral, mapping
   eksplisit ke `aman/rusak_ringan/rusak_berat`; delapan label penyakit v1 tetap
   sebagai fallback. Manifest/checkpoint/metrik/metadata ekspor memuat
   `label_schema: v2_3label`; data v1 nantinya memakai `v1_8label`.
2. **Pendukung penyakit:** atribusi URL/lisensi dan `composition` per sumber/per
   label wajib ada. Nama penyakit tidak otomatis menjadi severity banjir.
3. **Akun demo, Task 4:** hanya profil akun existing melalui seed idempotent;
   tidak membuat/mengubah Auth, role, password, atau OTP.
4. **Preset lokasi, Task 4:** hanya nonproduksi; produksi menyembunyikannya
   meskipun flag salah disetel.

## Task 1 — Implementasi dan penanganan ambiguitas

File: `ai-service/training/{common,prepare_dataset,train,evaluate,export_onnx}.py`,
`requirements.txt`, `sources.example.json`, `test_pipeline.py`, dan panduan
`README.md`. Output data/checkpoint diabaikan Git melalui `.gitignore`.

- Belum ditemukan dataset publik terverifikasi yang langsung memiliki tiga
  label kerusakan banjir padi. Katalog Roboflow/Kaggle dicatat sebagai kandidat,
  nonaktif secara default, bukan klaim data yang sudah terkumpul.
- Roboflow Wet Rice hanya `Wet`; Rice Crop Damage berlabel segmentation dan
  belum punya dataset version saat diperiksa; Kaggle yang diverifikasi adalah
  penyakit daun. Review kesesuaian konteks, anotasi severity, dan ID kelompok
  wajib dilakukan sebelum training. URL ekspor rahasia hanya dari environment.
- CSV review mencatat label asal dan label v2. Data pendukung penyakit hanya
  train. Holdout val/test menggunakan data utama banjir/genangan padi.
- Deduplikasi pixel/JPEG identik dan penggabungan kelompok mencegah duplikat
  persis melintasi split. Near-duplicate/sesi lahan tetap perlu grouping manusia.
  Satu video/kejadian tidak dipecah untuk memenuhi target rasio.
- Pretrained backbone memakai torchvision EfficientNet-B0 ImageNet, bukan
  mengubah checkpoint HF v1. Referensi bobot dan versi lingkungan direkam;
  preprocessing ekspor tetap RGB 224×224 BICUBIC + mean/std runtime.
- Pada tiga label v2 mapping ke status 1:1, sehingga akurasi kelas/status sama;
  hasil delapan label v1 memiliki makna evaluasi berbeda.
- `damage_pct` mempertahankan rumus/rentang API v1. Perbedaannya adalah dasar
  status: penyakit yang dipetakan (v1) vs tingkat kerusakan visual langsung (v2).
  Nilai ini bukan persen kerusakan terukur/kehilangan hasil; metadata menandai
  belum terkalibrasi. Helper training menguji seluruh rentang status.
- Artifact smoke ditandai `pipeline_smoke_test` dan tidak siap integrasi. Tidak
  ada angka akurasi v2 nyata sampai pemilik menjalankan training/evaluasi holdout.
- `retraining_status.json` berubah sesuai tahap nyata: dataset disiapkan,
  training, terputus/selesai, dievaluasi, ekspor terverifikasi. Task 3 tidak boleh
  menampilkan klaim training berjalan bila tahapnya baru persiapan dataset.
- Task 2 perlu mempertahankan pembacaan kontrak metadata saat memusatkan config;
  helper Task 1 membaca konstanta literal v1 tanpa memuat model runtime.

### Verifikasi Task 1

```bash
python -m unittest discover -s ai-service/training -p test_pipeline.py -v
AGRIGUARD_TRAINING_SMOKE=1 python -m unittest discover -s ai-service/training -p test_pipeline.py -v
npm run build
```

Pemeriksaan mencakup split deterministik, isolasi kelompok/video, atribusi jumlah
gambar, duplikat/konflik label, file rusak, integritas manifest/gambar, path
arsip, train-only data pendukung, metrik kelas/status, dan estimasi damage.
Smoke ML menguji checkpoint setiap epoch, head/backbone, resume state yang sama,
evaluasi, serta logits ONNX terhadap PyTorch. Uji yang dilakukan di CPU lokal
tidak diklaim sebagai uji training penuh di GPU Colab.

Hasil pemeriksaan 23 Oktober 2026:

- **15 test case lulus**, termasuk smoke EfficientNet-B0 dengan bobot ImageNet
  asli pada 54 gambar fixture, tiga epoch terbatas, dan resume state bit-identik
  di CPU. Guard anti-timpa checkpoint diuji ulang pada smoke yang sama.
- Selisih absolut logits maksimum ONNX/PyTorch **7,9125166 × 10⁻⁶**;
  memenuhi `atol=1e-5`, `rtol=1e-4` pada lima kasus (batch acak 1/2 dan tiga
  tensor validation). Ini hasil kesetaraan implementasi, bukan akurasi model.
- Empat entry point `--help` berjalan dan `pip check` tidak menemukan konflik.
- `npm run build` + type-check sukses menggunakan Node **24.22.1**.
- Training penuh GPU, dataset utama berlabel review, dan metrik v2 nyata masih
  menunggu eksekusi manual pemilik di Colab.

## Ketentuan wajib untuk Task 2–4 setelah konfirmasi

- Kontrak `/predict` tetap `status`, `confidence`, `damage_pct`; HSV <**15%**
  dan confidence <**50%** tetap menolak. Durasi dicatat ke stdout tanpa mengubah
  skema respons. Default `MODEL_VERSION=v1`.
- Halaman `/tentang-model` memisahkan tiga konteks: **91,28% klaim penulis pada
  dataset penulis**; **73,8% kelas / 78,6% status evaluasi independen 42 gambar**;
  serta **evaluasi holdout v2 setelah tersedia**. Kolom konteks evaluasi wajib;
  jangan membandingkan sebagai satu test set. Atribusi/schema/komposisi dibaca
  dari data. Confusion matrix yang belum tersedia ditulis belum tersedia.
- AI aktual berada di **Render**: `https://agriguard-ai-96hh.onrender.com`.
  Task 4 mendokumentasikan UptimeRobot tiap **5 menit** ke health web dan URL
  Render, cold start Render, serta warm-up **30 menit sebelum demo**. Petunjuk
  HF Spaces tetap sebagai alternatif, bukan deployment aktual.
- Lima test case baru dan checklist regresi Task 4 dicatat dengan hasil nyata;
  kasus yang belum dijalankan tidak diberi status lulus.

Panduan menjalankan Colab dan daftar artefak serah terima:
[`ai-service/training/README.md`](../ai-service/training/README.md).
