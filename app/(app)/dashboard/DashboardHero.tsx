'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Camera,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  CloudRain,
  Droplets,
} from 'lucide-react'
import { getFloodStatus, type FloodStatusData } from '@/app/(app)/dashboard/flood-actions'
import { requestLocation } from '@/lib/location'
import {
  RAIN_THRESHOLD_WASPADA_MM,
  WATER_LEVEL_THRESHOLD_BAHAYA_M,
  STATUS_CONFIG,
  STATUS_STYLE_FALLBACK,
} from '@/lib/thresholds'

const ICONS = {
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
}

export default function DashboardHero({
  userName,
  showScanCta = true,
}: {
  userName: string
  showScanCta?: boolean
}) {
  const [data, setData] = useState<FloodStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      // Pakai koordinat perangkat (realtime sesuai lokasi). Bila izin belum
      // diberikan, browser memunculkan prompt sekali; bila ditolak/tidak
      // tersedia, server memakai fallback koordinat pusat Karawang.
      let coords: { lat: number; lon: number } | undefined
      try {
        const loc = await requestLocation()
        if (loc.status === 'granted' && loc.lat != null && loc.lng != null) {
          coords = { lat: loc.lat, lon: loc.lng }
        }
      } catch {
        coords = undefined
      }

      const result = await getFloodStatus(coords)
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
        <div className="h-4 w-72 max-w-full bg-white/20 rounded mb-5" />
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div className="h-16 bg-white/20 rounded-xl" />
          <div className="h-16 bg-white/20 rounded-xl" />
        </div>
      </div>
    )
  }

  const style =
    error || !data ? STATUS_STYLE_FALLBACK : STATUS_CONFIG[data.color === 'yellow' ? 'waspada' : data.color === 'red' ? 'bahaya' : 'aman']
  const IconComponent = data ? ICONS[data.icon] : AlertCircle

  const rain = data?.rain_3h_mm ?? null
  const water = data?.water_level_m ?? null
  const rainWarn = rain !== null && rain >= RAIN_THRESHOLD_WASPADA_MM
  const waterWarn = water !== null && water >= WATER_LEVEL_THRESHOLD_BAHAYA_M

  const indicators = [
    {
      label: 'Curah Hujan 3 Jam',
      value: rain !== null ? rain.toFixed(1) : '—',
      unit: 'mm',
      icon: CloudRain,
      warn: rainWarn,
    },
    {
      label: 'Tinggi Air',
      value: water !== null ? water.toFixed(2) : '—',
      unit: 'm',
      icon: Droplets,
      warn: waterWarn,
    },
  ]

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${style.gradient} text-white p-6 sm:p-8 shadow-lg`}
      role="region"
      aria-label="Status peringatan dini banjir"
    >
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
          <IconComponent size={40} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs uppercase tracking-widest text-white/80 font-semibold">
            Status Banjir Wilayah
          </p>
          <p className="text-3xl sm:text-4xl font-extrabold leading-tight">
            {error || !data ? 'Tidak Diketahui' : data.label}
          </p>
        </div>
      </div>

      <p className="mt-3 text-white/90 text-sm max-w-xl">
        {error
          ? 'Data cuaca dan tinggi air belum dapat dimuat. Periksa koneksi lalu coba lagi.'
          : data?.description}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 max-w-md">
        {indicators.map((ind) => (
          <div
            key={ind.label}
            className={`rounded-xl px-4 py-3 ${
              ind.warn ? 'bg-white/25 ring-1 ring-white/60' : 'bg-white/10'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-white/80 mb-1">
              <ind.icon size={13} aria-hidden="true" />
              <span className="truncate">{ind.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{ind.value}</span>
              <span className="text-xs text-white/80">{ind.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {data && !error && (
        <p className="mt-3 text-xs text-white/75" aria-live="polite">
          {data.source === 'openweathermap'
            ? data.location_source === 'device'
              ? 'Data cuaca real — lokasi Anda'
              : 'Data cuaca real — lokasi default (Karawang)'
            : data.source === 'mock_fallback'
              ? 'Data simulasi — layanan cuaca tidak dapat diakses (periksa API key)'
              : 'Data simulasi — API key cuaca belum diatur'}
        </p>
      )}

      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        {showScanCta && (
          <Link
            href="/scan"
            className="inline-flex items-center justify-center gap-2 min-h-[56px] px-5 py-3 bg-white text-[#2E7D32] font-bold rounded-xl hover:bg-green-50 active:scale-[0.99] transition-all text-sm sm:text-base text-center shadow-sm"
          >
            <Camera size={22} aria-hidden="true" />
            SCAN KERUSAKAN SAWAH (AI)
          </Link>
        )}

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
