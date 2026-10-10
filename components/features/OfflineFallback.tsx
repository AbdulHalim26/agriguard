'use client'

import { WifiOff, RefreshCw } from 'lucide-react'

interface OfflineFallbackProps {
  title?: string
  message?: string
}

// Fallback yang aman saat data server tidak bisa dimuat (mis. Supabase tidak
// terjangkau). Ditampilkan oleh server component ketimbang crash/blank.
export default function OfflineFallback({
  title = 'Tidak dapat memuat data',
  message = 'Koneksi ke server terputus. Data akan muncul kembali saat online.',
}: OfflineFallbackProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center bg-white border border-gray-200 rounded-2xl p-8">
        <WifiOff className="w-10 h-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="font-semibold text-gray-900 mb-1">{title}</h2>
        <p className="text-sm text-gray-500 mb-5">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Coba Lagi
        </button>
      </div>
    </div>
  )
}
