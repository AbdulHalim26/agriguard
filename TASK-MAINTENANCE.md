# PROMPT 2 v2 — OPENCODE (Maintenance Final: Model AI v2 + Demo-Readiness)

Revisi dari prompt v1 setelah bedah respons Gemini + verifikasi fakta. Perubahan utama:
- Tambahan log latensi inferensi (untuk angka pitch).
- TASK 3 wajib pakai angka HSV 15% (bukan 25%) + confusion matrix.
- TASK 4 seed demo spesifik (Rengasdengklok/Tempuran/Cilamaya Wetan, Pak Mamat) + NEXT_PUBLIC_DEMO_MODE.
- FORBIDDEN LIST eksplisit: MSW mock server, OTP bypass whitelist, fitur baru, sentuh auth.

---

Kamu adalah maintainer repo AgriGuard. Baca dulu PRD.md, ai-service/main.py, ai-service/predict.py, lib/ai.ts, dan docs/DEPLOY.md sebelum mengubah apa pun.

KONTEKS: Kami lolos final ICONFEST 2026 (presentasi 26 Okt). Catatan juri penyisihan yang harus dijawab: "model AI perlu dilatih ulang menggunakan dataset spesifik banjir untuk meningkatkan akurasi dan keandalan sistem." Misi repo ini: model v2 terlatih dataset banjir + halaman transparansi metrik + demo live 100% siap tempur. Sisa waktu sangat pendek — kerjakan presisi, tanpa scope creep.

ATURAN MAIN (WAJIB):
- Jangan ubah kontrak API /predict (skema respons persis seperti sekarang).
- Jangan sentuh migrations, RLS, auth, atau alur OTP (OTP mock 123456 TIDAK diubah — itu memang mode demo).
- DILARANG menambahkan library mocking (MSW atau sejenisnya), dilarang bikin fitur baru di luar task ini, dilarang refactor di luar scope.
- Commit kecil per task, pesan commit jelas. Kalau ambigu, pilih opsi paling kecil risiko dan catat di docs/MAINTENANCE-NOTES.md.

TASK 1 — Pipeline training v2 (script saja, training dijalankan manual di Colab):
Buat folder ai-service/training berisi:
- prepare_dataset.py: util unduh/normalisasi dataset publik spesifik banjir padi (sarankan sumber konkret: Roboflow Universe & Kaggle, kata kunci "rice flood damage", "paddy flood", "rice crop disease"; output struktur folder per kelas + split train/val/test + laporan distribusi kelas).
- train.py: fine-tune EfficientNet-B0 (timbang class imbalance, augmentasi realistis: blur air, refleksi air, kemiringan kamera, cahaya lapangan), checkpoint tiap epoch.
- evaluate.py: akurasi kelas, akurasi status (mapping LABEL_TO_STATUS sama seperti predict.py), confusion matrix, contoh salah klasifikasi; tulis hasil ke metrics.json.
- export_onnx.py: ekspor ONNX + verifikasi output logit identik dengan PyTorch (toleransi kecil).
Semua script jalan di Google Colab GPU gratis tanpa dependensi eksotis, konstanta konfigurasi di bagian atas file.

TASK 2 — Integrasi model v2 + telemetri latensi:
- Slot model baru: ai-service/model/model_v2.onnx (model lama tetap ada sebagai fallback).
- /model-info: tambahkan version, trained_on, metrics (dari metrics.json). /predict TIDAK berubah sama sekali.
- Tambahkan LOG durasi inferensi (ms) ke stdout server setiap /predict — JANGAN ubah skema respons. Angka ini yang akan kami kutip di pitch, jadi format lognya konsisten: [AI] predict OK status=... conf=... dur=XXXms.
- Gerbang vegetasi HSV (rasio hijau <15% → HTTP 422) dan ambang confidence tetap aktif; kalau belum, pindahkan nilai threshold ke config terpusat (satu tempat, bukan hardcode tersebar).
- main.py bisa memilih model via env MODEL_VERSION=v1|v2, default aman (v1).

TASK 3 — Halaman transparansi /tentang-model (publik, tanpa login, untuk juri):
- Tabel perbandingan v1 vs v2: akurasi kelas, akurasi status, ukuran dataset, sumber data + confusion matrix dirender sebagai tabel sederhana dari metrics.json.
- Section "Gerbang Validasi": jelaskan HSV rasio hijau <15% → 422 (PAKAI ANGKA 15%, konsisten dengan laporan penyisihan — jangan angka lain) + ambang confidence.
- Diagram alur data flywheel: laporan petani → verifikasi PPL → ground truth → retraining.
- Section "Keterbatasan" jujur + roadmap (v3 multispektral, on-device TFLite/WebGL sebagai RENCANA — ditulis sebagai rencana, bukan klaim fitur).
- Link dari halaman Tentang dan dari halaman hasil scan ("Bagaimana model ini bekerja?"). Gaya shadcn/ui konsisten dengan halaman lain, mobile-first.

TASK 4 — Demo-readiness:
- Seed data demo: 3 poligon lahan Karawang (Kec. Rengasdengklok, Tempuran, Cilamaya Wetan — koordinat nyata DI DALAM polygon), akun petani "Pak Mamat – Kelompok Tani Subur", 1 akun PPL, 1 akun dinas, + 8–10 histori laporan status campuran (pending/terverifikasi/ditolak) agar dashboard dan peta tidak kosong. Nama fiktif, foto dari public/.
- Env NEXT_PUBLIC_DEMO_MODE=true (default false): menampilkan pemilih koordinat preset (3 titik dari poligon seed) di alur ambil lokasi — untuk demo indoor saat GPS gagal. Wajib tidak muncul sama sekali di produksi.
- Pastikan /api/health (web) dan /health (Spaces) hidup; dokumentasikan di docs/DEPLOY.md: setup UptimeRobot ping tiap 5 menit ke kedua URL + langkah "warm-up Spaces 30 menit sebelum demo".
- Tambahkan 5 test case baru di docs/QA-REPORT.md: /tentang-model, /model-info v2, MODEL_VERSION env, DEMO_MODE off di produksi, log latensi muncul.
- Regression checklist manual di docs/MAINTENANCE-NOTES.md: offline submit → sync, dedupe foto, geofence tolak di luar polygon, verifikasi PPL/dinas, scan foto non-sawah → 422, scan foto manusia → 422.

URUTAN EKSEKUSI: buat script TASK 1 dulu (cepat), lalu TASK 2 → TASK 3 → TASK 4 sementara training Colab berjalan paralel dijalankan saya manual. Setiap task selesai: ringkas apa yang berubah + file mana + cara saya verifikasi.

FALLBACK: kalau metrics.json v2 belum ada saat deploy, /tentang-model tetap tayang dengan metrik v1 yang jujur + banner "Retraining v2 berjalan — dataset N gambar terkumpul dari X sumber" (baca dari file status) + roadmap. Jangan pernah tampilkan angka palsu.
