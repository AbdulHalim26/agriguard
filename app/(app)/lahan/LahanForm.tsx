'use client'

import { useState, useEffect } from 'react'
import { Plus, X, MapPin, AlertCircle, CheckCircle } from 'lucide-react'
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import * as Leaflet from 'leaflet'
import { createLahan } from './actions'

const DEFAULT_CENTER: [number, number] = [-6.312, 107.285]
const DEFAULT_ZOOM = 16

interface MapPolygonEditorProps {
  onPolygonChange: (points: number[][]) => void
  initialPolygon?: number[][]
}

function MapClickHandler({ onClick }: { onClick: (e: Leaflet.LeafletMouseEvent) => void }) {
  useMapEvents({
    click: onClick,
  })
  return null
}

function MapPolygonEditor({ onPolygonChange, initialPolygon }: MapPolygonEditorProps) {
  const [points, setPoints] = useState<number[][]>(initialPolygon || [])

  useEffect(() => {
    if (initialPolygon) {
      setPoints(initialPolygon)
    }
  }, [initialPolygon])

  const handleMapClick = (e: Leaflet.LeafletMouseEvent) => {
    if (points.length >= 50) return
    const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng]
    setPoints(prev => [...prev, [newPoint[1], newPoint[0]]])
  }

  const handleRemovePoint = (index: number) => {
    setPoints(prev => prev.filter((_, i) => i !== index))
  }

  const handlePointDrag = (index: number, e: Leaflet.DragEndEvent) => {
    const newPoints = [...points]
    const latlng = e.target.getLatLng()
    newPoints[index] = [latlng.lng, latlng.lat]
    setPoints(newPoints)
  }

  useEffect(() => {
    onPolygonChange(points)
  }, [points, onPolygonChange])

  return (
    <div className="relative">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-80 w-full rounded-lg border border-gray-300"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onClick={handleMapClick} />
        {points.length > 0 && (
          <>
            <Polygon
              positions={points.map(([lng, lat]) => [lat, lng] as [number, number])}
              pathOptions={{
                color: '#16a34a',
                weight: 2,
                fillColor: '#16a34a',
                fillOpacity: 0.15,
              }}
            />
            {points.map(([lng, lat], index) => (
              <Marker
                key={index}
                position={[lat, lng] as [number, number]}
                draggable
                eventHandlers={{
                  dragend: e => handlePointDrag(index, e),
                }}
              >
                <div className="w-6 h-6 bg-green-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{index + 1}</span>
                </div>
              </Marker>
            ))}
          </>
        )}
      </MapContainer>

      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <MapPin size={14} />
          <span>Klik peta untuk menambah titik. Seret titik untuk memindahkan. Minimal 3 titik.</span>
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {points.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">Belum ada titik. Klik peta untuk memulai.</p>
          ) : (
            points.map(([lng, lat], index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-white rounded border border-gray-200"
              >
                <span className="w-6 h-6 flex items-center justify-center bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-mono text-gray-700">
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </span>
                <button
                  onClick={() => handleRemovePoint(index)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  aria-label={`Hapus titik ${index + 1}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span className={`flex items-center gap-1 ${points.length >= 3 ? 'text-green-600' : 'text-red-600'}`}>
            {points.length >= 3 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {points.length} titik {points.length >= 3 ? '(valid)' : '- minimal 3'}
          </span>
          {points.length > 0 && (
            <span className="flex items-center gap-1">
              Luas ~{calculateArea(points).toFixed(2)} Ha
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function calculateArea(polygon: number[][]): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i][0] * polygon[j][1]
    area -= polygon[j][0] * polygon[i][1]
  }
  return Math.abs(area) / 2 * 111000 * 111000 / 10000
}

export default function LahanForm() {
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [polygon, setPolygon] = useState<number[][]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Nama lahan wajib diisi')
      return
    }
    if (!area || parseFloat(area) <= 0) {
      setError('Luas harus lebih dari 0')
      return
    }
    if (polygon.length < 3) {
      setError('Polygon minimal 3 titik. Klik peta untuk menambah titik.')
      return
    }

    setSubmitting(true)

    try {
      const result = await createLahan({
        name: name.trim(),
        area_hectares: parseFloat(area),
        polygon: polygon as [number, number][],
      })

      if (result.error) {
        throw new Error(result.error)
      }

      setName('')
      setArea('')
      setPolygon([])
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Plus size={20} className="text-green-600" />
        Tambah Lahan Baru
      </h2>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2" role="alert">
          <CheckCircle size={16} />
          Lahan berhasil ditambahkan!
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nama Lahan <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Contoh: Sawah Blok A"
            required
          />
        </div>

        <div>
          <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-1">
            Luas (Hektar) <span className="text-red-500">*</span>
          </label>
          <input
            id="area"
            type="number"
            step="0.01"
            min="0.01"
            value={area}
            onChange={e => setArea(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Contoh: 0.75"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Polygon Lahan <span className="text-red-500">*</span>
          </label>
          <MapPolygonEditor
            onPolygonChange={setPolygon}
            initialPolygon={polygon}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Menyimpan...' : 'Simpan Lahan'}
        </button>
      </form>
    </div>
  )
}