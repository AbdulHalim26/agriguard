'use client'

import { useEffect, useState } from 'react'
import { FileText, ShieldCheck, Clock3 } from 'lucide-react'
import { listMyReports } from '@/app/(app)/laporan/actions'

interface Stats {
  total: number
  verified: number
  pending: number
}

export default function ReportSummary({ userId }: { userId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!userId) return
      try {
        const res = await listMyReports()
        if (cancelled) return
        const rows = res.data || []
        const verified = rows.filter((r) => r.is_verified).length
        const pending = rows.filter((r) => !r.is_verified && !r.verified_at).length
        setStats({ total: rows.length, verified, pending })
      } catch {
        if (!cancelled) setStats({ total: 0, verified: 0, pending: 0 })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const cards = [
    {
      label: 'Total Laporan',
      value: stats?.total ?? 0,
      icon: FileText,
      iconBg: 'bg-blue-100',
      iconColor: 'text-[#0288D1]',
    },
    {
      label: 'Terverifikasi',
      value: stats?.verified ?? 0,
      icon: ShieldCheck,
      iconBg: 'bg-green-100',
      iconColor: 'text-[#2E7D32]',
    },
    {
      label: 'Menunggu',
      value: stats?.pending ?? 0,
      icon: Clock3,
      iconBg: 'bg-amber-100',
      iconColor: 'text-[#ED6C02]',
    },
  ]

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Ringkasan Laporan Saya
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-start"
          >
            <div className={`w-9 h-9 rounded-lg ${c.iconBg} flex items-center justify-center mb-2`}>
              <c.icon size={18} className={c.iconColor} aria-hidden="true" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {loading ? '—' : c.value}
            </span>
            <span className="text-xs text-gray-500 text-left leading-tight">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
