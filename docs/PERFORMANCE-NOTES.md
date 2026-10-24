# Audit performa web menjelang demo

## Pengukuran

- Baseline: `7b6c95a`, sebelum misi optimasi web.
- Sesudah perubahan aplikasi: `dd6219e` (Item 1–4).
- Perintah: `npm run build`, Next.js **15.5.28**, Node lokal **26.8.1**.
  Kedua pengukuran memakai lingkungan dan dependensi yang sama.
- Angka di bawah adalah **First Load JS** yang dicetak Next.js, dalam kB dan
  sudah dibulatkan. Ini bukan pengukuran waktu navigasi, transfer foto, atau
  waktu inferensi AI.
- Build dan type-check lulus. Pesan `DYNAMIC_SERVER_USAGE` pada dashboard/lahan
  merupakan proses penentuan route dinamis; hasil build tetap sukses.

| Route | Sebelum | Sesudah |
|---|---:|---:|
| `/` | 112 | 112 |
| `/_not-found` | 104 | 104 |
| `/api/ai/analyze` | 104 | 104 |
| `/api/lahan` | 104 | 104 |
| `/api/lahan/[id]` | 104 | 104 |
| `/api/sync` | 104 | 104 |
| `/api/water-levels` | 104 | 104 |
| `/api/weather` | 104 | 104 |
| `/audit` | 107 | 107 |
| `/cara-kerja` | 107 | 107 |
| `/daftar` | 195 | 195 |
| `/dashboard` | 119 | 119 |
| `/fitur` | 112 | 112 |
| `/icon.png` | 0 | 0 |
| `/lahan` | 108 | 108 |
| `/laporan` | 197 | 197 |
| `/login` | 195 | 195 |
| `/notifikasi` | 197 | 197 |
| `/onboarding` | 176 | 176 |
| `/peta` | 108 | 108 |
| `/scan` | 191 | 192 |
| `/settings` | 182 | 182 |
| `/tentang` | 112 | 112 |
| `/verifikasi` | 129 | 129 |
| **Shared JS seluruh route** | **103** | **103** |

Penambahan `/scan` sekitar **1 kB** berasal dari indikator progres, pembatalan,
validasi respons, dan retry. Fokus hasil misi adalah loading yang terlihat lebih
cepat, pemrosesan foto yang konsisten, serta batas waktu scan yang jelas.

## Hasil per item

1. **Foto:** baseline sudah memakai satu blob kompresi untuk analisis, Storage,
   dan antrean offline. Sekarang JPEG quality **0.85**, sisi terpanjang **1280 px**,
   orientasi EXIF diterapkan saat decode, dan bitmap/object URL dibersihkan.
   Ukuran hasil bergantung pada isi foto dan kualitas JPEG.
2. **Navigasi:** `loading.tsx` untuk dashboard, lahan, scan, dan laporan memakai
   skeleton ringan dengan tema hijau, label pembaca layar, dan reduced-motion.
3. **Peta:** ketiga peta sudah memakai `next/dynamic` dengan `ssr: false`.
   Placeholder diganti skeleton berukuran sesuai peta agar ruang layout tersedia.
4. **Scan:** deadline klien **90 detik**, proxy ke AI khusus scan **85 detik**,
   `maxDuration=90`. Progres berbasis waktu: unggah → analisis → hampir selesai;
   bukan persentase progres server. Coba Lagi memakai blob yang sama. Pesan AI
   yang tampil ramah; respons 422 tetap menawarkan ambil ulang foto. Default
   timeout pemanggil analisis lain tetap 15 detik.
5. **Bundle:** audit import sumber dan manifest hasil build dilakukan tanpa
   perubahan dependency atau struktur folder. Tidak ditemukan library chart,
   map, atau gambar global yang hanya diperlukan satu-dua halaman dan perlu
   dipindahkan lagi ke dynamic import.

## Bukti pemisahan bundle peta

Sumber audit: `.next/react-loadable-manifest.json`,
`.next/app-build-manifest.json`, dan `.next/build-manifest.json`.
Seluruh file JS dinamis berikut tidak beririsan dengan initial chunk root
atau layout aplikasi:

| Modul dinamis | File JS deferred | Total gzip JS deferred (kB) |
|---|---:|---:|
| `LahanFormClient → LahanForm` | 3 | 49.09 |
| `PetaPage → PetaMap` | 3 | 47.64 |
| `ScanPage → ScanMap` | 2 | 45.22 |

Angka deferred mencakup chunk bersama Leaflet sehingga tidak dijumlahkan sebagai
penghematan antarhalaman. `next/image` juga dipakai untuk branding/layout dan
halaman marketing, bukan library berat khusus satu halaman.

## Verifikasi

- **9 kasus Chrome headless:** resize, JPEG 0.85, orientasi EXIF normal/mirror/
  rotasi, decoder bitmap dan fallback `<img>`, gambar kecil, serta cleanup saat
  gambar tidak valid.
- **11 pemeriksaan perilaku:** deadline/progres, reuse blob dan idempotency key,
  offline, error ramah/422, respons tidak valid, pembatalan/stale response,
  timeout proxy dan pembacaan body respons.
- **11 HTTP smoke check produksi:** lima halaman publik 200, lima route aplikasi
  tanpa sesi mengarah ke login (307), dan API analisis tanpa sesi 401.
- Deployment kode `dd6219e` terkonfirmasi **Ready** di Vercel; runtime produksi
  **Node.js 24.x**. Project memakai **Fluid Compute** dan default region **sin1**.

Foto, hasil scan, penyimpanan laporan, dan verifikasi akun demo yang sudah login
tetap perlu dicoba langsung dari perangkat demo sebagai uji end-to-end lapangan.
