import Link from 'next/link'
import Image from 'next/image'
import { Target, Sprout, HandHeart, Users, ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Tentang — AgriGuard',
  description: 'AgriGuard membantu petani, PPL, dan Dinas Pertanian melindungi sawah dari banjir dan kerusakan.',
}

const NAVY = 'text-[#0B2545]'

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
    <div className="bg-[#F8F9FA]">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-10 sm:pb-14">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_18px_50px_-24px_rgba(11,37,69,0.28)] p-6 sm:p-10 lg:p-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-[#2E7D32] text-xs font-semibold mb-4">
                Tentang Kami
              </span>
              <h1 className={`text-3xl sm:text-4xl font-bold leading-tight mb-4 ${NAVY}`}>
                Menjaga sawah, menjaga masa depan pangan.
              </h1>
              <p className="text-base sm:text-lg text-[#2E7D32]">
                AgriGuard hadir untuk memberi petani waktu lebih banyak sebelum air datang — dan
                keputusan yang lebih tepat saat kerusakan terjadi.
              </p>
            </div>
            <div className="relative h-64 sm:h-72 lg:h-80 organic-photo-fitur shadow-lg">
              <Image
                src="/ilustrations/hero-tentang.jpg"
                alt="Petani di sawah"
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
        <h2 className={`text-xl sm:text-2xl font-bold mb-8 ${NAVY}`}>Mengapa AgriGuard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {WHY.map((w) => (
            <div
              key={w.title}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_-20px_rgba(11,37,69,0.35)]"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                <w.icon size={24} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${NAVY}`}>{w.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{w.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <div className="soft-green-panel rounded-3xl px-6 py-12 sm:px-10 sm:py-16 text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-white text-[#2E7D32] text-xs font-semibold mb-4">
            Misi Kami
          </span>
          <p className={`text-xl sm:text-2xl font-semibold leading-relaxed max-w-3xl mx-auto ${NAVY}`}>
            Membuat peringatan dini dan penilaian kerusakan sawah yang akurat dapat diakses oleh
            setiap petani, bukan hanya yang berada di kota.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <h2 className={`text-xl sm:text-2xl font-bold mb-8 ${NAVY}`}>
          Dibangun untuk Petani &amp; PPL/Dinas
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_-20px_rgba(11,37,69,0.35)]">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mb-4">
              <Sprout size={24} className="text-[#2E7D32]" aria-hidden="true" />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${NAVY}`}>Petani</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Dapatkan peringatan dini banjir untuk lahan Anda, laporkan kerusakan dengan foto, dan
              terima rekomendasi tindakan yang jelas.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_-20px_rgba(11,37,69,0.35)]">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mb-4">
              <Users size={24} className="text-[#2E7D32]" aria-hidden="true" />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${NAVY}`}>PPL &amp; Dinas</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Verifikasi laporan, beri catatan, dan pantau rekap luas terdampak per wilayah untuk
              respons yang lebih cepat.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="brand-gradient rounded-3xl px-6 py-12 sm:px-10 sm:py-16 text-center text-white">
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
    </div>
  )
}
