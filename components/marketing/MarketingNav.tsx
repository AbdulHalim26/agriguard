'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandLogo from '@/components/brand/BrandLogo'

const LINKS = [
  { href: '/', label: 'Beranda' },
  { href: '/fitur', label: 'Fitur' },
  { href: '/cara-kerja', label: 'Cara Kerja' },
  { href: '/tentang', label: 'Tentang' },
]

export default function MarketingNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center shrink-0" aria-label="AgriGuard — Beranda">
          <BrandLogo variant="color" size="sm" className="sm:hidden" />
          <BrandLogo variant="color" size="md" className="hidden sm:inline-flex" />
        </Link>

        <nav
          className="flex-1 flex items-center justify-start sm:justify-center gap-1 overflow-x-auto no-scrollbar"
          aria-label="Navigasi"
        >
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-[#2E7D32] font-semibold' : 'text-gray-600 hover:text-gray-900'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[#2E7D32]" aria-hidden="true" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-sm font-semibold text-[#2E7D32] border border-[#2E7D32] rounded-lg hover:bg-green-50 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-sm font-semibold text-white brand-gradient rounded-lg transition-colors"
          >
            Daftar
          </Link>
        </div>
      </div>
    </header>
  )
}
