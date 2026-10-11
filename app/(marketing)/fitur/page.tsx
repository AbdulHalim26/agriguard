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

const NAVY = 'text-[#0B2545]'

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
    <div className="bg-[#F8F9FA]">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-10 sm:pb-14">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_18px_50px_-24px_rgba(11,37,69,0.28)] p-6 sm:p-10 lg:p-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-[#2E7D32] text-xs font-semibold mb-4">
                <Sparkles size={13} aria-hidden="true" /> Fitur Unggulan
              </span>
              <h1 className={`text-3xl sm:text-4xl font-bold leading-tight mb-4 ${NAVY}`}>
                Satu aplikasi untuk menjaga lahan padi Anda.
              </h1>
              <p className="text-base sm:text-lg text-[#2E7D32]">
                Dirancang untuk dipakai di sawah — sederhana, cepat, dan tetap andal saat sinyal hilang.
              </p>
            </div>
            <div className="relative h-64 sm:h-72 lg:h-80 organic-photo-fitur shadow-lg">
              <Image
                src="/ilustrations/hero-feature.jpg"
                alt="Fitur AgriGuard"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-7 shadow-[0_12px_30px_-20px_rgba(11,37,69,0.35)]"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                <f.icon size={24} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h2 className={`text-lg font-semibold mb-2 ${NAVY}`}>{f.title}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <div className="soft-green-panel rounded-3xl px-6 py-10 sm:px-10 sm:py-14 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white text-[#2E7D32] text-xs font-semibold mb-4">
              <Sparkles size={14} aria-hidden="true" /> Ditenagai AI
            </span>
            <h2 className={`text-2xl sm:text-3xl font-bold mb-4 ${NAVY}`}>
              Analisis Lebih Cerdas dengan AI
            </h2>
            <p className="text-gray-600 mb-6">
              Model computer vision memeriksa foto sawah Anda dan memberi penilaian yang konsisten —
              mempercepat keputusan tanpa menggantikan peran PPL dan Dinas.
            </p>
            <ul className="space-y-3">
              {AI_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-gray-700">
                  <Check size={18} className="text-[#2E7D32] mt-0.5 shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Camera size={20} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <div>
                <p className={`font-semibold ${NAVY}`}>Contoh Hasil</p>
                <p className="text-xs text-gray-500">Pratinjau antarmuka</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#F8F9FA] rounded-xl px-4 py-3">
                <span className="text-sm text-gray-600">Tingkat kerusakan</span>
                <span className="text-sm font-semibold text-[#ED6C02]">Rusak Ringan</span>
              </div>
              <div className="flex items-center justify-between bg-[#F8F9FA] rounded-xl px-4 py-3">
                <span className="text-sm text-gray-600">Keyakinan model</span>
                <span className={`text-sm font-semibold ${NAVY}`}>92%</span>
              </div>
              <div className="flex items-center justify-between bg-[#F8F9FA] rounded-xl px-4 py-3">
                <span className="text-sm text-gray-600">Rekomendasi</span>
                <span className="text-sm font-semibold text-[#2E7D32]">Pantau &amp; atur drainase</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">Angka ilustratif. Nilai aktual mengikuti hasil model.</p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 text-center">
        <h2 className={`text-2xl font-bold mb-3 ${NAVY}`}>Siap melindungi sawah Anda?</h2>
        <p className="text-gray-600 mb-6">Daftar gratis dan mulai terima peringatan dini hari ini.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 text-white font-semibold rounded-xl brand-gradient transition-colors"
        >
          Daftar / Masuk
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
