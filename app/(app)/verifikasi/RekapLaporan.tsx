'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Printer, RefreshCw, Filter } from 'lucide-react'
import {
  listVerificationReports,
  type VerificationReport,
} from '@/app/(app)/verifikasi/verification-actions'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatNumber(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export default function RekapLaporan() {
  const [reports, setReports] = useState<VerificationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [wilayah, setWilayah] = useState('all')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listVerificationReports()
      if (res.error) setError(res.error)
      else setReports(res.data || [])
    } catch {
      setError('Koneksi terputus. Coba lagi saat online.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const wilayahOptions = useMemo(() => {
    const set = new Set<string>()
    reports.forEach((r) => {
      if (r.is_verified && r.district) set.add(r.district)
    })
    return Array.from(set).sort()
  }, [reports])

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : null
    return reports.filter((r) => {
      if (!r.is_verified) return false
      if (wilayah !== 'all' && r.district !== wilayah) return false
      const ts = new Date(r.server_created_at).getTime()
      if (fromTs != null && ts < fromTs) return false
      if (toTs != null && ts > toTs) return false
      return true
    })
  }, [reports, from, to, wilayah])

  const totalLuas = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.lahan_area_hectares || 0), 0),
    [filtered]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, VerificationReport[]>()
    filtered.forEach((r) => {
      const key = r.district || r.village || 'Tanpa Wilayah'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const generatedAt = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      {/* Kontrol filter (tidak tercetak) */}
      <div className="print:hidden bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Filter size={16} aria-hidden="true" />
          Filter Rekap
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <label className="text-sm col-span-2 sm:col-span-1">
            <span className="block text-gray-500 mb-1">Wilayah (kecamatan)</span>
            <select
              value={wilayah}
              onChange={(e) => setWilayah(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            >
              <option value="all">Semua wilayah</option>
              {wilayahOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm transition-colors"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Muat Ulang
            </button>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 bg-[#2E7D32] text-white font-medium rounded-lg hover:bg-[#276b2a] transition-colors"
        >
          <Printer size={18} aria-hidden="true" />
          Cetak / Simpan PDF
        </button>
      </div>

      {error && (
        <div
          className="print:hidden p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="print:hidden space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Printer className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-medium text-gray-900 mb-1">Belum ada data untuk direkap</h3>
          <p className="text-sm text-gray-500">
            Rekap menampilkan laporan yang sudah diverifikasi. Ubah filter atau tunggu verifikasi
            berikutnya.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 print:border-0 print:p-0">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Rekap Laporan Terverifikasi
            </h2>
            <p className="text-sm text-gray-500">
              Dibuat: {generatedAt}
              {from || to
                ? ` · Periode: ${from ? formatDate(from) : '—'} s.d. ${to ? formatDate(to) : '—'}`
                : ''}
              {wilayah !== 'all' ? ` · Wilayah: ${wilayah}` : ''}
            </p>
          </div>

          <div className="space-y-6">
            {grouped.map(([wilayahName, rows]) => {
              const subtotal = rows.reduce(
                (sum, r) => sum + (r.lahan_area_hectares || 0),
                0
              )
              return (
                <div key={wilayahName}>
                  <h3 className="font-semibold text-gray-800 mb-2">{wilayahName}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2 pr-3 font-medium">Tanggal</th>
                          <th className="py-2 pr-3 font-medium">Petani</th>
                          <th className="py-2 pr-3 font-medium">Lahan</th>
                          <th className="py-2 pr-3 font-medium text-right">Luas (ha)</th>
                          <th className="py-2 font-medium">Status Kerusakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {formatDate(r.server_created_at)}
                            </td>
                            <td className="py-2 pr-3">{r.owner_name || 'Petani'}</td>
                            <td className="py-2 pr-3">{r.lahan_name || '—'}</td>
                            <td className="py-2 pr-3 text-right">
                              {r.lahan_area_hectares != null
                                ? formatNumber(r.lahan_area_hectares)
                                : '—'}
                            </td>
                            <td className="py-2">
                              {r.ai_status === 'rusak_berat'
                                ? 'Rusak Berat'
                                : r.ai_status === 'rusak_ringan'
                                  ? 'Rusak Ringan'
                                  : r.ai_status === 'aman'
                                    ? 'Aman'
                                    : 'Manual'}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-medium text-gray-700">
                          <td className="py-2 pr-3" colSpan={3}>
                            Subtotal {wilayahName}
                          </td>
                          <td className="py-2 pr-3 text-right">{formatNumber(subtotal)}</td>
                          <td className="py-2">{rows.length} laporan</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 pt-4 border-t-2 border-gray-300 flex items-center justify-between">
            <span className="font-bold text-gray-900">Total Luas Terdampak</span>
            <span className="font-bold text-[#2E7D32] text-lg">
              {formatNumber(totalLuas)} ha
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Total {filtered.length} laporan terverifikasi
            {wilayah !== 'all' ? ` di ${wilayah}` : ''}.
          </p>
        </div>
      )}
    </div>
  )
}
