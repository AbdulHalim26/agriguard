'use client'

import { Camera, Upload, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'

export default function ScanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scan Kerusakan Padi</h1>
        <p className="text-gray-500 mt-1">Ambil foto padi untuk diklasifikasi AI</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
          <div className="p-3 bg-gray-100 rounded-xl w-fit mx-auto mb-4">
            <Camera className="w-8 h-8 text-gray-500" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Upload Foto Padi</h3>
          <p className="text-gray-500 mb-6">Ambil foto atau pilih dari galeri (max 5MB, JPG/PNG)</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Camera className="w-5 h-5" aria-hidden="true" />
              Ambil Foto
            </button>
            <button className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Upload className="w-5 h-5" aria-hidden="true" />
              Pilih dari Galeri
            </button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-xl">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" />
            Catatan
          </h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Foto akan dikompres otomatis (max 1280px, kualitas 80%)</li>
            <li>• Hasil AI: Aman / Rusak Ringan / Rusak Berat + skor keyakinan</li>
            <li>• Jika AI timeout ({'>'}15 detik), bisa pilih "Lapor Manual"</li>
            <li>• Geotagging otomatis via GPS (bisa edit manual di peta)</li>
          </ul>
        </div>
      </div>

      {/* Placeholder for results */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 hidden" id="resultCard">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <CheckCircle className="w-6 h-6 text-green-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Hasil Analisis AI</h3>
            <p className="text-sm text-gray-500">Status: <span className="font-medium text-green-700">Aman</span> (92% keyakinan)</p>
          </div>
        </div>
        <div className="space-y-3">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Buat Laporan dari Hasil Ini
          </button>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            Scan Lagi
          </button>
        </div>
      </div>
    </div>
  )
}