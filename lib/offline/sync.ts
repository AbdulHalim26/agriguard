import { getAllPendingReports, deleteReport, incrementRetryCount } from './db'

export interface SyncResult {
  success: boolean
  syncedCount: number
  skippedCount: number
  failedCount: number
  errors: string[]
}

// Status HTTP yang TIDAK akan pernah berhasil bila diulang (kesalahan data,
// duplikat, atau akses) — item seperti ini dikeluarkan dari antrian agar tidak
// menggantung selamanya ("Menunggu Sync (1)"). Yang tersisa hanya error
// transien (jaringan / 5xx) yang memang layak dicoba lagi.
const PERMANENT_STATUS = new Set([400, 403, 409, 422])

// Kunci "single-flight": AutoSync dan SyncWidget sama-sama bereaksi pada event
// 'online', jadi tanpa ini dua sync akan berjalan bersamaan dan mengirim laporan
// yang sama dua kali (berpotensi tabrakan unique idempotency_key di server).
// Pemanggilan yang tumpang tindih berbagi promise yang sama.
let inFlightSync: Promise<SyncResult> | null = null

export function syncReports(): Promise<SyncResult> {
  if (inFlightSync) return inFlightSync
  inFlightSync = runSync().finally(() => {
    inFlightSync = null
  })
  return inFlightSync
}

// Catatan desain: satu laporan = satu request multipart ke /api/sync.
// /api/sync idempotent via idempotency_key (upsert), jadi membatalkan duplikat.
async function runSync(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    syncedCount: 0,
    skippedCount: 0,
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
        const errorData = await response.json().catch(() => ({}))
        const message: string = errorData.error || 'Gagal sync'

        if (PERMANENT_STATUS.has(response.status)) {
          // Duplikat/validasi/akses: tidak bisa "diperbaiki" dengan retry ->
          // keluarkan dari antrian agar UI tidak menggantung, tapi laporkan.
          await deleteReport(report.id)
          result.skippedCount++
          result.errors.push(`Laporan ${report.id} dilewati: ${message}`)
        } else {
          // Error transien (5xx dsb.) -> pertahankan & coba lagi nanti.
          await incrementRetryCount(report.id)
          result.failedCount++
          result.errors.push(`Laporan ${report.id}: ${message}`)
        }
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