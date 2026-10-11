'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Loader2,
  MapPin,
  UploadCloud,
  Search,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-react'
import { listMyReports, type ReportItem } from './actions'
import { AI_STATUS_INFO, formatConfidence, type AiStatus } from '@/lib/recommendations'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'
import { useCurrentUserId } from '@/lib/offline/use-current-user'

const PAGE_SIZE = 10

type StatusFilter = 'semua' | 'menunggu' | 'tervalidasi' | 'ditolak'

function reportState(r: ReportItem): Exclude<StatusFilter, 'semua'> {
  if (r.is_verified) return 'tervalidasi'
  if (r.verified_at) return 'ditolak'
  return 'menunggu'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function StatusBadge({ report }: { report: ReportItem }) {
  const state = reportState(report)
  if (state === 'tervalidasi') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Tervalidasi
      </span>
    )
  }
  if (state === 'ditolak') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" aria-hidden="true" /> Ditolak
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" aria-hidden="true" /> Menunggu
    </span>
  )
}

export default function LaporanClient() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [selected, setSelected] = useState<ReportItem | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('semua')
  const [kecamatan, setKecamatan] = useState('semua')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

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
    try {
      const res = await listMyReports()
      if (res.error) setError(res.error)
      else setReports(res.data || [])
    } catch (err) {
      console.error('[laporan] gagal memuat (offline?):', err)
      setError('Koneksi terputus. Riwayat laporan akan muncul kembali saat online.')
    } finally {
      if (asRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  useEffect(() => {
    setPage(1)
  }, [search, status, kecamatan, dateFrom, dateTo])

  const stats = useMemo(() => {
    const total = reports.length
    const menunggu = reports.filter((r) => reportState(r) === 'menunggu').length
    const tervalidasi = reports.filter((r) => reportState(r) === 'tervalidasi').length
    const perluTindakan = reports.filter((r) => r.ai_status === 'rusak_berat').length
    return { total, menunggu, tervalidasi, perluTindakan }
  }, [reports])

  const kecamatanOptions = useMemo(() => {
    const set = new Set<string>()
    reports.forEach((r) => {
      if (r.district) set.add(r.district)
    })
    return Array.from(set).sort()
  }, [reports])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports.filter((r) => {
      if (q) {
        const hay = `${r.lahan?.name || ''} ${r.lahan?.id || ''} ${r.district || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (status !== 'semua' && reportState(r) !== status) return false
      if (kecamatan !== 'semua' && (r.district || '') !== kecamatan) return false
      if (dateFrom && new Date(r.server_created_at) < new Date(`${dateFrom}T00:00:00`)) return false
      if (dateTo && new Date(r.server_created_at) > new Date(`${dateTo}T23:59:59`)) return false
      return true
    })
  }, [reports, search, status, kecamatan, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statCards = [
    { label: 'Total Laporan', value: stats.total, icon: FileText, wrap: 'bg-blue-100', color: 'text-[#0288D1]' },
    { label: 'Menunggu', value: stats.menunggu, icon: Clock, wrap: 'bg-amber-100', color: 'text-[#ED6C02]' },
    { label: 'Terverifikasi', value: stats.tervalidasi, icon: CheckCircle2, wrap: 'bg-green-100', color: 'text-[#2E7D32]' },
    { label: 'Perlu Tindakan', value: stats.perluTindakan, icon: AlertTriangle, wrap: 'bg-red-100', color: 'text-[#D32F2F]' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan</h1>
          <p className="text-gray-500 mt-1">Riwayat laporan kerusakan padi</p>
        </div>
        <button
          onClick={() => fetchReports(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Perbarui</span>
        </button>
      </div>

      {/* 4 kartu statistik */}
      <div className="soft-green-panel rounded-2xl p-3 sm:p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className={`w-10 h-10 rounded-xl ${c.wrap} flex items-center justify-center mb-3`}>
              <c.icon size={20} className={c.color} aria-hidden="true" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : c.value}</p>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-center gap-2" role="alert">
          <UploadCloud size={16} className="shrink-0" aria-hidden="true" />
          Ada {pendingCount} laporan tersimpan offline di perangkat ini — akan tersinkron otomatis saat koneksi kembali.
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari lahan / ID..."
              aria-label="Cari laporan"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none min-h-[44px]"
            />
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter status"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none min-h-[44px]"
          >
            <option value="semua">Semua Status</option>
            <option value="menunggu">Menunggu</option>
            <option value="tervalidasi">Tervalidasi</option>
            <option value="ditolak">Ditolak</option>
          </select>

          <select
            value={kecamatan}
            onChange={(e) => setKecamatan(e.target.value)}
            aria-label="Filter kecamatan"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none min-h-[44px]"
          >
            <option value="semua">Semua Kecamatan</option>
            {kecamatanOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Tanggal dari"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none min-h-[44px]"
            />
            <span className="text-gray-400 text-sm">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Tanggal sampai"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {reports.length === 0 ? 'Belum ada laporan' : 'Tidak ada laporan yang cocok'}
            </h3>
            <p className="text-gray-500">
              {reports.length === 0
                ? 'Laporan muncul di sini setelah scan atau laporan manual di halaman Scan.'
                : 'Coba ubah kata kunci atau filter.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3 font-semibold">Tanggal</th>
                    <th className="px-4 py-3 font-semibold">ID Lahan</th>
                    <th className="px-4 py-3 font-semibold">Kecamatan</th>
                    <th className="px-4 py-3 font-semibold">Hasil AI</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((r) => {
                    const info = r.ai_status ? AI_STATUS_INFO[r.ai_status as AiStatus] : null
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.server_created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[160px]">{r.lahan?.name || '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">#{r.lahan?.id?.slice(0, 8) || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.district || '—'}</td>
                        <td className="px-4 py-3">
                          {info ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${info.badgeClass}`}>
                              {info.label}
                              {r.ai_confidence != null && ` · ${formatConfidence(r.ai_confidence)}`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge report={r} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelected(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#2E7D32] hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Eye size={15} aria-hidden="true" /> Detail
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-600 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Detail */}
      <Dialog.Root open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-5">
            {selected && (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {selected.lahan?.name || 'Lahan tidak diketahui'}
                    </Dialog.Title>
                    <Dialog.Description className="text-xs text-gray-400 font-mono">
                      #{selected.id.slice(0, 8)}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="p-2 -m-1 text-gray-400 hover:text-gray-600 rounded-lg" aria-label="Tutup">
                      <X size={20} />
                    </button>
                  </Dialog.Close>
                </div>

                {selected.photo_urls.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.photo_urls[0]} alt="Foto laporan" className="w-full h-48 object-cover rounded-xl mb-4" />
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-xl mb-4 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-gray-400" aria-hidden="true" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Hasil AI</p>
                    {selected.ai_status ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AI_STATUS_INFO[selected.ai_status as AiStatus].badgeClass}`}>
                        {AI_STATUS_INFO[selected.ai_status as AiStatus].label}
                        {selected.ai_confidence != null && ` · ${formatConfidence(selected.ai_confidence)}`}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-600">Laporan manual</span>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Kerusakan</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {selected.ai_damage_pct != null ? `${Math.round(selected.ai_damage_pct)}%` : '—'}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Kecamatan</p>
                    <p className="text-sm text-gray-900">{selected.district || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Waktu</p>
                    <p className="text-sm text-gray-900">{formatDateTime(selected.server_created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                  <MapPin size={14} aria-hidden="true" />
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Status Verifikasi</p>
                    <StatusBadge report={selected} />
                  </div>
                  {selected.verification_note && (
                    <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                      {selected.verification_note}
                    </p>
                  )}
                </div>

                {selected.ai_status && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-xs font-semibold text-[#2E7D32] mb-1 flex items-center gap-1.5">
                      <AlertCircle size={14} aria-hidden="true" /> Rekomendasi
                    </p>
                    <p className="text-xs text-green-800">
                      {AI_STATUS_INFO[selected.ai_status as AiStatus].recommendation}
                    </p>
                  </div>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
