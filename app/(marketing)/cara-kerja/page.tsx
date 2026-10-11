import Link from 'next/link'
import {
  Smartphone,
  MapPinned,
  BellRing,
  Camera,
  ImageUp,
  PackageCheck,
  Cpu,
  BadgeCheck,
  Lightbulb,
  Users,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'

export const metadata = {
  title: 'Cara Kerja — AgriGuard',
  description: 'Bagaimana AgriGuard bekerja: dari pendaftaran, peringatan dini banjir, hingga analisis kerusakan dengan AI.',
}

const PETANI_STEPS = [
  {
    icon: Smartphone,
    title: 'Daftar dengan nomor HP',
    description: 'Verifikasi OTP sekali. Tidak butuh email.',
  },
  {
    icon: MapPinned,
    title: 'Tandai lahan di peta',
    description: 'Gambar batas sawah agar peringatan benar-benar hiper-lokal.',
  },
  {
    icon: BellRing,
    title: 'Terima peringatan dini',
    description: 'Status banjir hijau–kuning–merah muncul di dasbor Anda.',
  },
  {
    icon: Camera,
    title: 'Foto & laporkan kerusakan',
    description: 'AI memberi penilaian; laporan diteruskan ke PPL dan Dinas.',
  },
]

const AI_STEPS = [
  { icon: ImageUp, title: 'Unggah foto', description: 'Foto daun atau sawah diambil langsung dari kamera.' },
  { icon: PackageCheck, title: 'Kompres di perangkat', description: 'Ukuran foto diperkecil agar hemat kuota; aman saat offline.' },
  { icon: Cpu, title: 'Analisis model AI', description: 'Model EfficientNet-B0 memproses gambar di server.' },
  { icon: BadgeCheck, title: 'Klasifikasi kerusakan', description: 'Hasil: Aman, Rusak Ringan, atau Rusak Berat, plus confidence.' },
  { icon: Lightbulb, title: 'Rekomendasi tindakan', description: 'Langkah penanganan menyesuaikan tingkat kerusakan.' },
]

export default function CaraKerjaPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-8">
        <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-[#2E7D32] text-xs font-semibold mb-4">
          Cara Kerja
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-3 max-w-3xl">
          Dari tanda bahaya sampai tindakan, semua terhubung.
        </h1>
        <p className="text-gray-600 text-base sm:text-lg max-w-2xl">
          AgriGuard menyatukan data cuaca, pemantauan tinggi air, dan analisis foto dalam satu alur
          yang mudah dipahami petani maupun petugas.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-8">Alur untuk Petani</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {PETANI_STEPS.map((s, i) => (
            <div key={s.title} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                  <s.icon size={22} className="text-[#2E7D32]" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold text-gray-300">LANGKAH {i + 1}</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1.5">{s.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Proses AI dalam 5 langkah
          </h2>
          <p className="text-gray-600 mb-8">Transparan, cepat, dan tetap dalam kendali manusia.</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
            {AI_STEPS.map((s, i) => (
              <li key={s.title} className="relative bg-[#F8F9FA] rounded-2xl border border-gray-200 p-5">
                <span className="absolute -top-3 -left-2 w-8 h-8 rounded-full bg-[#2E7D32] text-white text-sm font-bold flex items-center justify-center shadow">
                  {i + 1}
                </span>
                <s.icon size={22} className="text-[#2E7D32] mb-3" aria-hidden="true" />
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{s.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{s.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid gap-6 sm:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
            <Users size={24} className="text-[#2E7D32]" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Untuk PPL &amp; Dinas</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Petugas meninjau laporan petani, memberi catatan verifikasi, dan melihat rekap luas
            terdampak per wilayah melalui dasbor admin.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
            <ShieldCheck size={24} className="text-[#2E7D32]" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Hasil AI tetap diverifikasi</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Skor AI adalah alat bantu, bukan keputusan akhir. PPL dan Dinas dapat memvalidasi atau
            mengoreksi sebelum data dipakai untuk tindak lanjut.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 text-center">
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-[#2E7D32] text-white font-semibold rounded-xl hover:bg-[#276b2a] transition-colors"
        >
          Mulai sekarang
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </>
  )
}
