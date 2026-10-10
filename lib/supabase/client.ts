import { createBrowserClient } from '@supabase/ssr'

// Seed user mapping (phone -> seed profile data)
const SEED_USERS: Record<string, { id: string; full_name: string; role: 'petani' | 'ppl' | 'dinas'; poktan_id: string }> = {
  '6281234567890': { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', full_name: 'Budi Santoso', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  '6281234567891': { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', full_name: 'Siti Rahayu', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  '6281234567892': { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', full_name: 'Pak PPL Sutrisno', role: 'ppl', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  '6281234567893': { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', full_name: 'Bu Dinas Lestari', role: 'dinas', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
}

function createMockUser(phone: string) {
  const seed = SEED_USERS[phone]
  if (seed) {
    return {
      id: seed.id,
      email: `${phone}@otp.agriguard.id`,
      user_metadata: {
        phone,
        full_name: seed.full_name,
        role: seed.role,
        poktan_id: seed.poktan_id,
      },
      created_at: new Date().toISOString(),
    }
  }
  const id = `mock-user-${phone.replace(/\D/g, '').slice(-8)}`
  return {
    id,
    email: `${phone}@otp.agriguard.id`,
    user_metadata: {
      phone,
      full_name: '',
      role: 'petani',
      poktan_id: null,
    },
    created_at: new Date().toISOString(),
  }
}

function createMockSession(user: ReturnType<typeof createMockUser>) {
  return {
    access_token: `mock-token-${user.id}`,
    refresh_token: `mock-refresh-${user.id}`,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
}

const mockUsers = new Map<string, ReturnType<typeof createMockUser>>()

function createMockQueryBuilder(data: any[]) {
  let filtered = [...data]

  const chainable = {
    select: (cols?: string) => chainable,
    data: filtered,
    error: null,
    eq: (col: string, val: any) => {
      filtered = filtered.filter(row => row[col] === val)
      return chainable
    },
    neq: (col: string, val: any) => {
      filtered = filtered.filter(row => row[col] !== val)
      return chainable
    },
    gte: (col: string, val: any) => {
      filtered = filtered.filter(row => row[col] >= val)
      return chainable
    },
    lte: (col: string, val: any) => {
      filtered = filtered.filter(row => row[col] <= val)
      return chainable
    },
    in: (col: string, vals: any[]) => {
      filtered = filtered.filter(row => vals.includes(row[col]))
      return chainable
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      filtered.sort((a, b) => {
        const asc = opts?.ascending !== false
        return asc ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1)
      })
      return chainable
    },
    limit: (n: number) => {
      filtered = filtered.slice(0, n)
      return chainable
    },
    single: () => {
      return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } }
    },
    then: (resolve: (v: any) => any) => resolve({ data: filtered, error: null }),
  }
  return chainable
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return a mock client for static generation and demo mode
    return {
      auth: {
        getUser: async () => {
          // Check for mock session in localStorage
          if (typeof window !== 'undefined') {
            const sessionStr = localStorage.getItem('agriguard-mock-session')
            if (sessionStr) {
              try {
                const session = JSON.parse(sessionStr)
                return { data: { user: session.user }, error: null }
              } catch {
                return { data: { user: null }, error: null }
              }
            }
          }
          return { data: { user: null }, error: null }
        },
        signInWithPassword: async ({ email }: { email: string; password: string }) => {
          const phone = email.replace('@otp.agriguard.id', '')
          let user = mockUsers.get(phone)
          if (!user) {
            user = createMockUser(phone)
            mockUsers.set(phone, user)
          }
          const session = createMockSession(user)
          if (typeof window !== 'undefined') {
            localStorage.setItem('agriguard-mock-session', JSON.stringify(session))
            document.cookie = `agriguard-mock-session=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=3600; SameSite=Lax`
          }
          return { data: { user, session }, error: null }
        },
        signUp: async ({ email, options }: { email: string; password: string; options?: { data?: Record<string, any> } }) => {
          const phone = email.replace('@otp.agriguard.id', '')
          let user = mockUsers.get(phone)
          if (!user) {
            user = createMockUser(phone)
            if (options?.data) {
              user.user_metadata = { ...user.user_metadata, ...options.data }
            }
            mockUsers.set(phone, user)
          }
          const session = createMockSession(user)
          if (typeof window !== 'undefined') {
            localStorage.setItem('agriguard-mock-session', JSON.stringify(session))
            document.cookie = `agriguard-mock-session=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=3600; SameSite=Lax`
          }
          return { data: { user, session }, error: null }
        },
        signOut: async () => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('agriguard-mock-session')
            document.cookie = 'agriguard-mock-session=; path=/; max-age=0; SameSite=Lax'
          }
          return { error: null }
        },
        getSession: async () => {
          if (typeof window !== 'undefined') {
            const sessionStr = localStorage.getItem('agriguard-mock-session')
            if (sessionStr) {
              try {
                return { data: { session: JSON.parse(sessionStr) }, error: null }
              } catch {
                return { data: { session: null }, error: null }
              }
            }
          }
          return { data: { session: null }, error: null }
        },
      },
      from: (table: string) => {
        const mockData: Record<string, any[]> = {
          profiles: [
            { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567890', full_name: 'Budi Santoso', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
            { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567891', full_name: 'Siti Rahayu', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
            { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567892', full_name: 'Pak PPL Sutrisno', role: 'ppl', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
            { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567893', full_name: 'Bu Dinas Lestari', role: 'dinas', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
          ],
          poktan: [
            { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Poktan Sukamaju — Karawang', village: 'Sukamaju', district: 'Telukjambe Timur', invite_code: 'DEMO01' },
          ],
          lahan: [
            { id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', owner_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Sawah Budi Blok A', area_hectares: 0.75, polygon: [[107.285,-6.312],[107.286,-6.312],[107.286,-6.313],[107.285,-6.313],[107.285,-6.312]] },
          ],
        }

        // Merge the mock session user's profile into profiles if it isn't a seed user,
        // so profile lookups by the current user's id resolve with their own data.
        if (table === 'profiles' && typeof window !== 'undefined') {
          const sessionStr = localStorage.getItem('agriguard-mock-session')
          if (sessionStr) {
            try {
              const session = JSON.parse(sessionStr)
              const u = session.user
              if (u && !mockData.profiles.some((p) => p.id === u.id)) {
                mockData.profiles.push({
                  id: u.id,
                  phone: u.user_metadata?.phone,
                  full_name: u.user_metadata?.full_name || '',
                  role: u.user_metadata?.role || 'petani',
                  poktan_id: u.user_metadata?.poktan_id || null,
                })
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        const data = mockData[table] || []

        return {
          select: (cols?: string) => createMockQueryBuilder(data),
          insert: (row: any) => ({ data: [row], error: null, select: () => ({ data: [row], error: null, single: () => ({ data: row, error: null }) }) }),
          update: (row: any) => {
            if (table === 'profiles' && typeof window !== 'undefined') {
              const sessionStr = localStorage.getItem('agriguard-mock-session')
              if (sessionStr) {
                try {
                  const session = JSON.parse(sessionStr)
                  if (session.user?.id === row.id || true) {
                    session.user.user_metadata = { ...session.user.user_metadata, ...row }
                    const updated = JSON.stringify(session)
                    localStorage.setItem('agriguard-mock-session', updated)
                    document.cookie = `agriguard-mock-session=${encodeURIComponent(updated)}; path=/; max-age=3600; SameSite=Lax`
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
            return { data: [row], error: null, eq: () => ({ data: [row], error: null, single: () => ({ data: row, error: null }) }) }
          },
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

  return createBrowserClient(url, key)
}