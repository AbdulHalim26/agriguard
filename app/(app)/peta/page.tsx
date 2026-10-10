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
import { getPetaData, type PetaData, type PetaReport } from './actions'
import { AI_STATUS_INFO, formatConfidence } from '@/lib/recommendations'

const PetaMap = dynamic(() => import('./PetaMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[70vh] flex items-center justify-center bg-gray-100 text-sm text-gray-400">
      Memuat peta...
    </div>
  ),
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
  const [selected, setSelected] = useState<PetaReport | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getPetaData()
    if (res.error) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Peta Lahan & Laporan</h1>
        <p className="text-gray-500 mt-1">
          Area hijau = lahan Anda; pin warna mengikuti hasil AI. Klik pin untuk detail.
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
            onSelectReport={setSelected}
          />
          <div className="p-4 border-t border-gray-200 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-green-600 rounded-full" aria-hidden="true" />
              Aman
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-600 rounded-full" aria-hidden="true" />
              Rusak Ringan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-600 rounded-full" aria-hidden="true" />
              Rusak Berat
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-gray-500 rounded-full" aria-hidden="true" />
              Manual
            </span>
            <span className="ml-auto">{data.reports.length} laporan · {data.lahan.length} lahan</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada data peta</h3>
          <p className="text-gray-500">Tambahkan lahan dan buat laporan untuk melihat peta.</p>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Detail laporan"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900">Detail Laporan</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Tutup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <PhotoWithFallback src={selected.photo_url} alt="Foto laporan" />

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
                <p className="text-xs text-gray-500">Waktu</p>
                <p className="font-medium text-gray-900 flex items-center gap-1">
                  <Clock size={14} className="text-gray-400" aria-hidden="true" />
                  {formatDateTime(selected.server_created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Hasil AI</p>
                {selected.ai_status ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${AI_STATUS_INFO[selected.ai_status].badgeClass}`}
                  >
                    {AI_STATUS_INFO[selected.ai_status].label}
                    {selected.ai_confidence != null &&
                      ` · ${formatConfidence(selected.ai_confidence)}`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
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
                <p className="text-xs text-gray-500">Verifikasi</p>
                {selected.is_verified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Tervalidasi
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                    <AlertTriangle size={14} aria-hidden="true" />
                    Menunggu verifikasi
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}