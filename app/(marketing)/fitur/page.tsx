import Link from 'next/link'
import Image from 'next/image'
import {
  Waves,
  Camera,
  WifiOff,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Check,
} from 'lucide-react'

export const metadata = {
  title: 'Fitur — AgriGuard',
  description: 'Fitur AgriGuard: peringatan dini banjir, deteksi kerusakan AI, mode offline, dan verifikasi PPL/Dinas.',
}

const FEATURES = [
  {
    icon: Waves,
    title: 'Peringatan Dini Banjir',
    description:
      'Status hijau–kuning–merah dari data curah hujan dan tinggi air secara hiper-lokal untuk sawah Anda.',
  },
  {
    icon: Camera,
    title: 'Deteksi Kerusakan AI',
    description:
      'Cukup foto sawah — AI menilai tingkat kerusakan dan membantu menentukan langkah penanganan.',
  },
  {
    icon: WifiOff,
    title: 'Bekerja Tanpa Sinyal',
    description:
      'Laporan tersimpan di perangkat saat offline dan otomatis tersinkron begitu kembali online.',
  },
  {
    icon: ShieldCheck,
    title: 'Verifikasi PPL & Dinas',
    description:
      'PPL dan Dinas meninjau laporan petani, memberi catatan, dan merekap luas terdampak per wilayah.',
  },
]

const AI_POINTS = [
  'Klasifikasi otomatis: Aman, Rusak Ringan, Rusak Berat',
  'Skor keyakinan (confidence) dan persentase kerusakan',
  'Rekomendasi tindakan sesuai tingkat keparahan',
  'Hasil dapat diverifikasi dan dikoreksi oleh PPL/Dinas',
]

export default function FiturPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/ilustrations/hero-feature.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f3d13]/95 via-[#1B5E20]/85 to-[#2E7D32]/40" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-24 text-white">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-green-50 text-xs font-semibold mb-4 backdrop-blur">
              Fitur Unggulan
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Semua yang petani butuhkan, dalam satu aplikasi.
            </h1>
            <p className="text-green-50/90 text-base sm:text-lg">
              Dirancang untuk dipakai di sawah — sederhana, cepat, dan tetap andal saat sinyal hilang.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-7">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                <f.icon size={24} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#1B5E20] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-green-50 text-xs font-semibold mb-4">
              <Sparkles size={14} aria-hidden="true" /> Ditenagai AI
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Analisis Lebih Cerdas dengan AI
            </h2>
            <p className="text-green-50/90 mb-6">
              Model computer vision memeriksa foto sawah Anda dan memberi penilaian yang konsisten —
              mempercepat keputusan tanpa menggantikan peran PPL dan Dinas.
            </p>
            <ul className="space-y-3">
              {AI_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-green-50">
                  <Check size={18} className="text-green-300 mt-0.5 shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-2xl p-6 backdrop-blur">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-300/20 flex items-center justify-center">
                <Camera size={20} className="text-green-200" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold">Contoh Hasil</p>
                <p className="text-xs text-green-100/80">Pratinjau antarmuka</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Tingkat kerusakan</span>
                <span className="text-sm font-semibold text-green-200">Rusak Ringan</span>
              </div>
              <div className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Keyakinan model</span>
                <span className="text-sm font-semibold">92%</span>
              </div>
              <div className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Rekomendasi</span>
                <span className="text-sm font-semibold text-green-200">Pantau &amp; atur drainase</span>
              </div>
            </div>
            <p className="text-xs text-green-100/70 mt-4">
              Angka ilustratif. Nilai aktual mengikuti hasil model.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Siap melindungi sawah Anda?</h2>
        <p className="text-gray-600 mb-6">Daftar gratis dan mulai terima peringatan dini hari ini.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-[#2E7D32] text-white font-semibold rounded-xl hover:bg-[#276b2a] transition-colors"
        >
          Daftar / Masuk
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </>
  )
}
