import { randomUUID } from 'node:crypto'

export const farmerId = '10000000-0000-4000-8000-000000000001'
export const fieldId = '20000000-0000-4000-8000-000000000001'

// A transport-level fake, NOT an RLS emulator. Actual DB authorization has a
// separate rollback-only SQL suite; these tests exercise the real server code.
export function reportFixture() {
  const tables: Record<string, any[]> = {
    profiles: [{ id: farmerId, role: 'petani', poktan_id: 'group-a' }],
    lahan: [{ id: fieldId, owner_id: farmerId, poktan_id: 'group-a', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] }],
    damage_reports: [], ai_analyses: [], audit_logs: [],
  }
  const objects = new Map<string, Blob>()
  let activeUser: any = { id: farmerId }
  let aiCalls = 0
  let unavailable = false
  const from = (table: string) => {
    let operation = 'select'
    let payload: any
    let max = Infinity
    const filters: Array<(row: any) => boolean> = []
    const execute = () => {
      const rows = tables[table].filter((row) => filters.every((filter) => filter(row))).slice(0, max)
      if (operation === 'insert') {
        if (table === 'damage_reports' && tables[table].some((row) => row.idempotency_key === payload.idempotency_key)) return { data: null, error: { code: '23505' } }
        const record = { id: randomUUID(), server_created_at: new Date().toISOString(), ...payload }
        tables[table].push(record)
        return { data: [record], error: null }
      }
      if (operation === 'update') rows.forEach((row) => Object.assign(row, payload))
      return { data: rows, error: null }
    }
    const query: any = {
      select: () => query,
      eq: (column: string, value: any) => { filters.push((row) => row[column] === value); return query },
      neq: (column: string, value: any) => { filters.push((row) => row[column] !== value); return query },
      is: (column: string, value: any) => { filters.push((row) => row[column] === value); return query },
      gte: (column: string, value: any) => { filters.push((row) => row[column] >= value); return query },
      limit: (value: number) => { max = value; return query },
      insert: (value: any) => { operation = 'insert'; payload = value; return query },
      update: (value: any) => { operation = 'update'; payload = value; return query },
      maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } },
      single: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } },
      then: (resolve: (value: any) => any) => Promise.resolve(execute()).then(resolve),
    }
    return query
  }
  const client: any = { from, auth: { getUser: async () => ({ data: { user: activeUser }, error: null }) } }
  const admin: any = {
    from,
    storage: { from: () => ({
      upload: async (path: string, blob: Blob) => {
        if (objects.has(path)) return { error: { statusCode: '409' } }
        objects.set(path, blob)
        return { error: null }
      },
      download: async (path: string) => ({ data: objects.get(path), error: null }),
    }) },
  }
  return {
    client, admin, tables, objects,
    analyze: async () => { aiCalls++; if (unavailable) throw new Error('offline'); return { status: 'rusak_ringan' as const, confidence: 0.8, damage_pct: 54 } },
    setUser: (user: any) => { activeUser = user },
    setAiUnavailable: (value: boolean) => { unavailable = value },
    aiCalls: () => aiCalls,
  }
}

export function reportForm(key = randomUUID()) {
  const form = new FormData()
  Object.entries({ user_id: farmerId, lahan_id: fieldId, idempotency_key: key,
    client_created_at: '2026-01-01T00:00:00Z', latitude: '1', longitude: '1',
  }).forEach(([name, value]) => form.set(name, value))
  form.append('photos', new File(['test-image-evidence'], 'test.jpg', { type: 'image/jpeg' }))
  return form
}
