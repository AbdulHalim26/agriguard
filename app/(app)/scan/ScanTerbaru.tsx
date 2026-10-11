'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { listMyReports, type ReportItem } from '@/app/(app)/laporan/actions'
import { AI_STATUS_INFO, formatConfidence, type AiStatus } from '@/lib/recommendations'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusCell({ r }: { r: ReportItem }) {
  if (r.is_verified) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Tervalidasi
      </span>
    )
  }
  if (r.verified_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" aria-hidden="true" /> Ditolak
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" aria-hidden="true" /> Menunggu
    </span>
  )
}

export default function ScanTerbaru() {
  const [rows, setRows] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await listMyReports()
        if (!cancelled) setRows((res.data || []).slice(0, 3))
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <History size={18} className="text-[#2E7D32]" aria-hidden="true" /> Scan Terbaru
        </h2>
        <Link
          href="/laporan"
          className="text-sm font-medium text-[#2E7D32] hover:underline inline-flex items-center gap-1"
        >
          Lihat Semua <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500">Belum ada scan tersimpan.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-2 font-semibold">Tanggal</th>
                <th className="px-5 py-2 font-semibold">Lahan</th>
                <th className="px-5 py-2 font-semibold">Hasil AI</th>
                <th className="px-5 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const info = r.ai_status ? AI_STATUS_INFO[r.ai_status as AiStatus] : null
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.server_created_at)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900 truncate max-w-[140px]">
                      {r.lahan?.name || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {info ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.badgeClass}`}>
                          {info.label}
                          {r.ai_confidence != null && ` · ${formatConfidence(r.ai_confidence)}`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Manual</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusCell r={r} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
