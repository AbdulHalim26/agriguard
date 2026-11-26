'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ewsPolicy } from '@/lib/ews/weather-server'
import { readWaterLevels, saveWaterLevel, type WaterLevelInput } from '@/lib/ews/water-server'
export type { WaterLevelInput, WaterLevelData } from '@/lib/ews/water-server'

async function dependencies() {
  return { client: await createClient(), admin: createAdminClient, now: Date.now, policy: ewsPolicy }
}

export async function upsertWaterLevel(input: WaterLevelInput) {
  try {
    const result = await saveWaterLevel(input, await dependencies())
    revalidatePath('/verifikasi')
    revalidatePath('/dashboard')
    return result
  } catch {
    return { data: null, error: 'Layanan tinggi air belum tersedia. Periksa koneksi lalu coba lagi.' }
  }
}

export async function listWaterLevels() {
  try { return await readWaterLevels(await dependencies()) }
  catch { return { data: null, error: 'Data tinggi air belum dapat dimuat.', valid_for_ms: 0 } }
}

export async function getLatestWaterLevel(district?: string) {
  try {
    const result = await readWaterLevels(await dependencies(), district, true)
    return { ...result, data: result.data?.[0] ?? null }
  } catch { return { data: null, error: 'Data tinggi air belum dapat dimuat.', valid_for_ms: 0 } }
}
