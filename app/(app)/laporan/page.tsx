'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  MapPin,
  UploadCloud,
} from 'lucide-react'
import { listMyReports, type ReportItem } from './actions'
import { AI_STATUS_INFO, formatConfidence, type AiStatus } from '@/lib/recommendations'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'
import { useCurrentUserId } from '@/lib/offline/use-current-user'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function VerificationBadge({ isVerified }: { isVerified: boolean }) {
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
        Tervalidasi
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <Clock className="w-3 h-3" aria-hidden="true" />
      Menunggu
    </span>
  )
}

export default function LaporanPage() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const userId = useCurrentUserId()

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const c = await getReportCount(userId)
        if (!cancelled) setPendingCount(c)
      } catch {
        if (!cancelled) setPendingCount(0)
      }
    }
    refresh()
    const unsub = subscribeQueue(refresh)
    return () => {
      cancelled = true
      unsub()
    }
  }, [userId])

  const fetchReports = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const res = await listMyReports()
    if (res.error) {
      setError(res.error)
    } else {
      setReports(res.data || [])
    }

    if (asRefresh) setRefreshing(false)
    else setLoading(false)
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Saya</h1>
          <p className="text-gray-500 mt-1">Riwayat laporan kerusakan padi</p>
        </div>
        <button
          onClick={() => fetchReports(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          )}
          Perbarui
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      {pendingCount > 0 && (
        <div
          className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-center gap-2"
          role="alert"
        >
          <UploadCloud size={16} className="shrink-0" aria-hidden="true" />
          Ada {pendingCount} laporan tersimpan offline di perangkat ini — akan tersinkron otomatis
          saat koneksi kembali.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada laporan</h3>
          <p className="text-gray-500">
            Laporan Anda akan muncul di sini setelah scan atau laporan manual di halaman Scan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const info = report.ai_status
              ? AI_STATUS_INFO[report.ai_status as AiStatus]
              : null
            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              >
                <div className="flex gap-4 p-4">
                  {report.photo_urls.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={report.photo_urls[0]}
                      alt="Foto laporan"
                      className="w-20 h-20 object-cover rounded-lg shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-gray-400" aria-hidden="true" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {report.lahan?.name || 'Lahan tidak diketahui'}
                      </h3>
                      {info && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${info.badgeClass}`}
                        >
                          {info.label}
                          {report.ai_confidence != null && ` · ${formatConfidence(report.ai_confidence)}`}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1">
                      {report.ai_status
                        ? `Kerusakan ${Math.round(report.ai_damage_pct ?? 0)}% · ${formatDateTime(report.server_created_at)}`
                        : `Laporan manual · ${formatDateTime(report.server_created_at)}`}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <VerificationBadge isVerified={report.is_verified} />
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Tersinkron
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        <MapPin className="w-3 h-3" aria-hidden="true" />
                        {Number(report.latitude).toFixed(5)}, {Number(report.longitude).toFixed(5)}
                      </span>
                    </div>

                    {report.verification_note && report.is_verified && (
                      <p className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                        {report.verification_note}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && reports.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <AlertTriangle size={12} aria-hidden="true" />
          Status sinkron = tersimpan langsung ke server saat pengiriman.
        </p>
      )}
    </div>
  )
}