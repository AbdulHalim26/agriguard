'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const lahanSchema = z.object({
  name: z.string().min(1, 'Nama lahan wajib diisi').max(100, 'Nama terlalu panjang'),
  area_hectares: z.coerce.number().positive('Luas harus lebih dari 0').max(1000, 'Luas terlalu besar'),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3, 'Minimal 3 titik polygon'),
})

export type LahanInput = z.infer<typeof lahanSchema>
export type LahanWithPolygon = {
  id: string
  poktan_id: string
  owner_id: string
  name: string
  area_hectares: number
  polygon: number[][]
  created_at: string
}

export async function listMyLahan(): Promise<{ data: LahanWithPolygon[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  const { data, error } = await supabase
    .from('lahan')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[listMyLahan] SELECT gagal:', error.message)
    return { data: null, error: error.message }
  }

  return { data: data as LahanWithPolygon[], error: null }
}

export async function createLahan(input: LahanInput): Promise<{ data: LahanWithPolygon | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('poktan_id')
    .eq('id', user.id)
    .single()

  if (!profile?.poktan_id) {
    return { data: null, error: 'Profil tidak lengkap (belum join Poktan)' }
  }

  const parsed = lahanSchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.errors[0].message }
  }

  const { data, error } = await supabase
    .from('lahan')
    .insert({
      owner_id: user.id,
      poktan_id: profile.poktan_id,
      name: parsed.data.name,
      area_hectares: parsed.data.area_hectares,
      polygon: parsed.data.polygon,
    })
    .select()
    .single()

  if (error) {
    console.error('[createLahan] INSERT gagal:', error.message)
    return { data: null, error: error.message }
  }

  revalidatePath('/lahan')
  revalidatePath('/dashboard')

  return { data: data as LahanWithPolygon, error: null }
}

export async function updateLahan(
  id: string,
  input: Partial<LahanInput>
): Promise<{ data: LahanWithPolygon | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  const { data: existing } = await supabase
    .from('lahan')
    .select('owner_id')
    .eq('id', id)
    .single()

  if (!existing) {
    return { data: null, error: 'Lahan tidak ditemukan' }
  }

  if (existing.owner_id !== user.id) {
    return { data: null, error: 'Tidak berhak mengubah lahan ini' }
  }

  const parsed = lahanSchema.partial().safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.errors[0].message }
  }

  const { data, error } = await supabase
    .from('lahan')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[updateLahan] UPDATE gagal:', error.message)
    return { data: null, error: error.message }
  }

  revalidatePath('/lahan')
  revalidatePath('/dashboard')

  return { data: data as LahanWithPolygon, error: null }
}
