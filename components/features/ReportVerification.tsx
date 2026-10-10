'use client'

import { AlertCircle, Info } from 'lucide-react'

export default function ReportVerification() {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Info size={32} className="text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Verifikasi Laporan</h3>
      <p className="text-gray-500 mb-4">
        Fitur verifikasi laporan kerusakan akan segera hadir di milestone selanjutnya (M3).
      </p>
      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm inline-flex items-center gap-2">
        <AlertCircle size={16} aria-hidden="true" />
        <span>Ini bagian dari M3 — Peta & Verifikasi</span>
      </div>
    </div>
  )
}