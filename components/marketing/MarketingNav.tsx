'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Beranda' },
  { href: '/fitur', label: 'Fitur' },
  { href: '/cara-kerja', label: 'Cara Kerja' },
  { href: '/tentang', label: 'Tentang' },
]

export default function MarketingNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="AgriGuard" width={32} height={32} className="rounded-md" />
          <span className="hidden sm:inline font-bold text-lg text-[#2E7D32]">AgriGuard</span>
        </Link>

        <nav className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'text-[#2E7D32] bg-green-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        <Link
          href="/login"
          className="shrink-0 inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-[#2E7D32] hover:bg-[#276b2a] rounded-lg transition-colors"
        >
          Masuk
        </Link>
      </div>
    </header>
  )
}
