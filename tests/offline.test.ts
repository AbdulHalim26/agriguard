import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createSynchronizer } from '../lib/offline/sync-core'
import type { OfflineReport } from '../lib/offline/db'
import { fieldCacheKey, rememberOfflineUser, rememberedOfflineUser } from '../lib/offline/identity'

function queued(userId: string): OfflineReport {
  const id = randomUUID()
  return { id, idempotencyKey: id, userId, lahanId: randomUUID(), photoPaths: [], photoHash: '',
    aiStatus: null, aiConfidence: null, aiDamagePct: null, latitude: 1, longitude: 1,
    clientCreatedAt: '2026-01-01T00:00:00Z', photoBlobs: [new Blob(['evidence'], { type: 'image/jpeg' })], synced: false, retryCount: 0 }
}

function fixture() {
  const queue = [queued('user-a'), queued('user-b')]
  let user: string | null = 'user-a'
  const sent: FormData[] = []
  const failures: unknown[] = []
  const storedKeys = new Map<string, string>()
  let status = 200
  let malformedAck = false
  let networkFailure = false
  let afterSend: (() => void) | undefined
  const synchronizer = createSynchronizer({
    isOnline: () => true,
    getUserId: async () => user,
    // Include a malicious foreign row to exercise the defense-in-depth guard.
    readPending: async () => queue.filter((report) => !report.synced),
    acknowledge: async (report, serverId) => { report.synced = true; report.syncedReportId = serverId },
    fail: async (report, failure) => {
      report.retryCount++; report.syncState = failure.retryable ? 'retryable' : 'needs_attention'
      report.lastSyncError = failure.message; failures.push(failure)
    },
    send: async (body) => {
      sent.push(body)
      if (networkFailure) throw new Error('network down')
      const key = body.get('idempotency_key') as string
      if (!storedKeys.has(key) && status === 200) storedKeys.set(key, randomUUID())
      afterSend?.()
      return new Response(JSON.stringify(malformedAck ? { success: true } : {
        success: status === 200, user_id: body.get('user_id'), idempotency_key: key,
        id: storedKeys.get(key), error: status === 200 ? undefined : 'sync rejected',
      }), { status })
    },
  })
  return { queue, sent, failures, storedKeys, synchronizer,
    setUser: (value: string | null) => { user = value },
    setStatus: (value: number) => { status = value },
    malformed: () => { malformedAck = true },
    networkDown: () => { networkFailure = true },
    afterSend: (fn: () => void) => { afterSend = fn },
  }
}

test('only the current server-authenticated account queue can upload', async () => {
  const f = fixture()
  assert.equal((await f.synchronizer.sync()).syncedCount, 1)
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].get('user_id'), 'user-a')
  assert.equal(f.queue[1].synced, false)
  f.setUser('user-b')
  await f.synchronizer.sync()
  assert.equal(f.sent[1].get('user_id'), 'user-b')
})

test('403/400/409/422 preserve photo blobs and require explicit retry', async () => {
  for (const status of [400, 403, 409, 422]) {
    const f = fixture(); f.setStatus(status)
    const result = await f.synchronizer.sync()
    assert.equal(result.success, false)
    assert.equal(f.queue.length, 2)
    assert.equal(f.queue[0].synced, false)
    assert.equal(f.queue[0].photoBlobs[0].size, 8)
    assert.equal(f.queue[0].syncState, 'needs_attention')
    await f.synchronizer.sync()
    assert.equal(f.sent.length, 1)
    f.setStatus(200)
    await f.synchronizer.sync({ retryBlocked: true })
    assert.equal(f.queue[0].synced, true)
  }
})

test('network and server failures retain pending data for automatic retries', async () => {
  for (const status of [401, 429, 500, 503]) {
    const f = fixture(); f.setStatus(status)
    await f.synchronizer.sync()
    assert.equal(f.queue[0].synced, false)
    assert.equal(f.queue[0].syncState, 'retryable')
    f.setStatus(200)
    assert.equal((await f.synchronizer.sync()).syncedCount, 1)
  }
  const f = fixture(); f.networkDown()
  await f.synchronizer.sync()
  assert.equal(f.queue[0].synced, false)
  assert.equal(f.queue[0].photoBlobs.length, 1)
})

test('a 200 without a matching durable acknowledgement never clears pending data', async () => {
  const f = fixture(); f.malformed()
  assert.equal((await f.synchronizer.sync()).success, false)
  assert.equal(f.queue[0].synced, false)
  assert.equal(f.queue[0].syncState, 'retryable')
})

test('logout/account change cancels a flight without acknowledging another account', async () => {
  const f = fixture()
  f.afterSend(() => { f.setUser('user-b'); f.synchronizer.cancel() })
  assert.equal((await f.synchronizer.sync()).success, false)
  assert.equal(f.queue[0].synced, false)
  assert.equal(f.queue[1].synced, false)
  assert.equal(f.sent.length, 1)
})

test('a response lost across account change retries the same key without duplicate persistence', async () => {
  const f = fixture()
  let once = true
  f.afterSend(() => { if (once) { once = false; f.synchronizer.cancel() } })
  await f.synchronizer.sync()
  const [first, second] = await Promise.all([f.synchronizer.sync(), f.synchronizer.sync()])
  assert.equal(first, second)
  assert.equal(first.syncedCount, 1)
  assert.equal(f.sent.length, 2)
  assert.equal(f.storedKeys.size, 1)
  assert.equal(f.queue[0].photoBlobs.length, 1)
  assert.equal((await f.synchronizer.sync()).syncedCount, 0)
})

test('no authenticated account means no upload; cached identity is not authorization', async () => {
  const f = fixture(); f.setUser(null)
  assert.equal((await f.synchronizer.sync()).success, false)
  assert.equal(f.sent.length, 0)
  assert.equal(f.queue[0].synced, false)
})

test('switching accounts after reading the queue stops before uploading any evidence', async () => {
  let lookups = 0
  let sent = false
  const synchronizer = createSynchronizer({
    isOnline: () => true,
    getUserId: async () => ++lookups === 1 ? 'user-a' : 'user-b',
    readPending: async () => [queued('user-a')],
    acknowledge: async () => { throw new Error('must not acknowledge') },
    fail: async () => {},
    send: async () => { sent = true; throw new Error('must not upload') },
  })
  assert.equal((await synchronizer.sync()).success, false)
  assert.equal(sent, false)
})

test('field caches are account scoped and logout only clears the identity pointer', () => {
  const storage = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } })
  try {
    assert.notEqual(fieldCacheKey('user-a'), fieldCacheKey('user-b'))
    storage.set(fieldCacheKey('user-a'), 'preserved field data')
    rememberOfflineUser('user-a')
    assert.equal(rememberedOfflineUser(), 'user-a')
    rememberOfflineUser(null)
    assert.equal(rememberedOfflineUser(), null)
    assert.equal(storage.get(fieldCacheKey('user-a')), 'preserved field data')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('wrong-account, wrong-key, or invalid-ID acknowledgements retain the original queued evidence', async () => {
  for (const mismatch of ['user_id', 'idempotency_key', 'id']) {
    const report = queued('user-a')
    let acknowledged = false
    const synchronizer = createSynchronizer({
      isOnline: () => true, getUserId: async () => 'user-a', readPending: async () => [report],
      acknowledge: async () => { acknowledged = true },
      fail: async () => {},
      send: async () => new Response(JSON.stringify({
        success: true, user_id: report.userId, idempotency_key: report.idempotencyKey,
        id: randomUUID(), [mismatch]: 'mismatch',
      })),
    })
    assert.equal((await synchronizer.sync()).success, false)
    assert.equal(acknowledged, false)
    assert.equal(report.synced, false)
    assert.equal(await report.photoBlobs[0].text(), 'evidence')
  }
})
