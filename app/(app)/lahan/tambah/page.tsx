'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function TambahLahanPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [polygon, setPolygon] = useState<number[][]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Nama lahan wajib diisi')
      return
    }

    if (!area || parseFloat(area) <= 0) {
      setError('Luas lahan harus lebih dari 0')
      return
    }

    if (polygon.length < 3) {
      setError('Tentukan minimal 3 titik batas lahan di peta')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/lahan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          area_hectares: parseFloat(area),
          polygon,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Gagal menyimpan lahan')
      }

      router.push('/lahan')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan lahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/lahan" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tambah Lahan</h1>
          <p className="text-gray-500 mt-1">Daftarkan sawah Anda ke dalam sistem</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nama Lahan
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Sawah Budi Blok A"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-1">
              Luas (Hektar)
            </label>
            <input
              id="area"
              type="number"
              step="0.01"
              min="0.01"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Contoh: 0.75"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batas Lahan (Peta)
            </label>
            <div className="aspect-video bg-gray-100 rounded-xl border border-gray-200 relative flex items-center justify-center">
              <div className="text-center p-4">
                <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                <p className="text-gray-500 mb-2">Peta interaktif (Leaflet) untuk menentukan polygon lahan</p>
                <p className="text-sm text-gray-400">Klik di peta untuk menambah titik (min. 3 titik)</p>
                <div className="mt-4 text-sm text-gray-600">
                  Titik ditentukan: <span className="font-medium text-green-600">{polygon.length}</span> / 3+
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Gunakan peta untuk menentukan batas-batas sawah Anda. Minimal 3 titik untuk membentuk polygon.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/lahan"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" aria-hidden="true" />
            {loading ? 'Menyimpan...' : 'Simpan Lahan'}
          </button>
        </div>
      </form>
    </div>
  )
}