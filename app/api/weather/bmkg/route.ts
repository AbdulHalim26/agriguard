import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  resolveLocationToAdm4,
  resolveVerifiedAdm4ForAdmin,
  type BmkgLocationMode,
  type BmkgParcelOption,
} from '@/lib/ews/bmkg'
import { getBmkgWeather } from '@/lib/ews/bmkg-server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const parcelIdParam = searchParams.get('parcel_id')?.trim() || null
  if (parcelIdParam && !UUID_REGEX.test(parcelIdParam)) {
    return NextResponse.json(
      { error: 'Format parcel_id tidak valid.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const modeParam = searchParams.get('mode')?.trim()
  const locationMode: BmkgLocationMode = modeParam === 'device_only' ? 'device_only' : 'parcel_first'

  const latParam = searchParams.get('lat')
  const lonParam = searchParams.get('lon')
  const explicitAdm4 = searchParams.get('adm4')
  const deviceCoords =
    latParam !== null || lonParam !== null
      ? { lat: latParam?.trim() ? Number(latParam) : NaN, lon: lonParam?.trim() ? Number(lonParam) : NaN }
      : null

  // Read ONLY the authenticated user's own Poktan / Lahan via RLS (no service_role, no cross-user leak).
  const [{ data: profile }, { data: lahanRows }] = await Promise.all([
    supabase.from('profiles').select('poktan_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('lahan')
      .select('id, name, poktan_id, polygon')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  const ownedLahan = lahanRows || []
  if (parcelIdParam && !ownedLahan.some((row) => row.id === parcelIdParam)) {
    return NextResponse.json(
      { error: 'Lahan tidak ditemukan atau bukan milik akun Anda.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const poktanIds = Array.from(
    new Set(
      [profile?.poktan_id, ...ownedLahan.map((row) => row.poktan_id)].filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    )
  )
  const poktanMap = new Map<string, { village: string | null; district: string | null }>()
  if (poktanIds.length > 0) {
    const { data: poktanRows } = await supabase
      .from('poktan')
      .select('id, village, district')
      .in('id', poktanIds)
    for (const row of poktanRows || []) {
      poktanMap.set(row.id, { village: row.village ?? null, district: row.district ?? null })
    }
  }

  const defaultPoktan = profile?.poktan_id ? poktanMap.get(profile.poktan_id) ?? null : null
  const availableParcels: BmkgParcelOption[] = ownedLahan.map((row) => {
    const p = (row.poktan_id ? poktanMap.get(row.poktan_id) : null) ?? defaultPoktan
    const village = p?.village ?? null
    const district = p?.district ?? null
    return {
      id: row.id,
      name: row.name,
      village,
      district,
      adm4: resolveVerifiedAdm4ForAdmin(village, district),
    }
  })

  const chosenRow = parcelIdParam
    ? ownedLahan.find((row) => row.id === parcelIdParam) ?? null
    : ownedLahan[0] ?? null
  const selectedParcelOption = chosenRow
    ? availableParcels.find((p) => p.id === chosenRow.id) ?? null
    : null

  let registeredLahan: {
    id?: string | null
    name?: string | null
    village?: string | null
    district?: string | null
    polygon?: unknown
  } | null = null

  if (chosenRow) {
    registeredLahan = {
      id: chosenRow.id,
      name: chosenRow.name,
      village: selectedParcelOption?.village ?? null,
      district: selectedParcelOption?.district ?? null,
      polygon: chosenRow.polygon ?? null,
    }
  } else if (defaultPoktan) {
    registeredLahan = {
      village: defaultPoktan.village,
      district: defaultPoktan.district,
      polygon: null,
    }
  }

  const resolved = resolveLocationToAdm4({
    explicitAdm4,
    deviceCoords,
    locationPreference: locationMode,
    registeredLahan,
  })
  const result = await getBmkgWeather(resolved)
  return NextResponse.json(
    {
      ...result,
      location_mode: locationMode,
      selected_parcel: selectedParcelOption,
      available_parcels: availableParcels,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
