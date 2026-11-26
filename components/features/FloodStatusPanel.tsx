'use client'

import Link from 'next/link'
import { Camera, CheckCircle, AlertTriangle, AlertCircle, RotateCcw, CloudRain, Droplets, HelpCircle, Clock } from 'lucide-react'
import { formatEwsValue, formatWib, QUALITY_LABELS } from '@/lib/ews/data'
import { unavailableAssessment, type FloodAssessment } from '@/lib/ews/assessment'
import { RAIN_THRESHOLD_WASPADA_MM, WATER_LEVEL_THRESHOLD_BAHAYA_M, STATUS_CONFIG } from '@/lib/thresholds'

const ICONS = { 'check-circle': CheckCircle, 'alert-triangle': AlertTriangle, 'alert-circle': AlertCircle,
  'help-circle': HelpCircle, clock: Clock }

export default function FloodStatusPanel({ data, loading, error, offline = false, refresh, showScanCta = true, hideUnsupportedHydrology = false, compactFarmer = false }: {
  data: FloodAssessment | null; loading: boolean; error: string | null; offline?: boolean
  refresh: (simulation?: boolean) => void; showScanCta?: boolean; hideUnsupportedHydrology?: boolean; compactFarmer?: boolean
}) {
  if (loading) return <div className="rounded-2xl bg-slate-100 p-5 text-slate-700" role="status" aria-live="polite">
    <p className="font-semibold text-sm">Memperbarui indikator banjir…</p>
    <p className="text-xs mt-1">Menunggu penilaian server; kondisi aman belum dapat disimpulkan.</p>
  </div>
  if (error || offline) data = unavailableAssessment(data, error || 'Sedang offline. Perbarui penilaian server.', data?.status === 'stale')
  const status = data?.status ?? 'unknown'
  const style = data?.simulation ? STATUS_CONFIG.unknown : STATUS_CONFIG[status]
  const Icon = data ? ICONS[data.icon] : HelpCircle
  const coords = data?.sources.weather.context.coordinates
  const allIndicators = data ? [
    { label: 'Prakiraan hujan · periode 3 jam', source: data.sources.weather, icon: CloudRain,
      warn: data.sources.weather.quality === 'VALID' && data.sources.weather.value! >= RAIN_THRESHOLD_WASPADA_MM },
    { label: 'Laporan tinggi air', source: data.sources.water, icon: Droplets,
      warn: data.sources.water.quality === 'VALID' && data.sources.water.value! >= WATER_LEVEL_THRESHOLD_BAHAYA_M },
  ] : []
  const indicators = hideUnsupportedHydrology && !data?.simulation
    ? allIndicators.filter((item) => item.source.quality === 'VALID')
    : allIndicators
  const hasVerifiedHydrology = data?.sources.water.quality === 'VALID'

  if (compactFarmer && !data?.simulation && !hasVerifiedHydrology) {
    return (
      <section
        className={`rounded-2xl ${style.bannerClass} text-white p-4 sm:p-5 shadow-sm`}
        aria-label="Indikator peringatan dini banjir"
        data-assessment-context={data?.context_id}
        data-risk-status={status}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0" aria-live="polite">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Icon size={22} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold">Indikator risiko banjir (terpisah dari cuaca BMKG)</p>
              <h2 className="text-lg sm:text-xl font-bold">{data?.label || 'BELUM DIKETAHUI'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/40 hover:bg-white/15 text-xs font-medium"
            >
              <RotateCcw size={14} aria-hidden="true" />
              {error ? 'Coba Lagi' : 'Perbarui'}
            </button>
            {data?.demo_available && (
              <button
                type="button"
                onClick={() => refresh(!data.simulation)}
                className="px-3 py-2 rounded-lg border border-white/40 hover:bg-white/15 text-xs font-medium"
              >
                Lihat Simulasi EWS
              </button>
            )}
          </div>
        </div>
        <p className="mt-2.5 text-xs sm:text-sm text-white/90">
          {offline
            ? 'Sedang offline — kondisi aman banjir belum dapat disimpulkan.'
            : 'Data hidrologi/tinggi air terverifikasi untuk lahan belum tersedia. Kondisi aman banjir belum dapat disimpulkan.'}
        </p>
      </section>
    )
  }
  return <section className={`rounded-2xl ${style.bannerClass} text-white p-5 sm:p-8 shadow-lg`}
    aria-label="Indikator peringatan dini banjir" data-assessment-context={data?.context_id} data-risk-status={status}>
    <div className="flex items-center gap-4" aria-live="polite">
      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"><Icon size={32} aria-hidden="true" /></div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-white/80 font-semibold">Indikator risiko banjir</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold">{data?.simulation ? 'SIMULASI' : data?.label || 'BELUM DIKETAHUI'}</h2>
      </div>
    </div>
    <p className="mt-3 text-sm text-white/95">{error || data?.description || 'Data cuaca dan tinggi air belum dapat dimuat. Kondisi aman belum dapat disimpulkan.'}</p>
    {data?.simulation && <p className="mt-3 border border-white/40 rounded-lg p-3 text-sm font-semibold">
      {data.simulation.label}. Angka contoh tidak digunakan untuk menyatakan risiko nyata.
    </p>}
    {offline && <p className="mt-2 text-sm font-semibold">Offline — informasi terakhir hanya sebagai riwayat.</p>}
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {indicators.map(({ label, source, icon: SourceIcon, warn }) => <div key={source.kind}
        className={`rounded-xl px-4 py-3 bg-white/10 ${warn ? 'ring-2 ring-white/70' : ''}`}>
        <p className="flex items-center gap-2 text-sm"><SourceIcon size={16} aria-hidden="true" />{label}</p>
        <p className="mt-2 text-2xl font-bold break-words">{formatEwsValue(source.value, source.unit)} <span className="text-sm font-normal">{source.unit}</span></p>
        <p className="text-xs font-semibold mt-1">{QUALITY_LABELS[source.quality]}{source.quality === 'STALE' && source.value !== null ? ' — nilai terakhir' : ''}</p>
        <p className="text-xs leading-relaxed mt-2">{source.reason}</p>
        {source.kind === 'FORECAST' ? <div className="text-xs mt-2 space-y-1">
          <p>Sumber: {source.quality === 'MOCK' ? 'SIMULASI' : 'OpenWeather · prakiraan'}</p>
          <p>Periode: {formatWib(source.valid_from)} — {formatWib(source.valid_until)}</p>
          <p>Diterima server: {formatWib(source.retrieved_at)}</p>
          <p>Waktu produksi: tidak disediakan provider.</p>
        </div> : <div className="text-xs mt-2 space-y-1">
          <p>Sumber: {source.quality === 'MOCK' ? 'SIMULASI' : 'Laporan manual PPL/Dinas'} · {source.context.district || 'Kecamatan belum tersedia'}</p>
          <p>Dicatat server: {formatWib(source.recorded_at)}</p>
          <p>Diperiksa server: {formatWib(source.retrieved_at)}</p>
          <p>Waktu sensor/pengukuran terpisah: belum tersedia.</p>
        </div>}
      </div>)}
    </div>
    {data && <div className="mt-4 text-xs leading-relaxed text-white/90 space-y-1">
      <p>Lokasi cuaca: {data.location_source === 'device' ? 'snapshot GPS perangkat' : data.location_source === 'default' ? 'default pusat Karawang' : 'tidak valid'}
        {coords ? ` (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})` : ''}.</p>
      <p>Cuaca lokasi ini dan air kecamatan Poktan belum merupakan penilaian per bidang sawah.</p>
      <p>Dinilai server: {formatWib(data.evaluated_at)} · Aturan {data.policy.version}.</p>
      <p>Batas umur sementara: cuaca {data.policy.weather_max_age_ms / 60_000} menit; air {data.policy.water_max_age_ms / 60_000} menit. Perlu konfirmasi operasional.</p>
    </div>}
    <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-3">
      <button type="button" onClick={() => refresh()} className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-xl border border-white/50 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <RotateCcw size={18} aria-hidden="true" />{error ? 'Coba Lagi' : 'Perbarui Data'}
      </button>
      {data?.demo_available && <button type="button" onClick={() => refresh(!data.simulation)}
        className="min-h-[48px] px-4 py-3 rounded-xl border border-white/50 hover:bg-white/15">
        {data.simulation ? 'Kembali ke Data Nyata' : 'Lihat Simulasi EWS'}
      </button>}
      {showScanCta && <Link href="/scan" className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-white text-slate-800 font-bold rounded-xl hover:bg-slate-100">
        <Camera size={20} aria-hidden="true" />SCAN KERUSAKAN SAWAH (AI)
      </Link>}
    </div>
  </section>
}
