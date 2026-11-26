import { unavailableAssessment, type FloodAssessment } from './assessment'

export interface AssessmentSnapshot {
  data: FloodAssessment | null
  loading: boolean
  error: string | null
  offline: boolean
  simulation: boolean
}

// One store per mounted account/provider, NOT a module-global cross-user cache.
// Browser monotonic elapsed time may invalidate a server lease; it never declares
// a source fresh or recalculates risk using the device's wall clock.
export function createAssessmentStore(deps: {
  userId: string | null
  load: (simulation: boolean) => Promise<{ data: FloodAssessment | null; error: string | null }>
  elapsed?: () => number
  schedule?: typeof setTimeout
  clear?: typeof clearTimeout
}) {
  const elapsed = deps.elapsed ?? (() => performance.now())
  const schedule = deps.schedule ?? setTimeout, clear = deps.clear ?? clearTimeout
  let snapshot: AssessmentSnapshot = { data: null, loading: Boolean(deps.userId), error: null, offline: false, simulation: false }
  const initial = snapshot
  const listeners = new Set<() => void>()
  let generation = 0
  let flight: Promise<void> | null = null
  let leaseTimer: ReturnType<typeof setTimeout> | undefined
  let requestTimer: ReturnType<typeof setTimeout> | undefined
  let leaseDeadline: number | null = null
  const emit = (next: AssessmentSnapshot) => { snapshot = next; listeners.forEach((fn) => fn()) }
  const cancel = () => { generation++; clear(leaseTimer); clear(requestTimer); leaseDeadline = null; flight = null }
  const fail = (reason: string, offline = false, stale = false) => {
    emit({ ...snapshot, data: unavailableAssessment(snapshot.data, reason, stale), loading: false, error: reason, offline })
  }
  const refresh = (simulation = snapshot.simulation): Promise<void> => {
    if (!deps.userId) { fail('Sesi belum tersedia. Masuk kembali untuk memperbarui EWS.'); return Promise.resolve() }
    if (flight && simulation === snapshot.simulation) return flight
    cancel()
    const version = generation, started = elapsed()
    emit({ ...snapshot, data: simulation === snapshot.simulation ? snapshot.data : null,
      loading: true, error: null, offline: false, simulation })
    flight = (async () => {
      try {
        const timeout = new Promise<never>((_, reject) => {
          requestTimer = schedule(() => reject(new Error('timeout')), 20_000)
        })
        const result = await Promise.race([Promise.resolve().then(() => deps.load(simulation)), timeout])
        if (version !== generation) return
        clear(requestTimer)
        if (!result.data || result.error || result.data.user_id !== deps.userId) {
          fail('Penilaian EWS belum dapat dimuat atau sesi berubah. Kondisi aman belum dapat disimpulkan.')
          return
        }
        const remaining = result.data.valid_for_ms - Math.max(0, elapsed() - started)
        if (!Number.isFinite(remaining) || remaining <= 0 || result.data.valid_for_ms > 60_000) {
          emit({ ...snapshot, data: unavailableAssessment(result.data, 'Penilaian server perlu diperbarui sebelum digunakan.', true), loading: false,
            error: 'Penilaian server perlu diperbarui sebelum digunakan.' })
          return
        }
        emit({ ...snapshot, data: result.data, loading: false, error: null })
        leaseDeadline = elapsed() + remaining
        leaseTimer = schedule(() => {
          if (version === generation) fail('Penilaian server sudah kedaluwarsa. Perbarui data untuk melihat indikator saat ini.', false, true)
        }, remaining)
      } catch {
        if (version === generation) fail('Koneksi atau layanan EWS belum tersedia. Coba lagi; kondisi aman belum dapat disimpulkan.')
      } finally {
        if (version === generation) { clear(requestTimer); flight = null }
      }
    })()
    return flight
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => {
      // Suspended/background timers cannot extend the server-issued lease.
      if (!snapshot.loading && snapshot.data && leaseDeadline !== null && elapsed() >= leaseDeadline && snapshot.data.valid_for_ms > 0) {
        const reason = 'Penilaian server sudah kedaluwarsa. Perbarui data untuk melihat indikator saat ini.'
        snapshot = { ...snapshot, data: unavailableAssessment(snapshot.data, reason, true), error: reason }
      }
      return snapshot
    },
    getServerSnapshot: () => initial,
    refresh, cancel,
    pause: () => { cancel(); fail('Penilaian server perlu diperbarui sebelum digunakan kembali.', false, true) },
    disconnect: () => { cancel(); fail('Sedang offline. Data terakhir bukan penilaian kondisi saat ini.', true) },
  }
}
