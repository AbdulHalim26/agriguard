import Link from 'next/link'
import Image from 'next/image'
import MarketingNav from '@/components/marketing/MarketingNav'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col bg-[#F8F9FA]">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <footer className="bg-[#1B5E20] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-lg mb-3">
              <Image src="/logo-white.png" alt="AgriGuard" width={32} height={32} />
              AgriGuard
            </div>
            <p className="text-sm text-green-100 max-w-sm">
              Teknologi Cerdas untuk Sawah yang Lebih Terjaga.
            </p>
          </div>
          <nav className="grid gap-2 text-sm text-green-100 sm:justify-items-end">
            <Link href="/fitur" className="hover:text-white transition-colors">
              Fitur
            </Link>
            <Link href="/cara-kerja" className="hover:text-white transition-colors">
              Cara Kerja
            </Link>
            <Link href="/tentang" className="hover:text-white transition-colors">
              Tentang
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Masuk
            </Link>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-xs text-green-100/80 text-center">
            AgriGuard — solusi peringatan dini banjir sawah hiper-lokal.
          </div>
        </div>
      </footer>
    </div>
  )
}
