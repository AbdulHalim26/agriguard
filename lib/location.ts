export type LocationPermissionStatus = 'granted' | 'denied' | 'unavailable'

export interface LocationResult {
  status: LocationPermissionStatus
  lat?: number
  lng?: number
}

/**
 * Ambil posisi perangkat via Geolocation API dengan 3 status:
 * - 'granted'     : koordinat tersedia
 * - 'denied'      : izin ditolak pengguna
 * - 'unavailable' : GPS tidak tersedia / timeout / browser tidak mendukung
 */
export function requestLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ status: 'unavailable' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          status: 'granted',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ status: 'denied' })
        else resolve({ status: 'unavailable' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

/** Cek izin lokasi tanpa memicu prompt (best-effort, fallback false). */
export function hasGrantedLocation(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return Promise.resolve(false)
  }
  return navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((p) => p.state === 'granted')
    .catch(() => false)
}
