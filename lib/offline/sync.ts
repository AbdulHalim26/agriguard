import { createClient } from '@/lib/supabase/client'
import { getPendingReports, markReportSynced, recordSyncFailure } from './db'
import { createSynchronizer } from './sync-core'
export type { SyncResult } from './sync-core'

const synchronizer = createSynchronizer({
  isOnline: () => typeof navigator !== 'undefined' && navigator.onLine,
  async getUserId(signal) {
    const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal })
    if (!response.ok) return null
    const data = await response.json()
    return typeof data.userId === 'string' ? data.userId : null
  },
  readPending: getPendingReports,
  acknowledge: (report, serverId) => markReportSynced(report.id, report.userId, serverId),
  fail: (report, failure) => recordSyncFailure(report.id, report.userId, failure),
  async send(body, signal) {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), 90_000)
    const stop = () => timeout.abort()
    signal.addEventListener('abort', stop, { once: true })
    try {
      if (signal.aborted) timeout.abort()
      return await fetch('/api/sync', { method: 'POST', body, signal: timeout.signal, credentials: 'same-origin', redirect: 'error' })
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
    }
  },
})

let listening = false
function listenForAccountChanges() {
  if (listening || typeof window === 'undefined') return
  listening = true
  let previousUser: string | null | undefined
  createClient().auth.onAuthStateChange((event, session) => {
    const user = session?.user.id ?? null
    if (event === 'SIGNED_OUT' || (previousUser !== undefined && user !== previousUser)) synchronizer.cancel()
    previousUser = user
  })
}

export function cancelSync() { synchronizer.cancel() }
export function syncReports(options: { retryBlocked?: boolean } = {}) {
  listenForAccountChanges()
  return synchronizer.sync(options)
}
export async function retryFailedSyncs() { return syncReports({ retryBlocked: true }) }
export async function autoSync(): Promise<void> {
  if (isOnline()) await syncReports()
}
export function registerSyncHandler(onSync: () => void): () => void {
  const handler = () => { if (isOnline()) onSync() }
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
export function isOnline() { return typeof navigator !== 'undefined' && navigator.onLine }
