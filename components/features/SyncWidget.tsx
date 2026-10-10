'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, UploadCloud } from 'lucide-react'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'
import { syncReports, registerSyncHandler, isOnline } from '@/lib/offline/sync'

export default function SyncWidget({ userId }: { userId: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const c = await getReportCount(userId)
      setCount(c)
    } catch {
      setCount(0)
    }
  }

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    setMessage(null)

    if (!isOnline()) {
      setMessage('Sedang offline — laporan tetap tersimpan di perangkat ini.')
    } else {
      const result = await syncReports()
      if (result.syncedCount > 0) {
        setMessage(`Berhasil menyinkronkan ${result.syncedCount} laporan.`)
      } else if (result.failedCount > 0) {
        setMessage(result.errors[0] || 'Beberapa laporan gagal disinkronkan.')
      }
    }

    await refresh()
    setSyncing(false)
  }

  useEffect(() => {
    refresh()
    const unsub = subscribeQueue(refresh)
    const unreg = registerSyncHandler(() => {
      refresh()
      handleSync()
    })
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      unreg()
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (count === null || count === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
          <UploadCloud size={20} className="text-amber-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-amber-900">Menunggu Sync ({count})</h3>
          <p className="text-sm text-amber-800 mt-0.5">
            {isOnline()
              ? 'Laporan tersimpan offline akan dikirim ke server secara otomatis.'
              : 'Anda sedang offline. Laporan aman tersimpan di perangkat ini.'}
          </p>
          {message && <p className="text-xs text-amber-700 mt-1">{message}</p>}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {syncing ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Menyinkronkan...
              </>
            ) : (
              <>
                <RefreshCw size={16} aria-hidden="true" />
                Sinkronkan Sekarang
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}