import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AgriGuard - Peringatan Dini Banjir Sawah',
  description:
    'Platform peringatan dini banjir sawah hiper-lokal dengan AI untuk petani dan PPL/Dinas',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#2E7D32',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className="h-full">
      <body className={`${jakarta.variable} font-sans h-full antialiased`}>
        {children}
      </body>
    </html>
  )
}