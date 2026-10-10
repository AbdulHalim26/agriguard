'use client'

import { MapPin, Map as MapIcon, Layers, Locate } from 'lucide-react'

export default function PetaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Peta Sawah & Laporan</h1>
        <p className="text-gray-500 mt-1">Lihat lahan dan laporan Anda di peta</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="aspect-video bg-gray-100 relative flex items-center justify-center">
          <div className="text-center p-8">
            <MapIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">Peta Interaktif</h3>
            <p className="text-gray-500 mb-6">Integrasi Leaflet + OpenStreetMap akan ditampilkan di sini</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                <MapPin className="w-4 h-4" aria-hidden="true" />
                Lahan Saya
              </button>
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                <MapPin className="w-4 h-4" aria-hidden="true" />
                Laporan Saya
              </button>
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                <Layers className="w-4 h-4" aria-hidden="true" />
                Layer Cuaca
              </button>
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                <Locate className="w-4 h-4" aria-hidden="true" />
                Lokasi Saya
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-3">Legenda</h4>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-500 rounded-full" aria-hidden="true" /></span> Lahan Aktif
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded-full" aria-hidden="true" /></span> Laporan Aman
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-500 rounded-full" aria-hidden="true" /></span> Rusak Ringan
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-full" aria-hidden="true" /></span> Rusak Berat
          </div>
        </div>
      </div>
    </div>
  )
}