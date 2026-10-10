'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  RotateCcw,
  Droplets,
  CloudRain,
  Info,
} from 'lucide-react'
import { getFloodStatus, FloodStatusData } from '@/app/(app)/dashboard/flood-actions'

const ICONS = {
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
}

const ICON_COLORS = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  red: 'text-red-600',
}

const BG_COLORS = {
  green: 'bg-green-50 border-green-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  red: 'bg-red-50 border-red-200',
}

const TEXT_COLORS = {
  green: 'text-green-800',
  yellow: 'text-yellow-800',
  red: 'text-red-800',
}

export default function FloodStatusCard() {
  const [data, setData] = useState<FloodStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const fetchStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getFloodStatus()
      if (result.error) {
        throw new Error(result.error)
      }
      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat status banjir')
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleRetry = () => {
    setRetrying(true)
    fetchStatus()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow border border-gray-200 p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-16 bg-gray-200 rounded mb-4"></div>
        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-xl shadow border border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle size={24} className="text-red-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Data Tidak Tersedia</h3>
            <p className="text-sm text-gray-500">Gagal memuat data cuaca dan tinggi air</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {retrying ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Mencoba lagi...
            </>
          ) : (
            <>
              <RotateCcw size={18} aria-hidden="true" />
              Coba Lagi
            </>
          )}
        </button>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const IconComponent = ICONS[data.icon]
  const iconColor = ICON_COLORS[data.color]
  const bgColor = BG_COLORS[data.color]
  const textColor = TEXT_COLORS[data.color]

  const sourceLabels = {
    openweathermap: 'OpenWeatherMap (real-time)',
    mock: 'Data demo (mock)',
    mock_fallback: 'Data demo (fallback - API error)',
  }

  const sourceColors = {
    openweathermap: 'text-green-600 bg-green-50 border-green-200',
    mock: 'text-gray-600 bg-gray-50 border-gray-200',
    mock_fallback: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  }

  return (
    <div className={`bg-white rounded-xl shadow border ${bgColor} p-6`} role="region" aria-label={`Status banjir: ${data.label}`}>
      {/* Status Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${bgColor.replace('bg-', 'bg-').replace('border-', 'border-')}`}>
          <IconComponent size={32} className={iconColor} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-3xl font-bold ${textColor}`}>{data.label}</span>
            {data.source !== 'openweathermap' && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${sourceColors[data.source]}`}>
                {sourceLabels[data.source]}
              </span>
            )}
          </div>
          <p className={textColor}>{data.description}</p>
        </div>
      </div>

      {/* Detail metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <CloudRain size={16} aria-hidden="true" />
            <span>Curah Hujan 3 Jam</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">
              {data.rain_3h_mm !== null ? data.rain_3h_mm.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-gray-500">mm</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Droplets size={16} aria-hidden="true" />
            <span>Tinggi Air Sungai</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">
              {data.water_level_m !== null ? data.water_level_m.toFixed(2) : '—'}
            </span>
            <span className="text-sm text-gray-500">m</span>
          </div>
        </div>
      </div>

      {/* Last updated */}
      {data.last_updated && (
        <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
          <span>Data tinggi air diperbarui: {new Date(data.last_updated).toLocaleString('id-ID')}</span>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="text-green-600 hover:text-green-700 font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}