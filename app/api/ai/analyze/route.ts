import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeImage, AiRejectedError } from '@/lib/ai'

export const maxDuration = 90
// Sisakan waktu untuk auth/upload dan pengiriman respons sebelum timeout klien.
const SCAN_AI_TIMEOUT_MS = 85_000

const RATE_LIMIT_PER_DAY = 20
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Catatan desain: rate limit disimpan di memori (per instance server).
// Reset saat proses restart — cukup untuk demo; untuk produksi gunakan
// tabel/redirect ke penyimpanan bersama.
const usage = new Map<string, number[]>()

function consumeQuota(userId: string): boolean {
  const now = Date.now()
  const recent = (usage.get(userId) || []).filter((t) => now - t < ONE_DAY_MS)

  if (recent.length >= RATE_LIMIT_PER_DAY) {
    usage.set(userId, recent)
    return false
  }

  recent.push(now)
  usage.set(userId, recent)
  return true
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }

  if (!consumeQuota(user.id)) {
    return NextResponse.json(
      {
        error: `Batas analisis AI harian tercapai (${RATE_LIMIT_PER_DAY} kali/hari). Silakan lapor manual.`,
        manual: true,
      },
      { status: 429 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Data request tidak valid', manual: true },
      { status: 400 }
    )
  }

  const file = formData.get('image')

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'File gambar diperlukan', manual: true },
      { status: 400 }
    )
  }

  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    return NextResponse.json(
      { error: 'Format file harus JPG atau PNG', manual: true },
      { status: 400 }
    )
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Ukuran file maksimal 5MB', manual: true },
      { status: 400 }
    )
  }

  try {
    const result = await analyzeImage(file, SCAN_AI_TIMEOUT_MS)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[ai/analyze] gagal:', error)
    const message = error instanceof Error ? error.message : 'Gagal menganalisis gambar'

    // Gerbang domain/kualitas AI: foto bukan lahan tanaman atau terlalu tidak
    // jelas. Teruskan status 422 + pesan agar UI menawarkan "Ambil Ulang Foto"
    // (bukan laporan manual).
    if (error instanceof AiRejectedError) {
      return NextResponse.json(
        { error: message, retake: true },
        { status: 422 }
      )
    }

    const isTimeout = message.toLowerCase().includes('timeout')
    return NextResponse.json(
      { error: message, manual: true },
      { status: isTimeout ? 504 : 502 }
    )
  }
}
