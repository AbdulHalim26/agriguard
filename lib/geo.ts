export type Point = [number, number]
export type Polygon = Point[]

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

export function validateGeofence(
  latitude: number,
  longitude: number,
  polygon: Polygon
): boolean {
  return pointInPolygon([longitude, latitude], polygon)
}

export async function compressImage(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.85
): Promise<Blob> {
  let bitmap: ImageBitmap | undefined
  let objectUrl: string | undefined

  try {
    // Terapkan EXIF sekali saat decode (termasuk foto kamera yang diputar).
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      } catch {
        // Browser yang belum mendukung opsi ini memakai decoder <img> di bawah.
      }
    }

    const image = bitmap ?? await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      // Decoder <img> browser modern menerapkan orientasi EXIF secara otomatis.
      objectUrl = URL.createObjectURL(file)
      img.src = objectUrl
    })
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height
    if (!width || !height) throw new Error('Ukuran gambar tidak valid')

    const scale = Math.min(1, maxDimension / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context tidak tersedia')

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Gagal mengompres gambar'))
          }
        },
        'image/jpeg',
        quality
      )
    })
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

export async function calculateSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
