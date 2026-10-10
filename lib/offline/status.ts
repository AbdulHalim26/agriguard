'use client'

import { useEffect, useState } from 'react'

// Status offline = kombinasi (a) navigator.onLine === false ATAU
// (b) sebuah request ke server gagal (network error / Supabase tidak terjangkau).
// Sinyal (b) penting karena navigator.onLine bisa saja true walau request gagal.

let forcedOffline = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function markOffline() {
  if (!forcedOffline) {
    forcedOffline = true
    emit()
  }
}

export function markOnline() {
  if (forcedOffline) {
    forcedOffline = false
    emit()
  }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isOfflineNow(): boolean {
  return forcedOffline || isBrowserOffline()
}

export function useOfflineStatus(): boolean {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(isOfflineNow())
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const unsub = subscribeOffline(update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      unsub()
    }
  }, [])

  return offline
}
