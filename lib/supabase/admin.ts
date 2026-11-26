import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './env'

export function createAdminClient() {
  const { url, isConfigured } = getSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!isConfigured || !serviceRoleKey) throw new Error('Konfigurasi Supabase server belum tersedia.')
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
