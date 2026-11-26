import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireOfficer(client: SupabaseClient) {
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return { user: null, error: 'Tidak terautentikasi' }
  const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || !profile || (profile.role !== 'ppl' && profile.role !== 'dinas')) {
    return { user: null, error: 'Hanya PPL/Dinas yang dapat verifikasi laporan' }
  }
  return { user, error: null }
}
