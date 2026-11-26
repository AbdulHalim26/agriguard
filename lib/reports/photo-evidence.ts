import { z } from 'zod'

export const PHOTO_EVIDENCE_VERSION = 'photo-evidence-v1' as const

export const PHOTO_EVIDENCE_DISCLAIMER =
  'Metadata GPS, waktu perangkat, EXIF, dan watermark bersifat pendukung dokumentasi; tidak menjamin keaslian absolut atau bahwa foto bebas manipulasi. Verifikasi tetap dilakukan PPL/Dinas.'

export const GALLERY_LOCATION_WARNING =
  'Unggahan galeri: koordinat GPS dan waktu berasal dari perangkat saat file dipilih, bukan bukti lokasi atau waktu pengambilan foto asli.'

export type CaptureSource = 'camera_capture' | 'gallery_upload'
export type LocationStatus = 'gps_captured' | 'manual_map_pin' | 'gps_unavailable_unverified'

export const gpsSnapshotSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy_m: z.number().finite().min(0).max(100_000).nullable(),
  captured_at: z.string().datetime({ offset: true }),
})

export const clientCaptureMetadataSchema = z.object({
  version: z.literal(PHOTO_EVIDENCE_VERSION),
  capture_source: z.enum(['camera_capture', 'gallery_upload']),
  location_status: z.enum(['gps_captured', 'manual_map_pin', 'gps_unavailable_unverified']),
  gps_snapshot: gpsSnapshotSchema.nullable(),
  device_captured_at: z.string().datetime({ offset: true }),
  submitted_offline: z.boolean().default(false),
  region_label: z.string().trim().max(160).nullable().optional(),
  geometry_version_id: z.string().uuid().nullable().optional(),
  watermark_applied: z.boolean().default(false),
  watermark_lines: z.array(z.string().max(180)).max(8).optional(),
})

export type ClientCaptureMetadata = z.infer<typeof clientCaptureMetadataSchema>

export interface ServerPhotoEvidence {
  version: typeof PHOTO_EVIDENCE_VERSION
  report_id: string
  user_id: string
  lahan_id: string
  geometry_version_id: string | null
  capture_source: CaptureSource
  location_status: LocationStatus
  gps_snapshot: z.infer<typeof gpsSnapshotSchema> | null
  device_captured_at: string
  server_received_at: string
  submitted_offline: boolean
  geofence_status: 'INSIDE' | 'BOUNDARY' | 'OUTSIDE' | 'INVALID_GEOMETRY' | 'INVALID_POINT'
  region_label: string | null
  original_photo_sha256: string
  watermarked_photo_sha256: string | null
  watermark_applied: boolean
  watermark_lines: string[]
  authenticity_note: string
}

export function formatWibTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Waktu tidak tersedia'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia'
  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
  return `${formatted.replace(/\./g, ':')} WIB`
}

export function captureSourceLabel(source?: string | null): string {
  if (source === 'camera_capture') return 'Kamera Aplikasi'
  if (source === 'gallery_upload') return 'Unggahan Galeri'
  return 'Tidak tercatat (data lama)'
}

export function locationStatusLabel(status?: string | null, captureSource?: string | null): string {
  if (status === 'gps_captured') {
    if (captureSource === 'gallery_upload') {
      return 'GPS perangkat saat pilih file (bukan bukti lokasi foto asli)'
    }
    return 'Snapshot GPS saat capture'
  }
  if (status === 'manual_map_pin') return 'Pin peta manual (GPS tidak dipakai)'
  if (status === 'gps_unavailable_unverified') return 'Lokasi GPS belum terverifikasi'
  return 'Tidak tercatat'
}

export function buildWatermarkLines(params: {
  gpsSnapshot: z.infer<typeof gpsSnapshotSchema> | null
  locationStatus: LocationStatus
  deviceCapturedAt: string
  regionLabel: string | null
  lahanId: string | null
  captureSource: CaptureSource
}): string[] {
  const gpsPrefix = params.captureSource === 'gallery_upload'
    ? 'GPS Unggah (bukan lokasi asli)'
    : 'GPS'
  const coordLine = params.gpsSnapshot
    ? `${gpsPrefix}: ${params.gpsSnapshot.latitude.toFixed(6)}, ${params.gpsSnapshot.longitude.toFixed(6)}` +
      (params.gpsSnapshot.accuracy_m != null ? ` (±${Math.round(params.gpsSnapshot.accuracy_m)} m)` : '')
    : 'GPS: Lokasi belum terverifikasi'
  const shortLahan = params.lahanId ? `#${params.lahanId.slice(0, 8)}` : 'Belum dipilih'
  const region = params.regionLabel?.trim() || 'Wilayah belum terverifikasi'
  return [
    `AgriGuard · ${captureSourceLabel(params.captureSource)}`,
    `${formatWibTimestamp(params.deviceCapturedAt)} · Lahan ${shortLahan}`,
    coordLine,
    `Wilayah: ${region}`,
  ]
}

// Browser-only: renders a SEPARATE watermarked copy without ever mutating originalBlob.
export async function createWatermarkedCopy(
  originalBlob: Blob,
  lines: string[],
): Promise<Blob | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(originalBlob)
    img.onload = () => {
      try {
        URL.revokeObjectURL(url)
        const maxDim = 1280
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
        const w = Math.max(1, Math.round((img.naturalWidth || 320) * scale))
        const h = Math.max(1, Math.round((img.naturalHeight || 240) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, w, h)

        const fontSize = Math.max(11, Math.min(18, Math.round(w / 42)))
        const lineHeight = Math.round(fontSize * 1.38)
        const padX = Math.max(10, Math.round(w * 0.02))
        const padY = Math.max(8, Math.round(fontSize * 0.6))
        const boxHeight = Math.min(h, padY * 2 + lines.length * lineHeight)

        ctx.fillStyle = 'rgba(11, 37, 69, 0.78)'
        ctx.fillRect(0, h - boxHeight, w, boxHeight)
        ctx.fillStyle = '#FFFFFF'
        ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
        ctx.textBaseline = 'top'
        lines.forEach((line, i) => {
          ctx.fillText(line, padX, h - boxHeight + padY + i * lineHeight, w - padX * 2)
        })

        const outType = originalBlob.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => resolve(blob && blob.size > 0 ? blob : null),
          outType,
          outType === 'image/jpeg' ? 0.88 : undefined,
        )
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}
