import Link from 'next/link'
import Image from 'next/image'
import { Target, Sprout, HandHeart, Users, ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Tentang — AgriGuard',
  description: 'AgriGuard membantu petani, PPL, dan Dinas Pertanian melindungi sawah dari banjir dan kerusakan.',
}

const WHY = [
  {
    icon: Target,
    title: 'Hiper-lokal',
    description:
      'Peringatan disusun dari data di sekitar lahan Anda, bukan ramalan wilayah yang terlalu luas.',
  },
  {
    icon: Sprout,
    title: 'Ramah petani',
    description:
      'Tanpa email, tanpa istilah rumit. Fokus pada tindakan yang bisa langsung dilakukan di sawah.',
  },
  {
    icon: HandHeart,
    title: 'Tetap andal',
    description:
      'Dirancang untuk kondisi lapangan: sinyal terbatas, perangkat sederhana, dan cuaca tak menentu.',
  },
]

export default function TentangPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/ilustrations/hero-tentang.jpg"
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
              Tentang Kami
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Menjaga sawah, menjaga pangan.
            </h1>
            <p className="text-green-50/90 text-base sm:text-lg">
              AgriGuard hadir untuk memberi petani waktu lebih banyak sebelum air datang — dan
              keputusan yang lebih tepat saat kerusakan terjadi.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-8">Mengapa AgriGuard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {WHY.map((w) => (
            <div key={w.title} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                <w.icon size={24} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{w.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{w.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-[#2E7D32] text-xs font-semibold mb-4">
            Misi
          </span>
          <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed">
            Membuat peringatan dini dan penilaian kerusakan sawah yang akurat dapat diakses oleh
            setiap petani, bukan hanya yang berada di kota.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-8">
          Dibangun untuk Petani &amp; PPL/Dinas
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <Sprout size={24} className="text-[#2E7D32]" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Petani</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Dapatkan peringatan dini banjir untuk lahan Anda, laporkan kerusakan dengan foto, dan
              terima rekomendasi tindakan yang jelas.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <Users size={24} className="text-[#2E7D32]" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">PPL &amp; Dinas</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Verifikasi laporan, beri catatan, dan pantau rekap luas terdampak per wilayah untuk
              respons yang lebih cepat.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#2E7D32] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <ShieldCheck size={36} className="text-green-200 mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Mulai bersama AgriGuard</h2>
          <p className="text-green-50/90 mb-6">
            Lindungi sawah Anda dari banjir dan kerusakan, mulai hari ini.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-white text-[#1B5E20] font-semibold rounded-xl hover:bg-green-50 transition-colors"
          >
            Daftar / Masuk
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  )
}
