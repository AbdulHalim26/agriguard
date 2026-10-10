'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getPendingReportCount } from '@/app/(app)/verifikasi/verification-actions'

export default function PendingReportsBadge({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    getPendingReportCount()
      .then((res) => {
        if (!cancelled) setCount(res.count)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Link
      href="/verifikasi"
      className={`relative inline-flex items-center justify-center p-2 min-w-[44px] min-h-[44px] text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors ${className}`}
      aria-label={
        count > 0 ? `${count} laporan menunggu verifikasi` : 'Notifikasi verifikasi'
      }
    >
      <Bell size={22} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D32F2F] text-white text-[11px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
