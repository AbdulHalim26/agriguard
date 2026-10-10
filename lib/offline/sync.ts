import { getAllPendingReports, deleteReport, incrementRetryCount } from './db'

export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

// Catatan desain: satu laporan = satu request multipart ke /api/sync.
// /api/sync idempotent via idempotency_key (upsert), jadi membatalkan duplikat.
export async function syncReports(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    syncedCount: 0,
    failedCount: 0,
    errors: [],
  }

  if (!navigator.onLine) {
    result.success = false
    result.errors.push('Perangkat sedang offline')
    return result
  }

  const reports = await getAllPendingReports()

  for (const report of reports) {
    try {
      const formData = new FormData()
      formData.append('idempotency_key', report.idempotencyKey)
      formData.append('user_id', report.userId)
      formData.append('lahan_id', report.lahanId)
      formData.append('latitude', report.latitude.toString())
      formData.append('longitude', report.longitude.toString())
      formData.append('client_created_at', report.clientCreatedAt)

      if (report.aiStatus) {
        formData.append('ai_status', report.aiStatus)
        formData.append('ai_confidence', report.aiConfidence?.toString() || '')
        formData.append('ai_damage_pct', report.aiDamagePct?.toString() || '')
      }

      for (let i = 0; i < report.photoBlobs.length; i++) {
        formData.append('photos', report.photoBlobs[i], `photo_${i}.jpg`)
      }

      const response = await fetch('/api/sync', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        // Item sukses langsung hilang dari antrian (scope FR-03).
        await deleteReport(report.id)
        result.syncedCount++
      } else {
        await incrementRetryCount(report.id)
        result.failedCount++
        const errorData = await response.json().catch(() => ({}))
        result.errors.push(`Laporan ${report.id}: ${errorData.error || 'Gagal sync'}`)
      }
    } catch (error) {
      await incrementRetryCount(report.id)
      result.failedCount++
      result.errors.push(
        `Laporan ${report.id}: ${error instanceof Error ? error.message : 'Error tidak diketahui'}`
      )
    }
  }

  result.success = result.failedCount === 0
  return result
}

export async function retryFailedSyncs(): Promise<SyncResult> {
  return syncReports()
}

export async function autoSync(): Promise<void> {
  if (!navigator.onLine) return
  await syncReports()
}

export function registerSyncHandler(onSync: () => void): () => void {
  const handler = () => {
    if (navigator.onLine) {
      onSync()
    }
  }

  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}

export function isOnline(): boolean {
  return navigator.onLine
}