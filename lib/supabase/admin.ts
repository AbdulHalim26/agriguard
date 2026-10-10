import { createClient } from '@supabase/supabase-js'
import { getSupabaseConfig, supabaseNotConfiguredMessage } from './env'

export function createAdminClient() {
  const { url, serviceRoleKey, isConfigured } = getSupabaseConfig()

  if (!isConfigured || !serviceRoleKey) {
    if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
      console.warn('[supabase] ADMIN CLIENT unavailable: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY kosong.')
    }

    return {
      auth: {
        admin: {
          createUser: async () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        },
      },
      from: () => ({
        select: () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        insert: () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        update: () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        delete: () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        upsert: () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        eq: function() { return this },
        single: function() { return this },
        order: function() { return this },
        limit: function() { return this },
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: supabaseNotConfiguredMessage() } }),
        }),
      },
    } as any
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}