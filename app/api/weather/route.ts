import { NextResponse } from 'next/server'

interface WeatherData {
  rain_3h_mm: number
  temperature: number
  humidity: number
  description: string
  source: 'openweathermap' | 'mock' | 'mock_fallback'
  cached?: boolean
  cache_age_ms?: number
}

const MOCK_WEATHER: WeatherData = {
  rain_3h_mm: 15,
  temperature: 28,
  humidity: 78,
  description: 'Hujan ringan',
  source: 'mock',
}

let weatherCache: { data: WeatherData; timestamp: number } | null = null
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

export async function GET() {
  const apiKey = process.env.OPENWEATHER_API_KEY

  // Check cache first
  if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_DURATION) {
    return NextResponse.json({
      ...weatherCache.data,
      cached: true,
      cache_age_ms: Date.now() - weatherCache.timestamp,
    })
  }

  // No API key configured - return mock with clear indication
  if (!apiKey) {
    const mockData = { ...MOCK_WEATHER, source: 'mock' as const, cached: false }
    weatherCache = { data: mockData, timestamp: Date.now() }
    return NextResponse.json(mockData)
  }

  try {
    // Karawang coordinates
    const lat = -6.31
    const lon = 107.29

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

    const result = {
      rain_3h_mm: Math.round(rain3h * 10) / 10,
      temperature: Math.round(current.main.temp),
      humidity: current.main.humidity,
      description: current.weather[0]?.description || 'Tidak diketahui',
      source: 'openweathermap' as const,
      cached: false,
    }

    // Update cache
    weatherCache = { data: result, timestamp: Date.now() }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Weather API error:', error)

    // Return mock as fallback - demo must not crash
    const fallbackData = { ...MOCK_WEATHER, source: 'mock_fallback' as const, cached: false }
    weatherCache = { data: fallbackData, timestamp: Date.now() }
    return NextResponse.json(fallbackData)
  }
}