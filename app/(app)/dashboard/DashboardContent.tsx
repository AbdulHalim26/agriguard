'use client'

import Link from 'next/link'
import { ShieldCheck, Map, Printer, History } from 'lucide-react'
import SyncWidget from '@/components/features/SyncWidget'
import DashboardHero from './DashboardHero'
import LahanSummary from './LahanSummary'
import NotifikasiWidget from './NotifikasiWidget'
import AdminStats from './AdminStats'
import NewReportsBanner from '@/components/features/NewReportsBanner'

interface DashboardContentProps {
  userName: string
  userId: string
  demoMode: boolean
  role?: string | null
}

export default function DashboardContent({ userName, userId, demoMode, role }: DashboardContentProps) {
  const isPplDinas = role === 'ppl' || role === 'dinas'

  const demoBanner = demoMode ? (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-blue-600 text-sm font-bold">i</span>
        </div>
        <div>
          <h4 className="font-medium text-blue-800 mb-1">Mode Demo</h4>
          <p className="text-blue-700 text-sm">
            Aplikasi berjalan dalam mode demo dengan data simulasi. Data cuaca menggunakan fallback mock
            jika API key tidak dikonfigurasi. Login dengan OTP: <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono">123456</code>
          </p>
        </div>
      </div>
    </div>
  ) : null

  if (isPplDinas) {
    const adminActions = [
      {
        href: '/verifikasi?tab=reports',
        label: 'Verifikasi',
        description: 'Tinjau & validasi laporan petani',
        icon: ShieldCheck,
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
      },
      {
        href: '/peta',
        label: 'Peta Sebaran',
        description: 'Sebaran laporan kerusakan lahan',
        icon: Map,
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
      },
      {
        href: '/verifikasi?tab=rekap',
        label: 'Rekap PDF',
        description: 'Rekap luas terdampak per wilayah',
        icon: Printer,
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-600',
      },
      {
        href: '/audit',
        label: 'Audit Trail',
        description: 'Riwayat aktivitas verifikasi',
        icon: History,
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
      },
    ]

    return (
      <div className="space-y-6">
        {/* Hero status banjir (tanpa CTA scan untuk PPL/Dinas) */}
        <DashboardHero userName={userName} showScanCta={false} />

        {/* Banner laporan baru (M4-9) */}
        <NewReportsBanner />

        {/* Statistik agregat laporan (sesuai akses RLS) */}
        <AdminStats />

        {/* Quick actions khusus PPL/Dinas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {adminActions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:border-green-300 hover:shadow-md transition-all group"
            >
              <div
                className={`w-12 h-12 ${a.iconBg} rounded-lg flex items-center justify-center mb-3 transition-colors`}
              >
                <a.icon size={24} className={a.iconColor} aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{a.label}</h3>
              <p className="text-sm text-gray-500">{a.description}</p>
            </Link>
          ))}
        </div>

        {demoBanner}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero status banjir + CTA scan (FR-01 / FR-02) */}
      <DashboardHero userName={userName} />

      {/* Widget antrian offline (FR-03) */}
      <SyncWidget userId={userId} />

      {/* 4 kartu ringkasan + Kondisi Lahan */}
      <LahanSummary userId={userId} />

      {/* Widget notifikasi (3 terbaru) */}
      <NotifikasiWidget userId={userId} />

      {demoBanner}
    </div>
  )
}
