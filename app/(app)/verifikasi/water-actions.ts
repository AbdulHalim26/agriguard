'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const waterLevelSchema = z.object({
  district: z.string().min(1, 'Kecamatan wajib diisi').max(100),
  river_level_m: z.coerce.number().min(0, 'Tinggi air tidak boleh negatif').max(10, 'Tinggi air terlalu besar'),
})

export type WaterLevelInput = z.infer<typeof waterLevelSchema>
export type WaterLevelData = {
  id: string
  district: string
  river_level_m: number
  updated_by: string | null
  updated_at: string
}

export async function upsertWaterLevel(
  input: WaterLevelInput
): Promise<{ data: WaterLevelData | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  // Check role - only ppl/dinas can update water levels
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'ppl' && profile.role !== 'dinas')) {
    return { data: null, error: 'Hanya PPL dan Dinas yang dapat mengupdate tinggi air' }
  }

  const parsed = waterLevelSchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.errors[0].message }
  }

  const { data, error } = await supabase
    .from('water_levels')
    .upsert({
      district: parsed.data.district,
      river_level_m: parsed.data.river_level_m,
      updated_by: user.id,
    }, {
      onConflict: 'district',
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  revalidatePath('/verifikasi')
  revalidatePath('/dashboard')

  return { data: data as WaterLevelData, error: null }
}

export async function listWaterLevels(): Promise<{ data: WaterLevelData[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  const { data, error } = await supabase
    .from('water_levels')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as WaterLevelData[], error: null }
}

export async function getLatestWaterLevel(district?: string): Promise<{ data: WaterLevelData | null; error: string | null }> {
  const supabase = await createClient()

  let query = supabase
    .from('water_levels')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (district) {
    query = query.eq('district', district)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return { data: null, error: null } // No data found
    }
    return { data: null, error: error.message }
  }

  return { data: data as WaterLevelData, error: null }
}
