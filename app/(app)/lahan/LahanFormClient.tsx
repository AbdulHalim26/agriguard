'use client'

import dynamic from 'next/dynamic'
import MapSkeleton from '@/components/map/MapSkeleton'

// LahanForm memakai leaflet/react-leaflet yang menyentuh `window` saat modul
// dievaluasi, sehingga tidak boleh di-SSR. Wrapper klien ini memuatnya hanya di
// browser (ssr: false) agar rendering server tidak error.
const LahanForm = dynamic(() => import('./LahanForm'), {
  ssr: false,
  loading: () => <MapSkeleton className="h-80 mb-6" label="Memuat form lahan…" />,
})

export default LahanForm
