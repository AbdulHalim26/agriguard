'use client'

import { WifiOff } from 'lucide-react'
import { useOfflineStatus } from '@/lib/offline/status'

export default function OfflineBanner() {
  const offline = useOfflineStatus()

  if (!offline) return null

  return (
    <div
      className="sticky top-0 z-40 bg-amber-500 text-white text-xs sm:text-sm px-4 py-2 text-center"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        <WifiOff size={16} aria-hidden="true" />
        Mode Offline — laporan tersimpan lokal &amp; otomatis terkirim saat online
      </span>
    </div>
  )
}
