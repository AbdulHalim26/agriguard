import type { OfflineReport } from './db'

export interface SyncResult {
  success: boolean
  syncedCount: number
  skippedCount: number
  failedCount: number
  errors: string[]
}
export type SyncFailure = { message: string; retryable: boolean; status?: number }
type Dependencies = {
  isOnline: () => boolean
  getUserId: (signal: AbortSignal) => Promise<string | null>
  readPending: (userId: string) => Promise<OfflineReport[]>
  acknowledge: (report: OfflineReport, serverId: string) => Promise<void>
  fail: (report: OfflineReport, failure: SyncFailure) => Promise<void>
  send: (body: FormData, signal: AbortSignal) => Promise<Response>
}

export function createSynchronizer(deps: Dependencies) {
  let inFlight: Promise<SyncResult> | null = null
  let controller: AbortController | null = null
  let generation = 0

  const cancel = () => { generation++; controller?.abort() }
  const sync = (options: { retryBlocked?: boolean } = {}): Promise<SyncResult> => {
    if (inFlight) return inFlight
    const flight = new AbortController()
    controller = flight
    const started = generation
    inFlight = run(options, flight.signal, () => started === generation).finally(() => {
      inFlight = null
      if (controller === flight) controller = null
    })
    return inFlight
  }

  async function run(options: { retryBlocked?: boolean }, signal: AbortSignal, current: () => boolean): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedCount: 0, skippedCount: 0, failedCount: 0, errors: [] }
    try {
      if (!deps.isOnline()) throw new Error('Perangkat sedang offline. Laporan tetap tersimpan.')
      const userId = await deps.getUserId(signal)
      if (!userId || !current()) throw new Error('Sesi belum terverifikasi. Laporan tetap tersimpan untuk pemiliknya.')
      const reports = await deps.readPending(userId)
      for (const report of reports) {
        if (!current() || signal.aborted) break
        // Defense in depth: even a stale/corrupt index must not cross accounts.
        if (report.userId !== userId || report.synced) continue
        if (report.syncState === 'needs_attention' && !options.retryBlocked) {
          result.skippedCount++
          result.errors.push(report.lastSyncError || 'Laporan memerlukan pemeriksaan; data lokal tetap disimpan.')
          continue
        }
        try {
          // Check the server session again immediately before EACH upload.
          if (await deps.getUserId(signal) !== userId || !current()) {
            throw new Error('Akun aktif berubah. Sinkronisasi dihentikan dan laporan tetap disimpan.')
          }
          const form = new FormData()
          form.set('user_id', userId)
          form.set('idempotency_key', report.idempotencyKey)
          form.set('lahan_id', report.lahanId)
          form.set('latitude', String(report.latitude))
          form.set('longitude', String(report.longitude))
          form.set('client_created_at', report.clientCreatedAt)
          if (report.captureMetadata) {
            form.set('capture_metadata', JSON.stringify({ ...report.captureMetadata, submitted_offline: true }))
          }
          if (report.evidenceSource) form.set('evidence_source', report.evidenceSource)
          if (report.evidenceSource === 'manual' && report.aiStatus) form.set('manual_status', report.aiStatus)
          if (report.analysisId && report.evidenceSource !== 'manual') form.set('analysis_id', report.analysisId)
          if (!report.evidenceSource && report.aiStatus) {
            // Compatibility with existing queue entries. The server treats old
            // numeric AI fields as untrusted and reruns inference where needed.
            form.set('ai_status', report.aiStatus)
            if (report.aiConfidence != null) form.set('ai_confidence', String(report.aiConfidence))
            if (report.aiDamagePct != null) form.set('ai_damage_pct', String(report.aiDamagePct))
          }
          report.photoBlobs.forEach((blob, i) => form.append('photos', blob, `photo_${i}.${blob.type === 'image/png' ? 'png' : 'jpg'}`))
          const response = await deps.send(form, signal)
          const body = await response.json().catch(() => null)
          if (!current() || signal.aborted) break
          const validAck = response.ok && body?.success === true &&
            body.user_id === userId && body.idempotency_key === report.idempotencyKey &&
            typeof body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
          if (validAck) {
            await deps.acknowledge(report, body.id)
            result.syncedCount++
          } else {
            const failure = {
              message: typeof body?.error === 'string' ? body.error : 'Respons sinkronisasi belum terkonfirmasi. Data lokal tetap disimpan.',
              status: response.status,
              retryable: response.status >= 500 || [401, 408, 429].includes(response.status) || response.ok,
            }
            await deps.fail(report, failure)
            result.failedCount++
            result.errors.push(failure.message)
            if (response.status === 401 || response.status === 403) break
          }
        } catch {
          if (current() && !signal.aborted) {
            const failure = { message: 'Koneksi atau sesi berubah. Laporan tetap disimpan dan dapat dicoba kembali.', retryable: true }
            await deps.fail(report, failure)
            result.failedCount++
            result.errors.push(failure.message)
          }
          break
        }
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Sinkronisasi belum tersedia; laporan tetap disimpan.')
    }
    if (!current() || signal.aborted) result.errors.push('Sinkronisasi dihentikan karena perubahan sesi; data lokal tetap disimpan.')
    result.success = result.failedCount === 0 && result.skippedCount === 0 && result.errors.length === 0
    return result
  }

  return { sync, cancel }
}
