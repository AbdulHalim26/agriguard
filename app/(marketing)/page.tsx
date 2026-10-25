import { Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import {
  Leaf,
  ArrowRight,
  ImageUp,
  Cpu,
  ClipboardList,
  Sprout,
  Camera,
  ScanSearch,
  Gauge,
  Lightbulb,
  Waves,
  Sparkles,
  Smartphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NAVY = 'text-[#0B2545]'

const HOW_STEPS = [
  {
    icon: ImageUp,
    title: 'Upload Foto',
    description: 'Ambil foto daun atau sawah langsung dari kamera ponsel Anda.',
  },
  {
    icon: Cpu,
    title: 'AI Menganalisis',
    description: 'Model AI memeriksa foto dan memperkirakan tingkat kerusakan.',
  },
  {
    icon: ClipboardList,
    title: 'Hasil & Laporan',
    description: 'Anda menerima hasil analisis sekaligus laporan yang tercatat rapi.',
  },
  {
    icon: Sprout,
    title: 'Tindakan',
    description: 'Ikuti rekomendasi penanganan sesuai tingkat keparahan lahan.',
  },
]

const AI_STEPS = [
  { icon: Camera, title: 'Foto Lahan', description: 'Gambar padi atau sawah dari jarak jelas.' },
  { icon: Cpu, title: 'EfficientNet-B0', description: 'Model AI menganalisis pola visual pada foto.' },
  { icon: ScanSearch, title: 'Klasifikasi Kerusakan', description: 'Kondisi dibagi menjadi aman, rusak ringan, atau rusak berat.' },
  { icon: Gauge, title: 'Estimasi Kerusakan', description: 'Skor perkiraan kerusakan berdasarkan hasil klasifikasi.' },
  { icon: Lightbulb, title: 'Rekomendasi', description: 'Saran tindakan yang bisa langsung dilakukan.' },
]

const TRUST = [
  { icon: Waves, label: 'Deteksi Dini' },
  { icon: Sparkles, label: 'Rekomendasi AI' },
  { icon: Smartphone, label: 'Mudah Digunakan' },
  { icon: Sprout, label: 'Mendukung Ketahanan Pangan' },
]

export default async function BerandaPage() {
  const supabase = await createClient()
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
    <div className="bg-[#F8F9FA]">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-10 sm:pb-14">
        <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_18px_50px_-24px_rgba(11,37,69,0.28)] overflow-hidden">
          <div
            className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 rounded-full bg-green-100/70 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-10 w-64 h-64 rounded-full bg-green-50 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-6 items-center p-6 sm:p-10 lg:p-12">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-[#2E7D32] text-xs font-semibold mb-4">
                <Leaf size={13} aria-hidden="true" /> Teknologi Cerdas untuk Sawah
              </span>
              <h1 className={`text-3xl sm:text-4xl lg:text-[2.75rem] font-bold leading-tight mb-4 ${NAVY}`}>
                Deteksi Kerusakan Lahan Padi Lebih Cepat dengan AI
              </h1>
              <p className="text-base sm:text-lg text-[#2E7D32] mb-8">
                Foto sawah Anda dan biarkan AgriGuard menganalisis tingkat kerusakan, memberi skor,
                serta rekomendasi tindakan — bahkan saat sinyal terbatas.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 text-white font-semibold rounded-xl brand-gradient transition-colors"
                >
                  <Leaf size={18} aria-hidden="true" /> Mulai Analisis Lahan
                </Link>
                <Link
                  href="/cara-kerja"
                  className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 border border-[#2E7D32] text-[#2E7D32] font-semibold rounded-xl hover:bg-green-50 transition-colors"
                >
                  Pelajari lebih lanjut
                </Link>
              </div>
            </div>

            <div className="relative h-64 sm:h-80 lg:h-[26rem] organic-photo shadow-lg">
              <Image
                src="/ilustrations/hero-rice.jpg"
                alt="Lahan padi hijau"
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
        <h2 className={`text-xl sm:text-2xl font-bold mb-8 ${NAVY}`}>Bagaimana Cara Kerjanya?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          {HOW_STEPS.map((s, i) => (
            <div
              key={s.title}
              className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_-20px_rgba(11,37,69,0.35)] transition-transform ${
                i % 2 === 0 ? 'lg:-translate-y-3' : 'lg:translate-y-3'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                <s.icon size={24} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h3 className={`font-semibold mb-1.5 ${NAVY}`}>{s.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
        <div className="soft-green-panel rounded-3xl px-6 py-10 sm:px-10 sm:py-14">
          <div className="max-w-2xl mb-10">
            <h2 className={`text-xl sm:text-2xl font-bold mb-3 ${NAVY}`}>Di Balik Hasil Analisis</h2>
            <p className="text-gray-600">
              Setiap laporan melewati serangkaian proses yang konsisten, dari foto hingga rekomendasi
              yang bisa Anda tindak lanjuti.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-2">
            {AI_STEPS.map((s, i) => (
              <Fragment key={s.title}>
                <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                    <s.icon size={20} className="text-[#2E7D32]" aria-hidden="true" />
                  </div>
                  <p className={`font-semibold text-sm mb-1 ${NAVY}`}>{s.title}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{s.description}</p>
                </div>
                {i < AI_STEPS.length - 1 && (
                  <div className="hidden lg:flex items-center justify-center text-[#2E7D32]" aria-hidden="true">
                    <ArrowRight size={20} />
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          <div className="flex justify-center mt-10">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 text-white font-semibold rounded-xl brand-gradient transition-colors"
            >
              Mulai Analisis Sekarang
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="soft-green-panel rounded-2xl px-4 py-5 sm:rounded-full sm:px-10 sm:py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
                  <t.icon size={18} className="text-[#2E7D32]" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-[#0B2545]">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
