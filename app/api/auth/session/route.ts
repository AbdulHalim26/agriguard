import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ userId: user.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Sesi belum dapat diverifikasi.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
