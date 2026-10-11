'use client'

import dynamic from 'next/dynamic'

// LahanForm memakai leaflet/react-leaflet yang menyentuh `window` saat modul
// dievaluasi, sehingga tidak boleh di-SSR. Wrapper klien ini memuatnya hanya di
// browser (ssr: false) agar rendering server tidak error.
const LahanForm = dynamic(() => import('./LahanForm'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6 text-sm text-gray-500">
      Memuat form lahan…
    </div>
  ),
})

export default LahanForm
