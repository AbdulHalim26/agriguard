import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return {
      auth: {
        admin: {
          createUser: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        },
      },
      from: () => ({
        select: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        insert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        update: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        delete: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        upsert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        eq: function() { return this },
        single: function() { return this },
        order: function() { return this },
        limit: function() { return this },
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        }),
      },
    } as any
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}