import 'server-only'
import { createHash } from 'node:crypto'
import { detectionResponseSchema } from '@/lib/detection'

export class DetectionRequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}

const usage = new Map<string, number[]>()
function consumeQuota(id: string) {
  const now = Date.now()
  const recent = (usage.get(id) || []).filter((time) => now - time < 86_400_000)
  if (recent.length >= 20) return false
  usage.set(id, [...recent, now])
  return true
}

export async function requestDetection(image: Blob, options: {
  enabled: boolean
  aiApiUrl?: string
  authenticate: () => Promise<{ id: string } | null>
  fetcher?: typeof fetch
}) {
  const user = await options.authenticate()
  if (!user) throw new DetectionRequestError('Sesi perlu diperbarui.', 401, 'AUTH_REQUIRED')
  if (!options.enabled) throw new DetectionRequestError('Deteksi YOLO belum diaktifkan.', 503, 'DETECTOR_DISABLED')
  if (!options.aiApiUrl?.trim()) throw new DetectionRequestError('Layanan deteksi belum dikonfigurasi.', 503, 'DETECTOR_UNAVAILABLE')
  if (!['image/jpeg', 'image/png'].includes(image.type) || image.size === 0 || image.size > 5 * 1024 * 1024) {
    throw new DetectionRequestError('Foto harus JPG/PNG dan maksimal 5MB.', 400, 'INVALID_IMAGE')
  }
  if (!consumeQuota(user.id)) throw new DetectionRequestError('Batas deteksi harian tercapai.', 429, 'RATE_LIMITED')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 85_000)
  try {
    const body = new FormData()
    body.append('image', image, image.type === 'image/png' ? 'scan.png' : 'scan.jpg')
    const response = await (options.fetcher || fetch)(`${options.aiApiUrl.trim().replace(/\/$/, '')}/predict/detect`, {
      method: 'POST', body, signal: controller.signal, cache: 'no-store', redirect: 'error',
    })
    if (response.status === 503) throw new DetectionRequestError('Detektor YOLO belum tersedia atau model belum kompatibel.', 503, 'DETECTOR_UNAVAILABLE')
    if ([400, 422].includes(response.status)) throw new DetectionRequestError('Foto belum dapat diproses detektor. Ambil ulang foto yang jelas.', 400, 'INVALID_IMAGE')
    if (!response.ok) throw new DetectionRequestError('Layanan deteksi gagal merespons.', 502, 'DETECTION_FAILED')
    const parsed = detectionResponseSchema.safeParse(await response.json())
    const imageHash = createHash('sha256').update(new Uint8Array(await image.arrayBuffer())).digest('hex')
    if (!parsed.success || parsed.data.provenance.image_sha256 !== imageHash) {
      throw new DetectionRequestError('Respons deteksi atau ikatan foto tidak valid.', 502, 'INVALID_DETECTION_RESPONSE')
    }
    // Preview-only: no insert into legacy ai_analyses and no manufactured
    // severity receipt. Reporting still uses its existing independent receipt.
    return parsed.data
  } catch (error) {
    if (error instanceof DetectionRequestError) throw error
    throw new DetectionRequestError('Detektor belum merespons. Foto dan alur laporan lama tetap tersedia.', controller.signal.aborted ? 504 : 502, 'DETECTION_FAILED')
  } finally { clearTimeout(timer) }
}
