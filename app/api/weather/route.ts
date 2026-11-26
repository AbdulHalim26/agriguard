import { NextResponse } from 'next/server'
import { weatherContext } from '@/lib/ews/data'
import { getWeather } from '@/lib/ews/weather-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat'), lon = searchParams.get('lon')
  const number = (value: string | null) => value?.trim() ? Number(value) : NaN
  const context = weatherContext(lat === null && lon === null ? undefined : { lat: number(lat), lon: number(lon) })
  const data = await getWeather(context, searchParams.get('demo') === '1')
  return NextResponse.json(data, { status: context.coordinates ? 200 : 400, headers: { 'Cache-Control': 'no-store' } })
}
