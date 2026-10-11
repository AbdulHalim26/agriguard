'use client'

import { useMemo } from 'react'
import { Bell, AlertTriangle, FileCheck2, RefreshCw } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  useNotifications,
  formatRelativeTime,
  type NotifItem,
  type NotifType,
} from '@/lib/notifications'
import { useCurrentUserId } from '@/lib/offline/use-current-user'

const TYPE_STYLE: Record<NotifType, { icon: typeof Bell; wrap: string; color: string; label: string }> = {
  peringatan: { icon: AlertTriangle, wrap: 'bg-amber-100', color: 'text-[#ED6C02]', label: 'Peringatan' },
  laporan: { icon: FileCheck2, wrap: 'bg-green-100', color: 'text-[#2E7D32]', label: 'Laporan' },
  sistem: { icon: RefreshCw, wrap: 'bg-gray-100', color: 'text-gray-500', label: 'Sistem' },
}

function NotifRow({ n }: { n: NotifItem }) {
  const style = TYPE_STYLE[n.type]
  const Icon = style.icon
  return (
    <li className="flex gap-3 p-4 rounded-2xl bg-white border border-gray-200">
      <div className={`w-10 h-10 rounded-full ${style.wrap} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={style.color} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
          <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${style.wrap} ${style.color}`}>
            {style.label}
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-0.5">{n.description}</p>
        <p className="text-xs text-gray-400 mt-1.5">{formatRelativeTime(n.time)}</p>
      </div>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
      <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
      <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada notifikasi</h3>
      <p className="text-gray-500 text-sm">
        Peringatan banjir, hasil verifikasi laporan, dan status sinkronisasi akan tampil di sini.
      </p>
    </div>
  )
}

export default function NotifikasiPage() {
  const userId = useCurrentUserId()
  const { items, loading } = useNotifications(userId)

  const tabs = useMemo(
    () => [
      { value: 'semua', label: 'Semua', items },
      { value: 'peringatan', label: 'Peringatan', items: items.filter((i) => i.type === 'peringatan') },
      { value: 'laporan', label: 'Laporan', items: items.filter((i) => i.type === 'laporan') },
      { value: 'sistem', label: 'Sistem', items: items.filter((i) => i.type === 'sistem') },
    ],
    [items]
  )

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifikasi</h1>
        <p className="text-gray-500 mt-1">Peringatan dan pembaruan aktivitas Anda</p>
      </div>

      <Tabs defaultValue="semua">
        <TabsList className="w-full sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-1 sm:flex-none">
              {t.label}
              {!loading && t.value !== 'semua' && t.items.length > 0 && (
                <span className="ml-1.5 text-[11px] text-gray-400">{t.items.length}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="semua" className="mt-4">
          {renderList(items, loading)}
        </TabsContent>
        {tabs
          .filter((t) => t.value !== 'semua')
          .map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              {renderList(t.items, loading)}
            </TabsContent>
          ))}
      </Tabs>
    </div>
  )
}

function renderList(items: NotifItem[], loading: boolean) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4 rounded-2xl bg-white border border-gray-200 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) return <EmptyState />
  return (
    <ul className="space-y-3">
      {items.map((n) => (
        <NotifRow key={n.id} n={n} />
      ))}
    </ul>
  )
}
