import { NextResponse } from 'next/server'

interface WeatherData {
  rain_3h_mm: number
  temperature: number
  humidity: number
  description: string
  source: 'openweathermap' | 'mock' | 'mock_fallback'
  location: { lat: number; lon: number }
  location_source: 'device' | 'default'
  cached?: boolean
  cache_age_ms?: number
}

// Pusat Karawang — fallback bila koordinat perangkat tidak tersedia
const DEFAULT_COORDS = { lat: -6.31, lon: 107.29 }

const MOCK_WEATHER = {
  rain_3h_mm: 15,
  temperature: 28,
  humidity: 78,
  description: 'Hujan ringan',
  source: 'mock' as const,
}

const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>()

function parseCoord(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: Request) {
  const apiKey = process.env.OPENWEATHER_API_KEY

  const { searchParams } = new URL(request.url)
  const latParam = parseCoord(searchParams.get('lat'))
  const lonParam = parseCoord(searchParams.get('lon'))
  const hasDeviceCoords =
    latParam !== null &&
    lonParam !== null &&
    latParam >= -90 &&
    latParam <= 90 &&
    lonParam >= -180 &&
    lonParam <= 180

  const lat = hasDeviceCoords ? (latParam as number) : DEFAULT_COORDS.lat
  const lon = hasDeviceCoords ? (lonParam as number) : DEFAULT_COORDS.lon
  const locationSource: 'device' | 'default' = hasDeviceCoords ? 'device' : 'default'
  const location = { lat, lon }

  // Cache per lokasi (dibulatkan ~1 km) supaya cuaca akurat per titik
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`

  const cachedEntry = weatherCache.get(cacheKey)
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
    return NextResponse.json({
      ...cachedEntry.data,
      cached: true,
      cache_age_ms: Date.now() - cachedEntry.timestamp,
    })
  }

  // Tanpa API key — kembalikan mock dengan indikasi jelas
  if (!apiKey) {
    const mockData: WeatherData = {
      ...MOCK_WEATHER,
      location,
      location_source: locationSource,
      cached: false,
    }
    weatherCache.set(cacheKey, { data: mockData, timestamp: Date.now() })
    return NextResponse.json(mockData)
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=id`,
      { next: { revalidate: 600 } }
    )

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`)
    }

    const data = await response.json()

    const now = Date.now()
    const threeHoursAgo = now - 3 * 60 * 60 * 1000

    let rain3h = 0
    for (const item of data.list) {
      const itemTime = item.dt * 1000
      if (itemTime >= threeHoursAgo && itemTime <= now) {
        rain3h += item.rain?.['3h'] || 0
      }
    }

    const current = data.list[0]

    const result: WeatherData = {
      rain_3h_mm: Math.round(rain3h * 10) / 10,
      temperature: Math.round(current.main.temp),
      humidity: current.main.humidity,
      description: current.weather[0]?.description || 'Tidak diketahui',
      source: 'openweathermap',
      location,
      location_source: locationSource,
      cached: false,
    }

    weatherCache.set(cacheKey, { data: result, timestamp: Date.now() })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Weather API error:', error)

    // Fallback mock — demo tidak boleh mati
    const fallbackData: WeatherData = {
      ...MOCK_WEATHER,
      source: 'mock_fallback',
      location,
      location_source: locationSource,
      cached: false,
    }
    weatherCache.set(cacheKey, { data: fallbackData, timestamp: Date.now() })
    return NextResponse.json(fallbackData)
  }
}
