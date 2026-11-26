import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { analyzeImage } from '@/lib/ai'
import { submitEvidence } from '@/lib/reports/submit'
import { ReportError } from '@/lib/reports/evidence'
import { isSameOriginRequest } from '@/lib/auth/origin'

export const maxDuration = 90

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Origin tidak diizinkan.' }, { status: 403 })
  }
  try {
    const result = await submitEvidence(await request.formData(), {
      client: await createClient(), admin: createAdminClient(), analyze: analyzeImage,
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof ReportError ? error.status : 503
    return NextResponse.json({
      error: error instanceof ReportError ? error.message : 'Layanan laporan belum tersedia. Data lokal tetap disimpan.',
      code: error instanceof ReportError ? error.code : 'SERVICE_UNAVAILABLE',
      retryable: status >= 500 || status === 401 || status === 429,
    }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
