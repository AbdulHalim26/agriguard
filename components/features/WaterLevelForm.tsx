'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, Droplets } from 'lucide-react'
import { upsertWaterLevel, listWaterLevels, WaterLevelData } from './water-actions'

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
  const [success, setSuccess] = useState(false)
  const [waterLevels, setWaterLevels] = useState<WaterLevelData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWaterLevels = async () => {
    try {
      const result = await listWaterLevels()
      if (result.data) {
        setWaterLevels(result.data)
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false)
    }
  }

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

    setSubmitting(true)

    try {
      const result = await upsertWaterLevel({
        district,
        river_level_m: parseFloat(riverLevel),
      })

      if (result.error) {
        throw new Error(result.error)
      }

      setRiverLevel('')
      setSuccess(true)
      fetchWaterLevels()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  // Fetch on mount
  if (typeof window !== 'undefined') {
    fetchWaterLevels()
  }

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

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
            ))}
          </div>
        ) : waterLevels.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Droplets size={32} className="mx-auto text-gray-300 mb-2" aria-hidden="true" />
            <p>Belum ada data tinggi air</p>
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
                    Diupdate: {new Date(wl.updated_at).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">{wl.river_level_m.toFixed(2)} m</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}