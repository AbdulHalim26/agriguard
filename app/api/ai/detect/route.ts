import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isYoloEnabled } from '@/lib/detection'
import { requestDetection, DetectionRequestError } from '@/lib/detection-server'
import { isSameOriginRequest } from '@/lib/auth/origin'

export const maxDuration = 90
const headers = { 'Cache-Control': 'no-store' }

export function GET() {
  // Only the public on/off capability is exposed, never the model path/AI URL.
  return NextResponse.json({ enabled: isYoloEnabled(process.env.AGRIGUARD_YOLO_ENABLED) }, { headers })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origin tidak diizinkan.' }, { status: 403, headers })
  try {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) throw new DetectionRequestError('Sesi perlu diperbarui.', 401, 'AUTH_REQUIRED')
    const form = await request.formData()
    const image = form.get('image')
    if (!(image instanceof File)) throw new DetectionRequestError('File gambar diperlukan.', 400, 'INVALID_IMAGE')
    const result = await requestDetection(image, {
      enabled: isYoloEnabled(process.env.AGRIGUARD_YOLO_ENABLED), aiApiUrl: process.env.AI_API_URL,
      authenticate: async () => user,
    })
    return NextResponse.json(result, { headers })
  } catch (error) {
    const status = error instanceof DetectionRequestError ? error.status : 503
    return NextResponse.json({
      inference_status: status === 503 ? 'UNAVAILABLE' : 'ERROR', severity_status: 'REVIEW_REQUIRED',
      error_code: error instanceof DetectionRequestError ? error.code : 'DETECTOR_UNAVAILABLE',
      error: error instanceof DetectionRequestError ? error.message : 'Layanan deteksi belum tersedia.',
    }, { status, headers })
  }
}
