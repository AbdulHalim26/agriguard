'use client'

import { useState, useEffect } from 'react'
import { Trash2, Edit2, MapPin, Calculator, RotateCcw } from 'lucide-react'
import { LahanWithPolygon } from './actions'

function formatDateOnly(value: string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface LahanListProps {
  initialData?: LahanWithPolygon[]
}

export default function LahanList({ initialData = [] }: LahanListProps) {
  const [lahan, setLahan] = useState<LahanWithPolygon[]>(initialData)
  const [loading, setLoading] = useState(!initialData.length)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialData.length) {
      fetchLahan()
    }
  }, [initialData.length])

  const fetchLahan = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lahan')
      if (!res.ok) throw new Error('Gagal memuat lahan')
      const data = await res.json()
      setLahan(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus lahan ini? Tindakan tidak bisa dibatalkan.')) return

    try {
      const res = await fetch(`/api/lahan/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus lahan')
      setLahan(lahan.filter(l => l.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  const calculateArea = (polygon: number[][]): number => {
    if (polygon.length < 3) return 0
    let area = 0
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length
      area += polygon[i][0] * polygon[j][1]
      area -= polygon[j][0] * polygon[i][1]
    }
    return Math.abs(area) / 2 * 111000 * 111000 / 10000
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  if (lahan.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <MapPin className="mx-auto text-gray-300 mb-3" size={48} aria-hidden="true" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada data lahan</h3>
        <p className="text-gray-500 mb-4">
          Anda belum mendaftarkan sawah. Tambahkan lahan pertama lewat formulir di atas.
        </p>
        {error && (
          <>
            <p className="text-sm text-red-600 mb-3" role="alert">
              {error}
            </p>
            <button
              onClick={fetchLahan}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Coba Lagi
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Daftar Lahan ({lahan.length})</h2>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lahan.map(item => (
          <div key={item.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingId(item.id)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    aria-label="Edit lahan"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    aria-label="Hapus lahan"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                <span className="flex items-center gap-1">
                  <Calculator size={14} />
                  {item.area_hectares.toFixed(2)} Ha
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {item.polygon.length} titik
                </span>
              </div>
              <div className="text-xs text-gray-400">
                Dibuat: {item.created_at ? formatDateOnly(item.created_at) : '—'}
              </div>
            </div>
            {editingId === item.id && (
              <LahanEditForm
                lahan={item}
                onClose={() => setEditingId(null)}
                onSave={fetchLahan}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface LahanEditFormProps {
  lahan: LahanWithPolygon
  onClose: () => void
  onSave: () => void
}

function LahanEditForm({ lahan, onClose, onSave }: LahanEditFormProps) {
  const [name, setName] = useState(lahan.name)
  const [area, setArea] = useState(lahan.area_hectares.toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Nama lahan wajib diisi')
      return
    }
    if (!area || parseFloat(area) <= 0) {
      setError('Luas harus lebih dari 0')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/lahan/${lahan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), area_hectares: parseFloat(area) }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Gagal memperbarui lahan')
      }

      onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lahan</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder="Nama lahan"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Luas (Hektar)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={area}
          onChange={e => setArea(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder="0.75"
        />
      </div>
      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Batal
        </button>
      </div>
    </div>
  )
}