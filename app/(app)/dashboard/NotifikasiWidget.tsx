'use client'

import Link from 'next/link'
import { Bell, AlertTriangle, FileCheck2, RefreshCw, ChevronRight } from 'lucide-react'
import { useNotifications, formatRelativeTime, type NotifType } from '@/lib/notifications'

const TYPE_STYLE: Record<NotifType, { icon: typeof Bell; wrap: string; color: string }> = {
  peringatan: { icon: AlertTriangle, wrap: 'bg-amber-100', color: 'text-[#ED6C02]' },
  laporan: { icon: FileCheck2, wrap: 'bg-green-100', color: 'text-[#2E7D32]' },
  sistem: { icon: RefreshCw, wrap: 'bg-gray-100', color: 'text-gray-500' },
}

export default function NotifikasiWidget({ userId }: { userId: string }) {
  const { items, loading } = useNotifications(userId)
  const latest = items.slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Notifikasi</h2>
        <Link
          href="/notifikasi"
          className="text-sm font-medium text-[#2E7D32] hover:underline inline-flex items-center gap-1"
        >
          Lihat Semua <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="p-2">
        {loading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : latest.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-gray-500">Belum ada notifikasi.</p>
          </div>
        ) : (
          <ul>
            {latest.map((n) => {
              const style = TYPE_STYLE[n.type]
              const Icon = style.icon
              const body = (
                <div className="flex gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-full ${style.wrap} flex items-center justify-center shrink-0`}>
                    <Icon size={17} className={style.color} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-2">{n.description}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(n.time)}</p>
                  </div>
                </div>
              )
              return (
                <li key={n.id}>
                  {n.href ? <Link href={n.href}>{body}</Link> : body}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
