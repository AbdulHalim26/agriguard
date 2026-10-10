import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
  latitude: number
  longitude: number
  clientCreatedAt: string
  photoBlobs: Blob[]
  synced: boolean
  retryCount: number
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
  await db.put('reports', report)
  notifyQueueChanged()
}

export async function getPendingReports(userId: string): Promise<OfflineReport[]> {
  const db = await getOfflineDB()
  const allReports = await db.getAllFromIndex('reports', 'by-user', userId)
  return allReports.filter((r) => !r.synced)
}

// Catatan desain: tidak pakai getAllFromIndex('by-synced', false) karena kunci
// boolean di IndexedDB tidak cocok dengan primitif 0/1; scan seluruh store lalu
// filter di JS (volume queue kecil, aman untuk aplikasi demo).
export async function getAllPendingReports(): Promise<OfflineReport[]> {
  const db = await getOfflineDB()
  const all = await db.getAll('reports')
  return all.filter((r) => !r.synced)
}

export async function markReportSynced(reportId: string): Promise<void> {
  const db = await getOfflineDB()
  const report = await db.get('reports', reportId)
  if (report) {
    report.synced = true
    await db.put('reports', report)
    notifyQueueChanged()
  }
}

export async function incrementRetryCount(reportId: string): Promise<void> {
  const db = await getOfflineDB()
  const report = await db.get('reports', reportId)
  if (report) {
    report.retryCount += 1
    await db.put('reports', report)
  }
}

export async function deleteReport(reportId: string): Promise<void> {
  const db = await getOfflineDB()
  await db.delete('reports', reportId)
  notifyQueueChanged()
}

export async function getReportCount(userId: string): Promise<number> {
  const db = await getOfflineDB()
  const reports = await db.getAllFromIndex('reports', 'by-user', userId)
  return reports.filter((r) => !r.synced).length
}