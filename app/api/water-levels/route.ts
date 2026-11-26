import { getLatestWaterLevel } from '@/app/(app)/verifikasi/water-actions'
import { NextResponse } from 'next/server'

export async function GET() {
  const result = await getLatestWaterLevel()
  if (result.error) return NextResponse.json({ error: result.error }, {
    status: result.error === 'Tidak terautentikasi' ? 401 : 503, headers: { 'Cache-Control': 'no-store' },
  })
  const row = result.data
  // Original fields retained; quality/provenance added, no cached source promotion.
  return NextResponse.json(row ? { ...row, quality: row.source_detail.quality, observed_at: null,
    timestamp_basis: row.source_detail.timestamp_basis } : null, { headers: { 'Cache-Control': 'no-store' } })
}
