'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FileText,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  ImageOff,
  X,
  ShieldCheck,
  XCircle,
  StickyNote,
} from 'lucide-react'
import {
  listVerificationReports,
  setVerification,
  type VerificationReport,
} from '@/app/(app)/verifikasi/verification-actions'
import { AI_STATUS_INFO, formatConfidence } from '@/lib/recommendations'

type Filter = 'all' | 'pending' | 'verified'

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

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'verified', label: 'Tervalidasi' },
]

export default function ReportVerification() {
  const [reports, setReports] = useState<VerificationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<VerificationReport | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await listVerificationReports()
    if (res.error) {
      setError(res.error)
    } else {
      setReports(res.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const filtered = reports.filter((r) => {
    if (filter === 'pending') return !r.is_verified
    if (filter === 'verified') return r.is_verified
    return true
  })

  const openModal = (report: VerificationReport) => {
    setSelected(report)
    setNote(report.verification_note ?? '')
    setActionError(null)
  }

  const handleAction = async (isVerified: boolean) => {
    if (!selected) return
    setActing(true)
    setActionError(null)
    const res = await setVerification({
      reportId: selected.id,
      isVerified,
      note: note || null,
    })
    setActing(false)

    if (res.error) {
      setActionError(res.error)
      return
    }

    setMessage(isVerified ? 'Laporan disetujui.' : 'Laporan ditolak.')
    setSelected(null)
    fetchReports()
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm" role="alert">
          {message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === f.key
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm transition-colors"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          Perbarui
        </button>
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
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-medium text-gray-900 mb-1">Tidak ada laporan</h3>
          <p className="text-sm text-gray-500">
            Laporan dari petani binaan akan muncul di sini dan menunggu verifikasi Anda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => {
            const info = report.ai_status ? AI_STATUS_INFO[report.ai_status] : null
            return (
              <button
                key={report.id}
                onClick={() => openModal(report)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors"
              >
                <div className="flex gap-3">
                  {report.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={report.photo_url}
                      alt="Foto laporan"
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-gray-400" aria-hidden="true" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">
                        {report.lahan_name || 'Lahan tidak diketahui'}
                      </span>
                      {info && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.badgeClass}`}
                        >
                          {info.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {report.owner_name || 'Petani'} · {formatDateTime(report.server_created_at)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {report.is_verified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          Tervalidasi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock size={12} aria-hidden="true" />
                          Menunggu
                        </span>
                      )}
                      {report.ai_confidence != null && info && (
                        <span className="text-xs text-gray-500">
                          AI {formatConfidence(report.ai_confidence)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Verifikasi laporan"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900">Verifikasi Laporan</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Tutup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {selected.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.photo_url}
                alt="Foto laporan"
                className="w-full h-44 object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-44 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400">
                <ImageOff className="w-8 h-8 mb-2" aria-hidden="true" />
                <span className="text-xs">Tidak ada foto tersedia</span>
              </div>
            )}

            <div className="mt-4 space-y-2.5 text-sm">
              <div>
                <p className="text-xs text-gray-500">Petani</p>
                <p className="font-medium text-gray-900">{selected.owner_name || 'Petani'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Lahan</p>
                <p className="font-medium text-gray-900">{selected.lahan_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Koordinat</p>
                <p className="font-medium text-gray-900">
                  {Number(selected.latitude).toFixed(6)}, {Number(selected.longitude).toFixed(6)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Hasil AI</p>
                {selected.ai_status ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${AI_STATUS_INFO[selected.ai_status].badgeClass}`}
                  >
                    {AI_STATUS_INFO[selected.ai_status].label}
                    {selected.ai_confidence != null &&
                      ` · ${formatConfidence(selected.ai_confidence)}`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    Manual
                  </span>
                )}
                {selected.ai_damage_pct != null && (
                  <p className="text-xs text-gray-500 mt-1">
                    Kerusakan {Math.round(selected.ai_damage_pct)}%
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Waktu Laporan</p>
                <p className="font-medium text-gray-900">
                  {formatDateTime(selected.server_created_at)}
                </p>
              </div>
              {selected.is_verified && (
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium text-green-700">
                    Tervalidasi {selected.verifier_name ? `oleh ${selected.verifier_name}` : ''} ·{' '}
                    {formatDateTime(selected.verified_at)}
                  </p>
                </div>
              )}
            </div>

            <label className="block mt-4">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                <StickyNote size={14} aria-hidden="true" />
                Catatan Verifikasi
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Catatan untuk petani (opsional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
              />
            </label>

            {actionError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => handleAction(false)}
                disabled={acting}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {acting ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle size={16} aria-hidden="true" />
                )}
                Tolak
              </button>
              <button
                onClick={() => handleAction(true)}
                disabled={acting}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {acting ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={16} aria-hidden="true" />
                )}
                Setujui
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}