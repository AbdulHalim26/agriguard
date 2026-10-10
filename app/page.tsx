import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Waves,
  Camera,
  WifiOff,
  ShieldCheck,
  ArrowRight,
  Leaf,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

export default async function HomePage() {
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
    <main className="min-h-full bg-[#F8F9FA]">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#2E7D32] font-bold text-lg">
          <Leaf size={24} aria-hidden="true" />
          AgriGuard
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-green-50 rounded-lg transition-colors"
        >
          Masuk
        </Link>
      </header>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-14 sm:pt-16 sm:pb-20">
        <div className="max-w-2xl">
          <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-[#2E7D32] text-xs font-semibold mb-4">
            Peringatan dini banjir untuk sawah Anda
          </span>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 leading-tight mb-4">
            Lindungi sawah dari banjir,{' '}
            <span className="text-[#2E7D32]">sebelum air datang.</span>
          </h1>
          <p className="text-gray-600 text-base sm:text-lg mb-8">
            AgriGuard memadukan prakiraan cuaca, pantauan tinggi air, dan deteksi
            kerusakan dengan AI — siap dipakai petani, PPL, maupun Dinas Pertanian,
            bahkan tanpa sinyal.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-[#2E7D32] text-white font-semibold rounded-xl hover:bg-[#276b2a] transition-colors"
            >
              Daftar / Masuk
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-[52px] px-6 py-3 bg-white border border-gray-300 text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Sudah punya akun? Masuk
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
          Semua yang petani butuhkan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6"
            >
              <div className="w-11 h-11 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                <f.icon size={22} className="text-[#2E7D32]" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 text-center text-sm text-gray-500">
          AgriGuard — solusi peringatan dini banjir sawah hiper-lokal.
        </div>
      </footer>
    </main>
  )
}
