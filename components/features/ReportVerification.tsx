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
import AdvisoryAssessment from './AdvisoryAssessment'
import { INSURANCE_NOTICE, reportAdvisory, UNKNOWN_AFFECTED_AREA_LABEL } from '@/lib/reports/advisory'
import { formatHectares } from '@/lib/reports/area'
import {
  GALLERY_LOCATION_WARNING,
  PHOTO_EVIDENCE_DISCLAIMER,
  captureSourceLabel,
  formatWibTimestamp,
  locationStatusLabel,
} from '@/lib/reports/photo-evidence'

function geofenceStatusLabel(status?: VerificationReport['geofence_status']): { label: string; tone: string } {
  if (status === 'INSIDE') return { label: 'Di Dalam Batas Lahan', tone: 'bg-green-100 text-green-800' }
  if (status === 'BOUNDARY') return { label: 'Di Tepi Batas Lahan', tone: 'bg-emerald-100 text-emerald-800' }
  if (status === 'OUTSIDE') return { label: 'Di Luar Batas Lahan', tone: 'bg-red-100 text-red-800' }
  if (status === 'INVALID_GEOMETRY') return { label: 'Geometri Lahan Tidak Valid', tone: 'bg-amber-100 text-amber-800' }
  if (status === 'INVALID_POINT') return { label: 'Titik Koordinat Tidak Valid', tone: 'bg-red-100 text-red-800' }
  return { label: 'Belum Diperiksa', tone: 'bg-slate-100 text-slate-700' }
}

type Filter = 'all' | 'pending' | 'done'

function isFinalized(r: Pick<VerificationReport, 'is_verified' | 'verified_at'>): boolean {
  return r.is_verified || r.verified_at != null
}

function finalStatus(r: VerificationReport): 'verified' | 'rejected' | 'pending' {
  if (r.is_verified) return 'verified'
  if (r.verified_at != null) return 'rejected'
  return 'pending'
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

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'done', label: 'Selesai' },
]

export default function ReportVerification() {
  const [reports, setReports] = useState<VerificationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<VerificationReport | null>(null)
  const [photoTab, setPhotoTab] = useState<'original' | 'watermarked'>('watermarked')
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listVerificationReports()
      if (res.error) {
        setError(res.error)
      } else {
        setReports(res.data || [])
      }
    } catch (err) {
      console.error('[verifikasi] gagal memuat (offline?):', err)
      setError('Koneksi terputus. Daftar laporan akan muncul kembali saat online.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const filtered = reports.filter((r) => {
    if (filter === 'pending') return !isFinalized(r)
    if (filter === 'done') return isFinalized(r)
    return true
  })

  const openModal = (report: VerificationReport) => {
    setSelected(report)
    setPhotoTab(report.watermarked_photo_url ? 'watermarked' : 'original')
    setNote(report.verification_note ?? '')
    setActionError(null)
  }

  const handleAction = async (isVerified: boolean) => {
    if (!selected) return
    setActing(true)
    setActionError(null)
    try {
      const res = await setVerification({
        reportId: selected.id,
        isVerified,
        note: note || null,
      })

      if (res.error) {
        setActionError(res.error)
        return
      }

      setMessage(isVerified ? 'Laporan terverifikasi PPL/Dinas. Ini bukan persetujuan klaim.' : 'Laporan ditolak PPL/Dinas. Ini bukan keputusan penanggung asuransi.')
      setSelected(null)
      fetchReports()
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setActionError('Koneksi verifikasi terputus. Muat ulang daftar laporan untuk memeriksa status sebelum mencoba kembali.')
    } finally {
      setActing(false)
    }
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
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {report.owner_name || 'Petani'} · {formatDateTime(report.server_created_at)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {finalStatus(report) === 'verified' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          Laporan Terverifikasi
                        </span>
                      ) : finalStatus(report) === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle size={12} aria-hidden="true" />
                          Laporan Ditolak
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock size={12} aria-hidden="true" />
                          Menunggu
                        </span>
                      )}
                    </div>
                    <div className="mt-3"><AdvisoryAssessment assessment={reportAdvisory(report)} compact /></div>
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
          aria-label={finalStatus(selected) === 'pending' ? 'Verifikasi laporan' : 'Detail laporan'}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900">
                {finalStatus(selected) === 'pending' ? 'Verifikasi Laporan' : 'Detail Laporan'}
              </h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Tutup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {selected.photo_url ? (
              <div className="space-y-2">
                {selected.watermarked_photo_url && (
                  <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPhotoTab('watermarked')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        photoTab === 'watermarked' ? 'bg-green-600 text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Salinan Watermark
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoTab('original')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        photoTab === 'original' ? 'bg-green-600 text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Foto Asli
                    </button>
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoTab === 'watermarked' && selected.watermarked_photo_url ? selected.watermarked_photo_url : selected.photo_url}
                  alt={photoTab === 'watermarked' && selected.watermarked_photo_url ? 'Salinan foto dengan watermark GPS' : 'Foto asli laporan'}
                  className="w-full h-56 object-contain rounded-lg bg-slate-950"
                />
              </div>
            ) : (
              <div className="w-full h-44 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400">
                <ImageOff className="w-8 h-8 mb-2" aria-hidden="true" />
                <span className="text-xs">Tidak ada foto tersedia</span>
              </div>
            )}

            {/* Panel Pemeriksaan Bukti Foto & Lokasi (PPL/Dinas) */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="font-semibold text-slate-900">Pemeriksaan Bukti Foto & Lokasi</p>
                <span className={`px-2 py-0.5 rounded-full font-medium ${geofenceStatusLabel(selected.geofence_status).tone}`}>
                  {geofenceStatusLabel(selected.geofence_status).label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-medium">
                  {captureSourceLabel(selected.photo_evidence?.capture_source)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                  {locationStatusLabel(selected.photo_evidence?.location_status, selected.photo_evidence?.capture_source)}
                </span>
                {selected.photo_evidence?.submitted_offline && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                    Dikirim Offline
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                <div>
                  <span className="text-slate-500 block">Koordinat Laporan</span>
                  <span className="font-mono font-medium">
                    {Number(selected.latitude).toFixed(6)}, {Number(selected.longitude).toFixed(6)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Akurasi GPS saat Capture</span>
                  <span className="font-mono font-medium">
                    {selected.photo_evidence?.gps_snapshot?.accuracy_m != null
                      ? `±${Math.round(selected.photo_evidence.gps_snapshot.accuracy_m)} m`
                      : 'Tidak tersedia'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Waktu Foto (Perangkat)</span>
                  <span className="font-mono">
                    {formatWibTimestamp(selected.photo_evidence?.device_captured_at ?? selected.client_created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Waktu Diterima Server</span>
                  <span className="font-mono">
                    {formatWibTimestamp(selected.photo_evidence?.server_received_at ?? selected.server_created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">SHA-256 Foto Asli</span>
                  <span className="font-mono break-all">
                    {(selected.photo_evidence?.original_photo_sha256 ?? selected.photo_hash ?? 'Tidak tersedia').slice(0, 24)}
                    {(selected.photo_evidence?.original_photo_sha256 ?? selected.photo_hash) ? '…' : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">SHA-256 Salinan Watermark</span>
                  <span className="font-mono break-all">
                    {selected.photo_evidence?.watermarked_photo_sha256
                      ? `${selected.photo_evidence.watermarked_photo_sha256.slice(0, 24)}…`
                      : 'Tidak tersedia'}
                  </span>
                </div>
              </div>
              {selected.photo_evidence?.capture_source === 'gallery_upload' && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 leading-relaxed">
                  {GALLERY_LOCATION_WARNING}
                </p>
              )}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {selected.photo_evidence?.authenticity_note ?? PHOTO_EVIDENCE_DISCLAIMER}
              </p>
            </div>

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
                <AdvisoryAssessment assessment={reportAdvisory(selected)} technical />
              </div>
              <div>
                <p className="text-xs text-gray-500">Luas Terdaftar Lahan (bukan luas rusak)</p>
                <p>{formatHectares(selected.lahan_area_hectares)}</p>
                <p className="text-xs text-slate-600">{UNKNOWN_AFFECTED_AREA_LABEL}.</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Waktu Laporan</p>
                <p className="font-medium text-gray-900">
                  {formatDateTime(selected.server_created_at)}
                </p>
              </div>
              {finalStatus(selected) !== 'pending' && (
                <div>
                  <p className="text-xs text-gray-500">Verifikasi Laporan Final</p>
                  {finalStatus(selected) === 'verified' ? (
                    <p className="font-medium text-green-700">
                      <CheckCircle2 size={14} className="inline mr-1" aria-hidden="true" />
                      Laporan Terverifikasi{selected.verifier_name ? ` oleh ${selected.verifier_name}` : ''} ·{' '}
                      {formatDateTime(selected.verified_at)}
                    </p>
                  ) : (
                    <p className="font-medium text-red-700">
                      <XCircle size={14} className="inline mr-1" aria-hidden="true" />
                      Laporan Ditolak{selected.verifier_name ? ` oleh ${selected.verifier_name}` : ''} ·{' '}
                      {formatDateTime(selected.verified_at)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 mt-4">{INSURANCE_NOTICE}</p>
            {finalStatus(selected) === 'pending' ? (
              <>
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
                    Tolak Laporan
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
                    Verifikasi Laporan
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <StickyNote size={14} aria-hidden="true" />
                  Catatan
                </p>
                <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
                  {selected.verification_note || 'Tidak ada catatan'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Verifikasi laporan final — aksi tidak tersedia lagi untuk laporan ini. Keputusan klaim tetap terpisah pada penanggung.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
