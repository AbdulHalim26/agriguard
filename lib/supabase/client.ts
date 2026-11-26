import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig, supabaseNotConfiguredMessage } from './env'

export function createClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) throw new Error(supabaseNotConfiguredMessage())
  return createBrowserClient(url, anonKey)
}
