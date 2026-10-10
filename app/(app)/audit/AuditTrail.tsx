'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, History, Filter } from 'lucide-react'
import {
  listAuditLogs,
  type AuditLog,
} from './audit-actions'
import { ACTION_LABELS, ENTITY_LABELS } from '@/lib/audit-labels'

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ACTION_BADGE: Record<string, string> = {
  submit_report: 'bg-blue-100 text-blue-700',
  verify_report: 'bg-green-100 text-green-700',
  reject_report: 'bg-red-100 text-red-700',
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listAuditLogs()
      if (res.error) setError(res.error)
      else setLogs(res.data || [])
    } catch (err) {
      console.error('[audit] gagal memuat:', err)
      setError(
        err instanceof Error
          ? `Gagal memuat audit trail: ${err.message}`
          : 'Koneksi terputus. Coba lagi saat online.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const actionOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action))
    return Array.from(set).sort()
  }, [logs])

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : null
    return logs.filter((l) => {
      if (action !== 'all' && l.action !== action) return false
      const ts = new Date(l.created_at).getTime()
      if (fromTs != null && ts < fromTs) return false
      if (toTs != null && ts > toTs) return false
      return true
    })
  }, [logs, action, from, to])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Filter size={16} aria-hidden="true" />
          Filter
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-sm col-span-2 sm:col-span-1">
            <span className="block text-gray-500 mb-1">Aksi</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            >
              <option value="all">Semua aksi</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] || a}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Dari tanggal</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Sampai tanggal</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm transition-colors"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-medium text-gray-900 mb-1">Belum ada aktivitas</h3>
          <p className="text-sm text-gray-500">
            Riwayat verifikasi dan pengiriman laporan akan tercatat di sini.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 bg-gray-50">
                  <th className="py-2.5 px-4 font-medium whitespace-nowrap">Waktu</th>
                  <th className="py-2.5 px-4 font-medium">Aktor</th>
                  <th className="py-2.5 px-4 font-medium">Aksi</th>
                  <th className="py-2.5 px-4 font-medium">Entitas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                      {formatDateTime(l.created_at)}
                    </td>
                    <td className="py-2.5 px-4 text-gray-900">
                      {l.actor_name || 'Sistem'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          ACTION_BADGE[l.action] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ACTION_LABELS[l.action] || l.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-600">
                      {l.entity ? ENTITY_LABELS[l.entity] || l.entity : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
            Menampilkan {filtered.length} dari {logs.length} aktivitas terbaru (maks 200).
          </p>
        </div>
      )}
    </div>
  )
}
