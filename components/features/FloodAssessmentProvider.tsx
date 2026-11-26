'use client'

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getFloodStatus } from '@/app/(app)/dashboard/flood-actions'
import { requestLocation } from '@/lib/location'
import { useCurrentUserId } from '@/lib/offline/use-current-user'
import { createAssessmentStore, type AssessmentSnapshot } from '@/lib/ews/client-store'
import type { Coordinates } from '@/lib/ews/data'

const fallback: AssessmentSnapshot & { refresh: (simulation?: boolean) => void } = {
  data: null, loading: false, error: 'Penilaian EWS belum tersedia.', offline: false, simulation: false, refresh: () => {},
}
const Context = createContext(fallback)

export default function FloodAssessmentProvider({ children, active }: { children: React.ReactNode; active: boolean }) {
  const userId = useCurrentUserId()
  const store = useMemo(() => {
    let location: Promise<Coordinates | undefined> | undefined
    return createAssessmentStore({ userId, load: async (simulation) => {
      // One location snapshot shared by dashboard, notifications and retries.
      location ??= requestLocation().then((loc) => loc.status === 'granted' && loc.lat != null && loc.lng != null
        ? { lat: loc.lat, lon: loc.lng } : undefined).catch(() => undefined)
      return getFloodStatus(await location, { expectedUserId: userId || '', simulation })
    } })
  }, [userId])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  useEffect(() => {
    if (!active || !userId) return
    const refresh = () => { if (navigator.onLine) void store.refresh(); else store.disconnect() }
    const offline = () => store.disconnect()
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', refresh)
    window.addEventListener('agriguard:water-level-updated', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer); store.pause()
      window.removeEventListener('online', refresh); window.removeEventListener('offline', offline)
      window.removeEventListener('focus', refresh); window.removeEventListener('agriguard:water-level-updated', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [active, store, userId])
  return <Context.Provider value={{ ...snapshot, refresh: (simulation) => {
    if (navigator.onLine) void store.refresh(simulation); else store.disconnect()
  } }}>{children}</Context.Provider>
}

export const useFloodAssessment = () => useContext(Context)
