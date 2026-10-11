'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateFloodStatus } from '@/lib/thresholds'

export interface FloodStatusData {
  status: 'aman' | 'waspada' | 'bahaya'
  label: string
  description: string
  color: 'green' | 'yellow' | 'red'
  icon: 'check-circle' | 'alert-triangle' | 'alert-circle'
  rain_3h_mm: number | null
  water_level_m: number | null
  last_updated: string | null
  source: 'openweathermap' | 'mock' | 'mock_fallback'
  location_source: 'device' | 'default'
}

export async function getFloodStatus(
  coords?: { lat: number; lon: number }
): Promise<{ data: FloodStatusData | null; error: string | null }> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  // Get user's poktan district for water level
  const { data: profile } = await supabase
    .from('profiles')
    .select('poktan_id')
    .eq('id', user.id)
    .single()

  let district: string | null = null
  if (profile?.poktan_id) {
    const { data: poktan } = await supabase
      .from('poktan')
      .select('district')
      .eq('id', profile.poktan_id)
      .single()
    district = poktan?.district || null
  }

  // Fetch weather data (koordinat perangkat bila tersedia, fallback Karawang)
  let rain3h: number | null = null
  let weatherSource: 'openweathermap' | 'mock' | 'mock_fallback' = 'mock'
  let locationSource: 'device' | 'default' = 'default'
  try {
    const weatherUrl = new URL(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/weather`
    )
    if (coords) {
      weatherUrl.searchParams.set('lat', String(coords.lat))
      weatherUrl.searchParams.set('lon', String(coords.lon))
    }
    // no-store: /api/weather sudah punya cache internal (10 menit, hanya untuk
    // respons sukses). Jangan cache di sini agar kegagalan/key-error tidak
    // tertahan dan cuaca per-lokasi selalu sesuai koordinat terbaru.
    const weatherRes = await fetch(weatherUrl.toString(), { cache: 'no-store' })
    if (weatherRes.ok) {
      const weatherData = await weatherRes.json()
      rain3h = weatherData.rain_3h_mm ?? null
      weatherSource = weatherData.source || 'mock'
      locationSource = weatherData.location_source || 'default'
    }
  } catch {
    // Silently fail, will use null rain3h
  }

  // Fetch latest water level for user's district
  let waterLevel: number | null = null
  let waterLevelUpdated: string | null = null
  if (district) {
    const { data: wl } = await supabase
      .from('water_levels')
      .select('river_level_m, updated_at')
      .eq('district', district)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    if (wl) {
      waterLevel = wl.river_level_m
      waterLevelUpdated = wl.updated_at
    }
  }

  // Calculate flood status
  const statusResult = calculateFloodStatus(rain3h, waterLevel)

  return {
    data: {
      ...statusResult,
      rain_3h_mm: rain3h,
      water_level_m: waterLevel,
      last_updated: waterLevelUpdated,
      source: weatherSource,
      location_source: locationSource,
    },
    error: null,
  }
}