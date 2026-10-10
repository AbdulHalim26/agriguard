'use client'

import { useEffect } from 'react'
import { autoSync, registerSyncHandler } from '@/lib/offline/sync'
import { isOfflineNow, subscribeOffline } from '@/lib/offline/status'

// Dipasang sekali di layout (app). Berjalan global: saat app dibuka, saat
// koneksi kembali online (event 'online' ATAU request yang tadinya gagal
// sekarang berhasil), saat jendela mendapat fokus, dan retry berkala
// 60 detik — mekanisme retry antrian offline (FR-03).
export default function AutoSync() {
  useEffect(() => {
    if (!isOfflineNow()) {
      autoSync()
    }

    const unreg = registerSyncHandler(() => {
      autoSync()
    })

    // Sinyal "kembali online" dari status.ts (request sukses setelah gagal).
    const unsubStatus = subscribeOffline(() => {
      if (!isOfflineNow()) {
        autoSync()
      }
    })

    const onFocus = () => {
      if (!isOfflineNow()) {
        autoSync()
      }
    }
    window.addEventListener('focus', onFocus)

    const interval = window.setInterval(() => {
      if (!isOfflineNow()) {
        autoSync()
      }
    }, 60_000)

    return () => {
      unreg()
      unsubStatus()
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [])

  return null
}