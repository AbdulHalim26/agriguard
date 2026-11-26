'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CloudSun, MapPin, Wind, Droplets, RefreshCw, AlertTriangle, Camera, FileText, WifiOff } from 'lucide-react'
import { requestLocation } from '@/lib/location'
import { useOfflineStatus } from '@/lib/offline/status'
import type { BmkgWeatherResponse } from '@/lib/ews/bmkg'
import { formatBmkgWib } from '@/lib/ews/bmkg'

export default function BmkgWeatherCard({ showFarmerActions = true }: { showFarmerActions?: boolean }) {
  const [data, setData] = useState<BmkgWeatherResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const offline = useOfflineStatus()

  const load = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false)
      setError('Sedang offline. Prakiraan cuaca BMKG tidak dapat diperbarui.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const loc = await requestLocation().catch(() => ({ status: 'unavailable' as const, lat: null, lng: null }))
      const qs = new URLSearchParams()
      if (loc.status === 'granted' && loc.lat != null && loc.lng != null) {
        qs.set('lat', String(loc.lat))
        qs.set('lon', String(loc.lng))
      }
      const res = await fetch(`/api/weather/bmkg${qs.toString() ? `?${qs.toString()}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('BMKG_FETCH_FAILED')
      setData((await res.json()) as BmkgWeatherResponse)
    } catch {
      setError('Prakiraan cuaca BMKG belum dapat dimuat. Kondisi aman belum dapat disimpulkan.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section
      aria-label="Prakiraan Cuaca BMKG"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Prakiraan Cuaca BMKG</p>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
            <MapPin size={18} className="text-sky-600 shrink-0" aria-hidden="true" />
            <span>{data?.location_label || (loading ? 'Memeriksa lokasi…' : 'Lokasi belum dapat dipastikan')}</span>
          </h2>
          {data && (
            <p className="text-xs text-slate-600 mt-1">
              Sumber lokasi: <span className="font-medium text-slate-800">{data.location_source_label}</span>
              {data.adm4 ? ` · adm4 ${data.adm4}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Perbarui
        </button>
      </div>

      {offline && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs" role="alert">
          <WifiOff size={15} className="shrink-0" aria-hidden="true" />
          <span>Mode offline — prakiraan terakhir (jika ada) hanya riwayat, bukan kondisi terkini.</span>
        </div>
      )}

      {loading && !data ? (
        <div className="animate-pulse grid sm:grid-cols-3 gap-3">
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
        </div>
      ) : error && !data ? (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700" role="alert">
          {error}
        </div>
      ) : data?.forecast ? (
        <>
          {data.stale && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs" role="alert">
              <strong>Data Lama (STALE):</strong> {data.stale_reason || 'Prakiraan belum diperbarui; bukan kondisi terkini.'}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
              <p className="text-xs text-sky-800 font-medium">Suhu prakiraan</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{data.forecast.temperature_c}°C</p>
              <p className="text-xs text-slate-700 mt-1 flex items-center gap-1.5">
                <CloudSun size={14} className="text-sky-600 shrink-0" aria-hidden="true" />
                {data.forecast.weather_desc}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
              <p className="text-xs text-slate-500 font-medium">Kelembapan & Angin</p>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Droplets size={14} className="text-sky-600" aria-hidden="true" />
                Kelembapan: {data.forecast.humidity_pct}%
              </p>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Wind size={14} className="text-slate-500" aria-hidden="true" />
                Angin: {data.forecast.wind_speed_kmh} km/jam{data.forecast.wind_dir ? ` (${data.forecast.wind_dir})` : ''}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 space-y-1">
              <p><span className="text-slate-500">Periode prakiraan:</span> <strong className="font-mono">{data.forecast.period_wib}</strong></p>
              <p><span className="text-slate-500">Waktu produksi BMKG:</span> <span className="font-mono">{data.forecast.produced_wib}</span></p>
              <p><span className="text-slate-500">Diterima server:</span> <span className="font-mono">{formatBmkgWib(data.retrieved_at)}</span></p>
              <p className="font-semibold text-sky-800 pt-0.5">Sumber: BMKG</p>
            </div>
          </div>

          {data.cap_status === 'ACTIVE_ALERTS' && data.cap_alerts.length > 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3.5 space-y-2" role="alert">
              <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={14} aria-hidden="true" />
                Peringatan Dini Cuaca Aktif (Sumber: BMKG)
              </p>
              {data.cap_alerts.map((alert, idx) => (
                <div key={idx} className="text-xs text-amber-900 space-y-0.5">
                  <p className="font-semibold">{alert.headline} · {alert.area_desc}</p>
                  <p className="text-[11px] text-amber-800">
                    {alert.event} · Tingkat: {alert.severity} / {alert.urgency} ({alert.certainty})
                  </p>
                  <p className="text-[11px] font-mono text-amber-800">
                    Berlaku: {alert.effective_wib} — {alert.expires_wib}
                  </p>
                  <p className="text-amber-900 font-medium">{alert.notice}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {data.cap_status === 'NO_ACTIVE_ALERTS'
                ? 'Tidak ada peringatan dini aktif yang terverifikasi untuk lokasi ini.'
                : 'Status peringatan dini belum tersedia.'}
            </p>
          )}
        </>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">
            {data?.status === 'LOKASI_BELUM_DIVERIFIKASI' ? 'Lokasi Belum Diverifikasi (adm4)' : 'Data Prakiraan Cuaca Tidak Tersedia'}
          </p>
          <p>{data?.stale_reason || 'Prakiraan BMKG belum tersedia untuk lokasi Anda. Tidak menampilkan angka pengganti.'}</p>
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        {data?.disclaimer || 'Prakiraan cuaca 3-jaman dari BMKG (bukan pengukuran real-time di sawah). Risiko banjir dinilai terpisah.'}
      </p>

      {showFarmerActions && (
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <Camera size={16} aria-hidden="true" />
            Scan Kerusakan Sawah (AI)
          </Link>
          <Link
            href="/laporan"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <FileText size={16} aria-hidden="true" />
            Laporan Lahan Saya
          </Link>
        </div>
      )}
    </section>
  )
}
