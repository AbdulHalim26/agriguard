import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { writeLahan } from '@/lib/land/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }

  const { data: existing } = await supabase
    .from('lahan')
    .select('owner_id')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Lahan tidak ditemukan' }, { status: 404 })
  }

  if (existing.owner_id !== user.id) {
    return NextResponse.json({ error: 'Tidak berhak menghapus lahan ini' }, { status: 403 })
  }

  const { error } = await supabase
    .from('lahan')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/lahan/:id] gagal:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let body: unknown
    try { body = await request.json() }
    catch { return NextResponse.json({ error: 'JSON perubahan lahan tidak valid.', code: 'INVALID_JSON' }, { status: 400 }) }
    const result = await writeLahan(body, await createClient(), { id: (await params).id })
    return NextResponse.json(result, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Layanan lahan belum tersedia.', code: 'LAND_SERVICE_UNAVAILABLE' }, { status: 503 })
  }
}
