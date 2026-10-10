'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Camera,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import { getFloodStatus, type FloodStatusData } from '@/app/(app)/dashboard/flood-actions'

const HERO_BG: Record<string, string> = {
  green: 'from-[#2E7D32] to-[#43A047]',
  yellow: 'from-[#ED6C02] to-[#F59E0B]',
  red: 'from-[#D32F2F] to-[#E53935]',
}

const ICONS = {
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
}

export default function DashboardHero({ userName }: { userName: string }) {
  const [data, setData] = useState<FloodStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await getFloodStatus()
      if (result.error) throw new Error(result.error)
      setData(result.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[#2E7D32] to-[#43A047] p-6 sm:p-8 animate-pulse">
        <div className="h-5 w-40 bg-white/30 rounded mb-4" />
        <div className="h-10 w-56 bg-white/30 rounded mb-3" />
        <div className="h-4 w-72 max-w-full bg-white/20 rounded" />
      </div>
    )
  }

  const color = error || !data ? 'gray' : data.color
  const IconComponent = data ? ICONS[data.icon] : AlertCircle
  const bgClass =
    HERO_BG[color] ?? 'from-gray-500 to-gray-600'

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${bgClass} text-white p-6 sm:p-8 shadow-lg`}
      role="region"
      aria-label="Status peringatan dini banjir"
    >
      <p className="text-white/85 text-sm mb-1">Selamat datang, {userName}!</p>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <IconComponent size={26} aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/80">
            Status Banjir Wilayah
          </p>
          <p className="text-2xl sm:text-3xl font-bold leading-tight">
            {error || !data ? 'Tidak Diketahui' : data.label}
          </p>
        </div>
      </div>

      <p className="text-white/90 text-sm max-w-xl mb-5">
        {error
          ? 'Data cuaca dan tinggi air belum dapat dimuat. Periksa koneksi lalu coba lagi.'
          : data?.description}
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center gap-2 min-h-[56px] px-5 py-3 bg-white text-[#2E7D32] font-bold rounded-xl hover:bg-green-50 active:scale-[0.99] transition-all text-sm sm:text-base text-center"
        >
          <Camera size={22} aria-hidden="true" />
          SCAN KERUSAKAN SAWAH (AI)
        </Link>

        {error && (
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 min-h-[56px] px-4 py-3 bg-white/15 hover:bg-white/25 border border-white/40 text-white font-medium rounded-xl transition-colors"
          >
            <RotateCcw size={18} aria-hidden="true" />
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  )
}
