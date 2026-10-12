import Link from 'next/link'
import MarketingNav from '@/components/marketing/MarketingNav'
import BrandLogo from '@/components/brand/BrandLogo'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col bg-[#F8F9FA]">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <footer className="bg-[#1B5E20] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:max-w-xs">
              <BrandLogo variant="white" size="md" className="mb-3" />
              <p className="text-sm text-green-100">
                Teknologi Cerdas untuk Sawah yang Lebih Terjaga.
              </p>
            </div>
            <nav
              aria-label="Navigasi footer"
              className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 text-sm text-green-100"
            >
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
