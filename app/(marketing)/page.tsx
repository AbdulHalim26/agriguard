import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  Smartphone,
  MapPinned,
  BellRing,
  Camera,
  ImageUp,
  PackageCheck,
  Cpu,
  BadgeCheck,
  Lightbulb,
  Waves,
  WifiOff,
  ShieldCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STEPS = [
  {
    icon: Smartphone,
    title: 'Daftar dengan Nomor HP',
    description: 'Tanpa email, tanpa ribet. Verifikasi lewat OTP sekali saja.',
  },
  {
    icon: MapPinned,
    title: 'Tandai Lahan Anda',
    description: 'Gambar area sawah di peta agar peringatan benar-benar hiper-lokal.',
  },
  {
    icon: BellRing,
    title: 'Terima Peringatan Dini',
    description: 'Status hijau–kuning–merah dari curah hujan dan tinggi air di sekitar lahan.',
  },
  {
    icon: Camera,
    title: 'Foto & Laporkan',
    description: 'AI menilai tingkat kerusakan; laporan diteruskan ke PPL dan Dinas.',
  },
]

const AI_STEPS = [
  { icon: ImageUp, title: 'Unggah foto', description: 'Ambil foto daun atau sawah langsung dari kamera.' },
  { icon: PackageCheck, title: 'Kompres di perangkat', description: 'Foto diperkecil agar hemat kuota, tetap bisa offline.' },
  { icon: Cpu, title: 'Analisis model AI', description: 'Model EfficientNet-B0 memproses gambar di server.' },
  { icon: BadgeCheck, title: 'Klasifikasi kerusakan', description: 'Hasil: Aman, Rusak Ringan, atau Rusak Berat + confidence.' },
  { icon: Lightbulb, title: 'Rekomendasi tindakan', description: 'Langkah penanganan yang disesuaikan dengan tingkat kerusakan.' },
]

const TRUST = [
  { icon: Waves, label: 'Peringatan banjir hiper-lokal' },
  { icon: WifiOff, label: 'Bekerja tanpa sinyal' },
  { icon: ShieldCheck, label: 'Verifikasi PPL & Dinas' },
]

export default async function BerandaPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    if (profile?.full_name) {
      redirect('/dashboard')
    } else {
      redirect('/onboarding')
    }
  }

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/ilustrations/hero-rice.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f3d13]/95 via-[#1B5E20]/85 to-[#2E7D32]/40" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-28 text-white">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-green-50 text-xs font-semibold mb-4 backdrop-blur">
              Peringatan dini banjir untuk sawah Anda
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Lindungi sawah dari banjir,{' '}
              <span className="text-green-300">sebelum air datang.</span>
            </h1>
            <p className="text-green-50/90 text-base sm:text-lg mb-8">
              AgriGuard memadukan prakiraan cuaca, pantauan tinggi air, dan deteksi kerusakan
              dengan AI — siap dipakai petani, PPL, maupun Dinas Pertanian, bahkan tanpa sinyal.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-white text-[#1B5E20] font-semibold rounded-xl hover:bg-green-50 transition-colors"
              >
                Daftar / Masuk
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link
                href="/fitur"
                className="inline-flex items-center justify-center min-h-[52px] px-6 py-3 border border-white/40 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
              >
                Lihat Fitur
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Mulai dalam 4 langkah</h2>
        <p className="text-gray-600 mb-8">Dari daftar sampai laporan pertama, semuanya sederhana.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {STEPS.map((s, i) => (
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
          <p className="text-gray-600 mb-8">
            Dari foto yang Anda kirim sampai rekomendasi tindakan, hanya dalam hitungan detik.
          </p>
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

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#2E7D32] text-white rounded-2xl px-6 py-6">
          {TRUST.map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <t.icon size={22} className="text-green-200" aria-hidden="true" />
              <span className="text-sm font-medium">{t.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
