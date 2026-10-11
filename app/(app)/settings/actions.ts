'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Nama wajib diisi')
    .max(100, 'Nama terlalu panjang'),
})

// Hanya mengubah kolom full_name. Email & telepon bersifat read-only
// (dikelola auth Supabase) sehingga tidak dapat diubah dari sini.
export async function updateFullName(
  fullName: string
): Promise<{ error: string | null }> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Sesi berakhir. Silakan masuk kembali.' }
  }

  const parsed = schema.safeParse({ full_name: fullName })
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name })
    .eq('id', user.id)

  if (error) {
    console.error('[updateFullName] UPDATE gagal:', error.message)
    return { error: 'Gagal menyimpan nama. Coba lagi.' }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')

  return { error: null }
}
