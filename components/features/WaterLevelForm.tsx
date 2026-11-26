'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, Droplets } from 'lucide-react'
import { upsertWaterLevel, listWaterLevels, WaterLevelData } from './water-actions'
import { formatEwsValue, formatWib, QUALITY_LABELS } from '@/lib/ews/data'
import { useFloodAssessment } from './FloodAssessmentProvider'

const KARAWANG_DISTRICTS = [
  'Telukjambe Timur',
  'Telukjambe Barat',
  'Karawang Barat',
  'Karawang Timur',
  'Lemahabang',
  'Cikampek',
  'Rawamerta',
  'Kedungwaringin',
  'Pangkalan',
  'Tirtajaya',
  'Ciampel',
  'Kutawaluya',
  'Batujaya',
  'Pakisjaya',
  'Cilamaya Kulon',
  'Cilamaya Wetan',
  'Rengasdengklok',
  'Tempuran',
  'Klari',
  'Jayakerta',
]

export default function WaterLevelForm() {
  const [district, setDistrict] = useState('')
  const [riverLevel, setRiverLevel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [waterLevels, setWaterLevels] = useState<WaterLevelData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentReading, setCurrentReading] = useState(false)
  const generation = useRef(0)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const assessment = useFloodAssessment()

  const expireRows = useCallback(() => setWaterLevels((rows) => rows.map((row) => ({ ...row,
    source_detail: row.source_detail.quality === 'VALID' ? { ...row.source_detail, quality: 'STALE',
      reason: 'Penilaian daftar air perlu diperbarui; nilai ini hanya riwayat.' } : row.source_detail,
  }))), [])
  const fetchWaterLevels = useCallback(async () => {
    const version = ++generation.current
    const started = performance.now()
    clearTimeout(expiryTimer.current)
    setLoading(true)
    try {
      const result = await listWaterLevels()
      if (version !== generation.current) return
      if (result.error) throw new Error(result.error)
      setListError(null)
      if (result.data) {
        setWaterLevels(result.data)
        const remaining = result.valid_for_ms - (performance.now() - started)
        if (remaining > 0) expiryTimer.current = setTimeout(expireRows, remaining)
        else expireRows()
      }
    } catch {
      if (version === generation.current) { expireRows(); setListError('Daftar tinggi air belum dapat dimuat. Coba lagi saat online.') }
    } finally {
      if (version === generation.current) setLoading(false)
    }
  }, [expireRows])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!district) {
      setError('Pilih kecamatan')
      return
    }
    if (!riverLevel || parseFloat(riverLevel) < 0) {
      setError('Tinggi air tidak valid')
      return
    }
    if (!currentReading) { setError('Konfirmasi bahwa ini pengukuran terkini, bukan data contoh atau pengukuran lama.'); return }

    setSubmitting(true)

    try {
      const result = await upsertWaterLevel({
        district,
        river_level_m: parseFloat(riverLevel),
        current_reading: currentReading,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      setRiverLevel('')
      setCurrentReading(false)
      setSuccess(true)
      void fetchWaterLevels()
      assessment.refresh()
      window.dispatchEvent(new Event('agriguard:water-level-updated'))
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  // Server evaluates freshness; reconnect/focus/visibility refreshes the list.
  useEffect(() => {
    const refresh = () => { if (navigator.onLine) void fetchWaterLevels(); else expireRows() }
    const offline = () => { generation.current++; clearTimeout(expiryTimer.current); expireRows(); setLoading(false) }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('online', refresh); window.addEventListener('offline', offline)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { generation.current++; clearInterval(timer); clearTimeout(expiryTimer.current)
      window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible) }
  }, [fetchWaterLevels, expireRows])

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Droplets size={20} className="text-blue-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Input Tinggi Air Sungai</h2>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2" role="alert">
          <CheckCircle size={16} />
          Data tinggi air berhasil disimpan!
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4">Kirim hasil pengukuran terkini. Waktu pencatatan berasal dari server, bukan waktu sensor. Data contoh/lama tidak boleh dikonfirmasi sebagai pengukuran baru.</p>
      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label htmlFor="district" className="block text-sm font-medium text-gray-700 mb-1">
            Kecamatan <span className="text-red-500">*</span>
          </label>
          <select
            id="district"
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">-- Pilih Kecamatan --</option>
            {KARAWANG_DISTRICTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="riverLevel" className="block text-sm font-medium text-gray-700 mb-1">
            Tinggi Air (Meter) <span className="text-red-500">*</span>
          </label>
          <input
            id="riverLevel"
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={riverLevel}
            onChange={e => setRiverLevel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Contoh: 1.25"
            required
          />
          <p className="mt-1 text-xs text-gray-500">Tinggi permukaan air sungai dari titik referensi (meter)</p>
        </div>

        <label className="flex gap-3 items-start text-sm text-gray-700 p-3 border rounded-lg">
          <input type="checkbox" checked={currentReading} onChange={(e) => setCurrentReading(e.target.checked)} required className="mt-1 h-5 w-5 shrink-0" />
          Ini pengukuran yang baru saya lakukan saat ini, bukan angka demo atau hasil pengukuran lama.
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Menyimpan...
            </>
          ) : (
            'Simpan Tinggi Air'
          )}
        </button>
      </form>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="font-medium text-gray-900 mb-3">Data Tinggi Air Terbaru</h3>
        {listError && <p className="text-sm text-slate-700 mb-3" role="alert">{listError}</p>}
        <button type="button" onClick={() => void fetchWaterLevels()} disabled={loading} className="min-h-[48px] px-4 py-2 border rounded-lg text-sm mb-3 disabled:opacity-50">Perbarui Daftar</button>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
            ))}
          </div>
        ) : waterLevels.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Droplets size={32} className="mx-auto text-gray-300 mb-2" aria-hidden="true" />
            <p>{listError ? 'Data belum dapat dimuat' : 'Belum ada data tinggi air'}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {waterLevels.map(wl => (
              <div
                key={wl.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div>
                  <p className="font-medium text-gray-900">{wl.district}</p>
                  <p className="text-sm text-gray-500">
                    Dicatat server: {formatWib(wl.updated_at)}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 mt-1">{QUALITY_LABELS[wl.source_detail.quality]}</p>
                  <p className="text-xs text-gray-600 mt-1">{wl.source_detail.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-700">{formatEwsValue(wl.river_level_m, 'm')} m</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
