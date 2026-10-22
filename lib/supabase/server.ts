import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig, supabaseNotConfiguredMessage } from './env'

function parseMockSession(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const sessionCookie = cookieStore.get('agriguard-mock-session')
  if (sessionCookie) {
    try {
      const session = JSON.parse(decodeURIComponent(sessionCookie.value))
      return session.user
    } catch {
      // ignore parse errors
    }
  }
  return null
}

function createMockQueryBuilder(data: any[]) {
  let filtered = [...data]

  const chainable = {
    select: () => chainable,
    data: filtered,
    error: null,
    eq: (col: string, val: any) => {
      filtered = filtered.filter(row => row[col] === val)
      return chainable
    },
    single: () => ({ data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } }),
    order: () => chainable,
    limit: () => chainable,
  }
  return chainable
}

function createDeniedQueryBuilder(isMutation: boolean) {
  const base = { data: null, error: { message: supabaseNotConfiguredMessage() } }
  const chainable = {
    ...base,
    select: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    single: () => base,
    then: (resolve: (v: any) => any) => resolve(isMutation ? { data: null, error: base.error } : base),
  }
  return chainable
}

function createMockSupabaseClient(mockUser: any) {
  const baseProfiles = [
    { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567890', full_name: 'Budi Santoso', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567891', full_name: 'Siti Rahayu', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567892', full_name: 'Pak PPL Sutrisno', role: 'ppl', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567893', full_name: 'Bu Dinas Lestari', role: 'dinas', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  ]

  // If we have a mock user from session, use/add it (flatten user_metadata -> profile columns)
  const mockUserProfile = mockUser
    ? {
        id: mockUser.id,
        phone: mockUser.user_metadata?.phone,
        full_name: mockUser.user_metadata?.full_name || '',
        role: mockUser.user_metadata?.role || 'petani',
        poktan_id: mockUser.user_metadata?.poktan_id || null,
      }
    : null

  const profiles = mockUserProfile ? [...baseProfiles, mockUserProfile] : baseProfiles

  // Only auth/demo tables (profiles, poktan) provide stub data in mock mode.
  // Authorization/mutations on business tables must fail loudly instead of faking success.
  const mockData: Record<string, any[]> = {
    profiles,
    poktan: [
      { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Poktan Sukamaju — Karawang', village: 'Sukamaju', district: 'Telukjambe Timur', invite_code: 'DEMO01' },
    ],
  }

  const DEMO_TABLES = new Set(['profiles', 'poktan'])

  if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[supabase] MOCK MODE ACTIVE (Supabase envar kosong). CRUD/read pada tabel bisnis DITOLAK dengan error agar tidak menyesatkan.')
  }

  return {
    auth: {
      getUser: async () => {
        if (mockUser) {
          return { data: { user: mockUser }, error: null }
        }
        return { data: { user: null }, error: null }
      },
    },
    from: (table: string) => {
      if (!DEMO_TABLES.has(table)) {
        return {
          select: () => createDeniedQueryBuilder(false),
          insert: (row: any) => createDeniedQueryBuilder(true),
          update: (row: any) => createDeniedQueryBuilder(true),
          delete: () => createDeniedQueryBuilder(true),
          upsert: (row: any) => createDeniedQueryBuilder(true),
        }
      }
      const data = mockData[table] || []
      return {
        select: (cols?: string) => createMockQueryBuilder(data),
        insert: (row: any) => ({ data: [row], error: null, select: () => ({ data: [row], error: null, single: () => ({ data: row, error: null }) }) }),
        update: (row: any) => ({ data: [row], error: null, eq: () => ({ data: [row], error: null }) }),
        delete: () => ({ data: null, error: null }),
        upsert: (row: any) => ({ data: [row], error: null }),
      }
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      }),
    },
  } as any
}

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey, isConfigured } = getSupabaseConfig()

  const mockUser = parseMockSession(cookieStore)

  if (!isConfigured) {
    return createMockSupabaseClient(mockUser)
  }

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // The `delete` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}
