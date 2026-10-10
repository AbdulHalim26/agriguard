'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, ArrowRight } from 'lucide-react'
import { getPendingReportCount } from '@/app/(app)/verifikasi/verification-actions'

export default function NewReportsBanner() {
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

  if (count === 0) return null

  return (
    <Link
      href="/verifikasi?tab=reports"
      className="flex items-center gap-3 bg-[#ED6C02] text-white rounded-xl p-4 hover:bg-[#d96205] transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
        <Bell size={20} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">
          {count} laporan baru menunggu verifikasi
        </p>
        <p className="text-white/90 text-sm">
          Tinjau laporan dari petani binaan Anda.
        </p>
      </div>
      <ArrowRight size={20} aria-hidden="true" className="shrink-0" />
    </Link>
  )
}
