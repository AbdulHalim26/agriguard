'use client'

import { useEffect, useState, useCallback } from 'react'
import { listMyReports } from '@/app/(app)/laporan/actions'
import { getFloodStatus } from '@/app/(app)/dashboard/flood-actions'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'

export type NotifType = 'peringatan' | 'laporan' | 'sistem'

export interface NotifItem {
  id: string
  type: NotifType
  title: string
  description: string
  time: string
  href?: string
}

// Turunan notifikasi TANPA tabel baru:
// - laporan: verifikasi/ditolak laporan milik user (verified_at)
// - peringatan: status banjir wilayah saat ini bila bukan "aman"
// - sistem: event antrian sinkronisasi offline (IndexedDB)
export function useNotifications(userId?: string | null): {
  items: NotifItem[]
  loading: boolean
  reload: () => void
} {
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false

    const build = async () => {
      const out: NotifItem[] = []

      // 1) Verifikasi laporan user
      try {
        const res = await listMyReports()
        for (const r of res.data || []) {
          if (!r.verified_at) continue
          out.push({
            id: `report-${r.id}`,
            type: 'laporan',
            title: r.is_verified ? 'Laporan Terverifikasi' : 'Laporan Ditolak',
            description: r.is_verified
              ? `Laporan di ${r.lahan?.name || 'lahan Anda'} telah divalidasi PPL.`
              : `Laporan di ${r.lahan?.name || 'lahan Anda'} ditolak${
                  r.verification_note ? `: ${r.verification_note}` : '.'
                }`,
            time: r.verified_at,
            href: '/laporan',
          })
        }
      } catch {
        // offline / gagal -> lewati
      }

      // 2) Perubahan status banjir wilayah (hanya saat bukan aman)
      try {
        const flood = await getFloodStatus()
        if (flood.data && flood.data.status !== 'aman') {
          out.push({
            id: `flood-${flood.data.status}`,
            type: 'peringatan',
            title: `Peringatan Banjir — ${flood.data.label}`,
            description: flood.data.description,
            time: new Date().toISOString(),
            href: '/dashboard',
          })
        }
      } catch {
        // offline / gagal -> lewati
      }

      // 3) Antrian sinkronisasi offline
      if (userId) {
        try {
          const n = await getReportCount(userId)
          if (n > 0) {
            out.push({
              id: 'sync-pending',
              type: 'sistem',
              title: 'Sinkronisasi Tertunda',
              description: `${n} laporan menunggu terkirim ke server.`,
              time: new Date().toISOString(),
              href: '/laporan',
            })
          }
        } catch {
          // IndexedDB tidak tersedia -> lewati
        }
      }

      out.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      if (!cancelled) {
        setItems(out)
        setLoading(false)
      }
    }

    build()
    const unsub = subscribeQueue(reload)
    return () => {
      cancelled = true
      unsub()
    }
  }, [userId, nonce, reload])

  return { items, loading, reload }
}

export function formatRelativeTime(value: string): string {
  const now = Date.now()
  const then = new Date(value).getTime()
  if (isNaN(then)) return '—'
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 60) return 'baru saja'
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min} menit lalu`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} jam lalu`
  const day = Math.round(hour / 24)
  if (day < 7) return `${day} hari lalu`
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
