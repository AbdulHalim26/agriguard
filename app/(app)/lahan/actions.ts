'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeLahan, type LahanInput, type LahanWithPolygon } from '@/lib/land/server'
export type { LahanInput, LahanWithPolygon } from '@/lib/land/server'

export async function listMyLahan(expectedUserId?: string): Promise<{ data: LahanWithPolygon[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }
  if (expectedUserId && user.id !== expectedUserId) return { data: null, error: 'Akun aktif berubah. Muat ulang data lahan.' }

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

export async function createLahan(input: LahanInput) {
  try {
    const result = await writeLahan(input, await createClient())
    if (result.data) { revalidatePath('/lahan'); revalidatePath('/dashboard') }
    return result
  } catch { return { data: null, error: 'Layanan lahan belum tersedia. Coba lagi.', code: 'LAND_SERVICE_UNAVAILABLE', status: 503 } }
}

export async function updateLahan(
  id: string,
  input: Partial<LahanInput>
) {
  try {
    const result = await writeLahan(input, await createClient(), { id })
    if (result.data) { revalidatePath('/lahan'); revalidatePath('/dashboard') }
    return result
  } catch { return { data: null, error: 'Layanan lahan belum tersedia. Coba lagi.', code: 'LAND_SERVICE_UNAVAILABLE', status: 503 } }
}
