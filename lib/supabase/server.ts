import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requirePhoneOtpSession } from '@/lib/auth/session'
import { getSupabaseConfig, supabaseNotConfiguredMessage } from './env'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) throw new Error(supabaseNotConfiguredMessage())

  return requirePhoneOtpSession(createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot write cookies; middleware handles refresh.
        }
      },
    },
  }))
}
