'use client'

import { useEffect, useState } from 'react'
import { FileStack, Clock3, CheckCircle2 } from 'lucide-react'
import { getReportStats, type ReportStats } from '@/app/(app)/verifikasi/verification-actions'

export default function AdminStats() {
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getReportStats()
      .then((res) => {
        if (!cancelled) setStats(res.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cards = [
    {
      label: 'Total Laporan Masuk',
      value: stats?.total ?? 0,
      icon: FileStack,
      iconBg: 'bg-blue-100',
      iconColor: 'text-[#0288D1]',
    },
    {
      label: 'Menunggu Verifikasi',
      value: stats?.pending ?? 0,
      icon: Clock3,
      iconBg: 'bg-amber-100',
      iconColor: 'text-[#ED6C02]',
    },
    {
      label: 'Tervalidasi',
      value: stats?.verified ?? 0,
      icon: CheckCircle2,
      iconBg: 'bg-green-100',
      iconColor: 'text-[#2E7D32]',
    },
  ]

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Statistik Laporan
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
          >
            <div className={`w-11 h-11 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
              <c.icon size={22} className={c.iconColor} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">
                {loading ? '—' : c.value}
              </div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
