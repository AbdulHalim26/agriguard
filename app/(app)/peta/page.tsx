'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  MapPin,
  ImageOff,
  Clock,
  ShieldCheck,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { getPetaData, type PetaData, type PetaLahan, type PetaReport } from './actions'
import type { AiStatus } from '@/lib/recommendations'
import MapSkeleton from '@/components/map/MapSkeleton'
import { evidenceLabel } from '@/lib/reports/evidence'
import AdvisoryAssessment from '@/components/features/AdvisoryAssessment'
import { INSURANCE_NOTICE, reportAdvisory, reportVerification, UNKNOWN_AFFECTED_AREA_LABEL } from '@/lib/reports/advisory'
import { formatHectares } from '@/lib/reports/area'

const PetaMap = dynamic(() => import('./PetaMap'), {
  ssr: false,
  loading: () => <MapSkeleton className="h-[70vh]" />,
})

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

function PhotoWithFallback({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="w-full h-44 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400">
        <ImageOff className="w-8 h-8 mb-2" aria-hidden="true" />
        <span className="text-xs">Tidak ada foto tersedia</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-44 object-cover rounded-lg"
      onError={() => setFailed(true)}
    />
  )
}

export default function PetaPage() {
  const [data, setData] = useState<PetaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<PetaReport | null>(null)
  const [selectedLahan, setSelectedLahan] = useState<{ lahan: PetaLahan; status: AiStatus | null } | null>(
    null
  )

  const closePanel = () => {
    setSelectedReport(null)
    setSelectedLahan(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getPetaData()
      if (res.error) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
    } catch (err) {
      console.error('[peta] gagal memuat (offline?):', err)
      setError('Koneksi terputus. Peta akan muncul kembali saat online.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Peta Lahan & Laporan</h1>
        <p className="text-gray-500 mt-1">
          Area menunjukkan batas lahan terdaftar. Pin menunjukkan indikasi pada foto laporan, bukan ukuran kerusakan seluruh bidang. Semua penilaian awal perlu verifikasi.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-[70vh] flex items-center justify-center gap-2 text-gray-500 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          Memuat data peta...
        </div>
      ) : data ? (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <PetaMap
            lahan={data.lahan}
            reports={data.reports}
            onSelectReport={(r) => {
              setSelectedLahan(null)
              setSelectedReport(r)
            }}
            onSelectLahan={(l, s) => {
              setSelectedReport(null)
              setSelectedLahan({ lahan: l, status: s })
            }}
          />
          <div className="p-4 border-t border-gray-200 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-sky-600 rounded-full" aria-hidden="true" />
              Tidak Tampak Kerusakan (Foto)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-600 rounded-full" aria-hidden="true" />
              Indikasi Ringan (Foto)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-600 rounded-full" aria-hidden="true" />
              Indikasi Berat (Foto)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-gray-500 rounded-full" aria-hidden="true" />
              Belum ada penilaian
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-slate-500 rounded-full" aria-hidden="true" />
              Batas lahan, bukan luas terdampak
            </span>
            <span className="ml-auto">Termuat: {data.reports.length} laporan (maks. 200 terbaru) · {data.lahan.length} lahan</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada data peta</h3>
          <p className="text-gray-500">Tambahkan lahan dan buat laporan untuk melihat peta.</p>
        </div>
      )}

      {(selectedReport || selectedLahan) && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 lg:items-start lg:justify-end lg:bg-transparent lg:p-6 lg:pointer-events-none"
          onClick={closePanel}
          role="dialog"
          aria-modal="true"
          aria-label="Detail peta"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto lg:pointer-events-auto lg:shadow-2xl lg:border lg:border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900">
                {selectedReport ? 'Detail Laporan' : 'Detail Lahan'}
              </h3>
              <button
                onClick={closePanel}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Tutup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {selectedReport ? (
              <>
                <PhotoWithFallback src={selectedReport.photo_url} alt="Foto laporan" />
                <p className="text-xs text-gray-500 mt-2">Sumber: {evidenceLabel(selectedReport.evidence_source)}</p>

                <div className="mt-4 space-y-2.5 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Petani</p>
                    <p className="font-medium text-gray-900">{selectedReport.owner_name || 'Petani'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Lahan</p>
                    <p className="font-medium text-gray-900">{selectedReport.lahan_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Koordinat</p>
                    <p className="font-medium text-gray-900">
                      {Number(selectedReport.latitude).toFixed(6)},{' '}
                      {Number(selectedReport.longitude).toFixed(6)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Waktu</p>
                    <p className="font-medium text-gray-900 flex items-center gap-1">
                      <Clock size={14} className="text-gray-400" aria-hidden="true" />
                      {formatDateTime(selectedReport.server_created_at)}
                    </p>
                  </div>
                  <div>
                    <AdvisoryAssessment assessment={reportAdvisory(selectedReport)} technical />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Verifikasi</p>
                    {selectedReport.is_verified ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <ShieldCheck size={14} aria-hidden="true" />
                        Laporan Terverifikasi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        <AlertTriangle size={14} aria-hidden="true" />
                        {reportVerification(selectedReport).label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{INSURANCE_NOTICE}</p>
                </div>
              </>
            ) : selectedLahan ? (
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Lahan</p>
                  <p className="font-medium text-gray-900">{selectedLahan.lahan.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pendaftar Lahan</p>
                  <p className="font-medium text-gray-900">{selectedLahan.lahan.owner_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Luas Terdaftar (bukan luas rusak)</p>
                  <p className="font-medium text-gray-900">
                    {formatHectares(selectedLahan.lahan.area_hectares)}
                  </p>
                  <p className="text-xs text-slate-600">{UNKNOWN_AFFECTED_AREA_LABEL}.</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Penilaian pada Laporan Terbaru</p>
                  {data?.reports.find((r) => r.lahan_id === selectedLahan.lahan.id) ? (
                    <AdvisoryAssessment assessment={reportAdvisory(data.reports.find((r) => r.lahan_id === selectedLahan.lahan.id)!)} compact />
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      Belum ada laporan
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Jumlah Laporan Termuat</p>
                  <p className="font-medium text-gray-900">
                    {data?.reports.filter((r) => r.lahan_id === selectedLahan.lahan.id).length ?? 0}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
