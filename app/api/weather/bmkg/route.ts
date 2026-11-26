import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveLocationToAdm4 } from '@/lib/ews/bmkg'
import { getBmkgWeather } from '@/lib/ews/bmkg-server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Sesi diperlukan untuk memuat prakiraan cuaca lokasi lahan.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const { searchParams } = new URL(request.url)
  // Explicitly reject any attempt to query another user's lahan_id or user_id
  if (searchParams.has('user_id') || searchParams.has('lahan_id')) {
    return NextResponse.json(
      { error: 'Parameter lintas pengguna tidak diizinkan.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const latParam = searchParams.get('lat')
  const lonParam = searchParams.get('lon')
  const explicitAdm4 = searchParams.get('adm4')
  const deviceCoords =
    latParam !== null || lonParam !== null
      ? { lat: latParam?.trim() ? Number(latParam) : NaN, lon: lonParam?.trim() ? Number(lonParam) : NaN }
      : null

  // Read ONLY the authenticated user's own Poktan / Lahan via RLS (no service_role, no cross-user leak).
  let registeredLahan: { village?: string | null; district?: string | null; polygon?: unknown } | null = null
  const { data: profile } = await supabase.from('profiles').select('poktan_id').eq('id', user.id).maybeSingle()
  if (profile?.poktan_id) {
    const { data: poktan } = await supabase.from('poktan').select('village, district').eq('id', profile.poktan_id).maybeSingle()
    const { data: lahanRows } = await supabase.from('lahan').select('polygon').eq('owner_id', user.id).limit(1)
    if (poktan || lahanRows?.[0]?.polygon) {
      registeredLahan = {
        village: poktan?.village ?? null,
        district: poktan?.district ?? null,
        polygon: lahanRows?.[0]?.polygon ?? null,
      }
    }
  }

  const resolved = resolveLocationToAdm4({
    explicitAdm4,
    deviceCoords,
    registeredLahan,
  })
  const result = await getBmkgWeather(resolved)
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
