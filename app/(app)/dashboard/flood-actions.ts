'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Coordinates } from '@/lib/ews/data'
import { ewsDemoEnabled, ewsPolicy, getWeather } from '@/lib/ews/weather-server'
import { assessFlood } from '@/lib/ews/assessment-server'
import type { FloodAssessment } from '@/lib/ews/assessment'
export type FloodStatusData = FloodAssessment

export async function getFloodStatus(coords?: Coordinates, options: { simulation?: boolean; expectedUserId?: string } = {}):
  Promise<{ data: FloodAssessment | null; error: string | null }> {
  try {
    return await assessFlood({ client: await createClient(), admin: createAdminClient, now: Date.now,
      policy: ewsPolicy, demoEnabled: ewsDemoEnabled, weather: getWeather }, coords, options)
  } catch {
    return { data: null, error: 'Penilaian EWS belum dapat dimuat. Kondisi aman belum dapat disimpulkan.' }
  }
}
