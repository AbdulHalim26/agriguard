'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Error boundary route group (app): kegagalan render (mis. fetch Supabase saat
// offline) TIDAK membuat halaman blank — tampilkan pesan + tombol coba lagi.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] render error:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center bg-white border border-gray-200 rounded-2xl p-8">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="font-semibold text-gray-900 mb-1">Terjadi kesalahan</h2>
        <p className="text-sm text-gray-500 mb-5">
          Halaman tidak dapat ditampilkan. Periksa koneksi lalu coba lagi.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Coba Lagi
        </button>
      </div>
    </div>
  )
}