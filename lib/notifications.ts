'use client'

import { useEffect, useState, useCallback } from 'react'
import { listMyReports } from '@/app/(app)/laporan/actions'
import { useFloodAssessment } from '@/components/features/FloodAssessmentProvider'
import { floodNotification } from '@/lib/ews/assessment'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'
import { INSURANCE_NOTICE } from '@/lib/reports/advisory'

export type NotifType = 'peringatan' | 'laporan' | 'sistem'

export interface NotifItem {
  id: string
  type: NotifType
  title: string
  description: string
  time: string | null
  timeLabel?: string
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
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const flood = useFloodAssessment()

  const reload = useCallback(() => { setNonce((n) => n + 1); flood.refresh() }, [flood.refresh])

  useEffect(() => {
    let cancelled = false
    setItems([])
    setOwnerId(null)
    setLoading(true)

    const build = async () => {
      const out: NotifItem[] = []

      // 1) Verifikasi laporan user
      try {
        if (!userId) return
        const res = await listMyReports()
        for (const r of res.data || []) {
          if (!r.verified_at) continue
          out.push({
            id: `report-${r.id}`,
            type: 'laporan',
            title: r.is_verified ? 'Laporan Terverifikasi' : 'Laporan Ditolak',
            description: r.is_verified
              ? `Laporan di ${r.lahan?.name || 'lahan Anda'} telah divalidasi PPL. ${INSURANCE_NOTICE}`
              : `Laporan di ${r.lahan?.name || 'lahan Anda'} ditolak${
                  r.verification_note ? `: ${r.verification_note}` : '.'
                } ${INSURANCE_NOTICE}`,
            time: r.verified_at,
            href: '/laporan',
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

      out.sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''))
      if (!cancelled) {
        setItems(out)
        setOwnerId(userId || null)
        setLoading(false)
      }
    }

    if (userId) void build()
    else setLoading(false)
    const unsub = subscribeQueue(() => setNonce((n) => n + 1))
    return () => {
      cancelled = true
      unsub()
    }
  }, [userId, nonce])

  const notice = flood.data?.user_id === userId ? floodNotification(flood.data) : null
  const unavailable: NotifItem | null = !flood.loading && !flood.data ? {
    id: 'flood-unavailable', type: 'sistem', title: 'Indikator banjir — BELUM DIKETAHUI',
    description: flood.error || 'Penilaian server belum tersedia. Kondisi aman belum dapat disimpulkan.',
    time: null, href: '/dashboard',
  } : null
  return { items: [...(notice && !flood.loading ? [notice] : unavailable ? [unavailable] : []), ...(ownerId === userId ? items : [])],
    loading: loading || flood.loading, reload }
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return 'Waktu penilaian belum tersedia'
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
