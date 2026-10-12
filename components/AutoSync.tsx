'use client'

import { useEffect } from 'react'
import { autoSync, registerSyncHandler } from '@/lib/offline/sync'
import { isOfflineNow, subscribeOffline, installFetchOnlineDetector } from '@/lib/offline/status'
import { getPendingCount } from '@/lib/offline/db'

// Retry ringan berkala — hanya dijalankan bila antrian masih berisi item.
const RETRY_INTERVAL_MS = 30_000

// Dipasang sekali di layout (app). Berjalan global: saat app dibuka, saat
// koneksi kembali online (event 'online' ATAU request yang tadinya gagal
// sekarang berhasil), saat tab kembali terlihat, saat jendela fokus, dan
// retry berkala 30 detik selama masih ada item di antrian (FR-03).
export default function AutoSync() {
  useEffect(() => {
    // Setiap fetch yang sukses menandai koneksi pulih (memicu flush via
    // subscribeOffline di bawah), sehingga sync jalan tanpa perlu refresh.
    installFetchOnlineDetector()

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

    // Tab kembali terlihat (mis. app di-resume dari background di HP).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !isOfflineNow()) {
        autoSync()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // Retry ringan: cek antrian dulu, sync hanya bila ada item pending.
    const interval = window.setInterval(async () => {
      if (isOfflineNow()) return
      try {
        const pending = await getPendingCount()
        if (pending > 0) {
          autoSync()
        }
      } catch {
        // Abaikan: IndexedDB belum siap / tidak tersedia.
      }
    }, RETRY_INTERVAL_MS)

    return () => {
      unreg()
      unsubStatus()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [])

  return null
}
