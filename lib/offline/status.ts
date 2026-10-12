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

// Saat browser melaporkan kembali online, langsung bersihkan status "offline
// paksa" (yang tadi di-set karena request gagal) TANPA perlu refresh/aksi user.
// Ini membuat banner offline hilang otomatis & memicu flush antrian lewat
// subscribeOffline. Dipasang sekali di module scope (guard: hanya di browser).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => markOnline())
}

export function isOfflineNow(): boolean {
  return forcedOffline || isBrowserOffline()
}

// Deteksi "koneksi pulih" dari request yang sukses: bila sebelumnya ditandai
// offline (request gagal) lalu ada fetch apa pun yang berhasil, bersihkan status
// offline → banner hilang & antrian otomatis di-flush (lihat subscribeOffline).
// Dipasang sekali (idempoten) oleh AutoSync saat mount.
let fetchPatched = false
export function installFetchOnlineDetector(): void {
  if (fetchPatched || typeof window === 'undefined') return
  fetchPatched = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init)
    if (response.ok) markOnline()
    return response
  }
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
