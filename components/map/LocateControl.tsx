'use client'

import { useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { requestLocation } from '@/lib/location'

export default function LocateControl({
  onLocated,
  className = '',
  label = 'Lokasi Saya',
}: {
  onLocated: (lat: number, lng: number) => void
  className?: string
  label?: string
}) {
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleLocate = async () => {
    setLocating(true)
    setToast(null)
    const res = await requestLocation()
    setLocating(false)
    if (res.status === 'granted' && res.lat != null && res.lng != null) {
      onLocated(res.lat, res.lng)
    } else if (res.status === 'denied') {
      setToast('Izin lokasi ditolak — geser peta manual')
    } else {
      setToast('GPS tidak tersedia')
    }
    window.setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className={`absolute z-[1000] ${className}`}>
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 bg-white text-gray-800 text-sm font-medium rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        {locating ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <Crosshair size={18} className="text-[#2E7D32]" aria-hidden="true" />
        )}
        {label}
      </button>
      {toast && (
        <div
          className="mt-2 max-w-[240px] text-xs bg-gray-900/90 text-white rounded-lg px-3 py-2 shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
