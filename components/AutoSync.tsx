'use client'

import { useEffect } from 'react'
import { autoSync, registerSyncHandler } from '@/lib/offline/sync'

// Dipasang sekali di layout (app). Berjalan global: saat app dibuka, saat
// koneksi kembali online, saat jendela mendapat fokus, dan retry berkala
// 60 detik — mekanisme retry antrian offline (FR-03).
export default function AutoSync() {
  useEffect(() => {
    if (navigator.onLine) {
      autoSync()
    }

    const unreg = registerSyncHandler(() => {
      autoSync()
    })

    const onFocus = () => {
      if (navigator.onLine) {
        autoSync()
      }
    }
    window.addEventListener('focus', onFocus)

    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        autoSync()
      }
    }, 60_000)

    return () => {
      unreg()
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [])

  return null
}