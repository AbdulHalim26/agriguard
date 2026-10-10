import { getAllPendingReports, markReportSynced, incrementRetryCount, deleteReport } from './db'

export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

export async function syncReports(): Promise<SyncResult> {
  const reports = await getAllPendingReports()
  const result: SyncResult = {
    success: true,
    syncedCount: 0,
    failedCount: 0,
    errors: [],
  }

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
        formData.append(`photos`, report.photoBlobs[i], `photo_${i}.jpg`)
      }

      const response = await fetch('/api/sync', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        await markReportSynced(report.id)
        result.syncedCount++
      } else {
        const errorData = await response.json().catch(() => ({}))
        await incrementRetryCount(report.id)
        result.failedCount++
        result.errors.push(`Laporan ${report.id}: ${errorData.error || 'Gagal sync'}`)
      }
    } catch (error) {
      await incrementRetryCount(report.id)
      result.failedCount++
      result.errors.push(`Laporan ${report.id}: ${error instanceof Error ? error.message : 'Error tidak diketahui'}`)
    }
  }

  result.success = result.failedCount === 0
  return result
}

export async function retryFailedSyncs(): Promise<SyncResult> {
  return syncReports()
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