import { NextRequest, NextResponse } from 'next/server'
import { analyzeImage } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json(
        { error: 'File gambar diperlukan' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File harus berupa gambar' },
        { status: 400 }
      )
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Ukuran file maksimal 5MB' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const result = await analyzeImage(base64)

    return NextResponse.json(result)
  } catch (error) {
    console.error('AI analyze error:', error)
    const message = error instanceof Error ? error.message : 'Gagal menganalisis gambar'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}