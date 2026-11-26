import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SyncFailure } from './sync-core'
import type { ClientCaptureMetadata } from '@/lib/reports/photo-evidence'

export interface OfflineReport {
  id: string
  idempotencyKey: string
  userId: string
  lahanId: string
  photoPaths: string[]
  photoHash: string
  aiStatus: 'aman' | 'rusak_ringan' | 'rusak_berat' | null
  aiConfidence: number | null
  aiDamagePct: number | null
  evidenceSource?: 'manual' | 'ai' | 'pending'
  analysisId?: string
  latitude: number
  longitude: number
  clientCreatedAt: string
  photoBlobs: Blob[]
  captureMetadata?: ClientCaptureMetadata | null
  synced: boolean
  retryCount: number
  syncState?: 'retryable' | 'needs_attention' | 'synced'
  lastSyncError?: string
  lastSyncStatus?: number
  syncedReportId?: string
}

// Catatan desain: event sederhana agar widget "Menunggu Sync (n)" di dashboard
// dan AutoSync ikut ter-update saat antrian berubah (simpan/hapus item).
type QueueListener = () => void
const listeners = new Set<QueueListener>()

export function subscribeQueue(listener: QueueListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyQueueChanged() {
  listeners.forEach((listener) => listener())
}

interface PendingUpload {
  reportId: string
  photoIndex: number
  blob: Blob
}

interface OfflineDBSchema extends DBSchema {
  reports: {
    key: string
    value: OfflineReport
    indexes: { 'by-synced': IDBValidKey; 'by-user': IDBValidKey }
  }
  pendingUploads: {
    key: string
    value: PendingUpload
    indexes: { 'by-report': IDBValidKey }
  }
}

let dbInstance: IDBPDatabase<OfflineDBSchema> | null = null

export async function getOfflineDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<OfflineDBSchema>('agriguard-offline', 1, {
    upgrade(db) {
      const reportStore = db.createObjectStore('reports', { keyPath: 'id' })
      reportStore.createIndex('by-synced', 'synced')
      reportStore.createIndex('by-user', 'userId')

      const uploadStore = db.createObjectStore('pendingUploads', { keyPath: 'reportId' })
      uploadStore.createIndex('by-report', 'reportId')
    },
  })

  return dbInstance
}

export async function saveReportOffline(report: OfflineReport): Promise<void> {
  const db = await getOfflineDB()
  const tx = db.transaction('reports', 'readwrite')
  const existing = await tx.store.get(report.id)
  if (existing && existing.userId !== report.userId) {
    await tx.done
    throw new Error('ID laporan dimiliki akun lain. Antrean sebelumnya tetap disimpan.')
  }
  if (existing?.synced) { await tx.done; return }
  await tx.store.put(report)
  await tx.done
  notifyQueueChanged()
}

export async function getPendingReports(userId: string): Promise<OfflineReport[]> {
  const db = await getOfflineDB()
  const allReports = await db.getAllFromIndex('reports', 'by-user', userId)
  return allReports.filter((r) => r.userId === userId && !r.synced)
}

// Keep blobs as recovery evidence, but remove acknowledged items from pending.
export async function markReportSynced(reportId: string, userId: string, serverId: string): Promise<void> {
  const db = await getOfflineDB()
  const tx = db.transaction('reports', 'readwrite')
  const report = await tx.store.get(reportId)
  if (report?.userId === userId) {
    report.synced = true
    report.syncState = 'synced'
    report.syncedReportId = serverId
    delete report.lastSyncError
    await tx.store.put(report)
  }
  await tx.done
  notifyQueueChanged()
}

export async function recordSyncFailure(reportId: string, userId: string, failure: SyncFailure): Promise<void> {
  const db = await getOfflineDB()
  const tx = db.transaction('reports', 'readwrite')
  const report = await tx.store.get(reportId)
  if (report?.userId === userId && !report.synced) {
    report.retryCount = (report.retryCount || 0) + 1
    report.syncState = failure.retryable ? 'retryable' : 'needs_attention'
    report.lastSyncError = failure.message
    report.lastSyncStatus = failure.status
    await tx.store.put(report)
  }
  await tx.done
  notifyQueueChanged()
}

export async function getReportCount(userId: string): Promise<number> {
  const db = await getOfflineDB()
  const reports = await db.getAllFromIndex('reports', 'by-user', userId)
  return reports.filter((r) => !r.synced).length
}
