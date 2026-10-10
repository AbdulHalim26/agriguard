import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig, supabaseNotConfiguredMessage } from '@/lib/supabase/env'

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
  }
  return chainable
}

function createMockSupabaseServer(request: NextRequest) {
  // Read mock session from cookie
  let mockUser: any = null
  const sessionCookie = request.cookies.get('agriguard-mock-session')
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie.value)
      mockUser = session.user
    } catch {
      // ignore parse errors
    }
  }

  // Base mock data
  const baseProfiles = [
    { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567890', full_name: 'Budi Santoso', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567891', full_name: 'Siti Rahayu', role: 'petani', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567892', full_name: 'Pak PPL Sutrisno', role: 'ppl', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', phone: '6281234567893', full_name: 'Bu Dinas Lestari', role: 'dinas', poktan_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  ]

  // If we have a mock user from session, use/add it
  const profiles = mockUser ? [...baseProfiles, mockUser] : baseProfiles

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
      const mockData: Record<string, any[]> = {
        profiles,
        poktan: [
          { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Poktan Sukamaju — Karawang', village: 'Sukamaju', district: 'Telukjambe Timur', invite_code: 'DEMO01' },
        ],
      }

      const data = mockData[table] || []

      return {
        select: () => createMockQueryBuilder(data),
        update: (row: any) => ({
          data: [row],
          error: null,
          eq: () => ({ data: [row], error: null }),
        }),
      }
    },
  } as any
}

async function fetchProfile(
  request: NextRequest,
  isConfigured: boolean,
  url: string,
  anonKey: string,
  userId: string
) {
  if (isConfigured) {
    const { createServerClient } = await import('@supabase/ssr')
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
        },
      },
    })
    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', userId).single()
    return data
  }
  const mock = createMockSupabaseServer(request)
  const { data } = await mock.from('profiles').select('full_name, role').eq('id', userId).single()
  return data
}

export async function middleware(request: NextRequest) {
  const { url, anonKey, isConfigured } = getSupabaseConfig()

  if (!isConfigured && process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
    console.warn('[supabase] middleware: MOCK MODE ACTIVE (Supabase envar kosong).')
  }

  const pathname = request.nextUrl.pathname

  try {
    // Use mock client only when env vars are truly empty
    const supabase = isConfigured
      ? (await import('@supabase/ssr')).createServerClient(url, anonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) =>
                request.cookies.set(name, value)
              )
            },
          },
        })
      : createMockSupabaseServer(request)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    // Supabase tidak terjangkau (offline/network error): jangan blokir semua
    // request. Halaman & error boundary akan menangani mode offline-nya.
    if (authError && !user) {
      return NextResponse.next()
    }

    // Public routes
    const publicRoutes = ['/login', '/onboarding']
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

    // Auth routes - redirect if already logged in
    if (isPublicRoute && user) {
      const profile = await fetchProfile(request, isConfigured, url, anonKey, user.id)
      const fullName = profile?.full_name || user.user_metadata?.full_name

      if (pathname === '/onboarding') {
        // Never redirect /onboarding to itself (would cause an infinite loop).
        // Allow filling the form if profile is incomplete, otherwise go to dashboard.
        if (fullName) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } else {
        return NextResponse.redirect(fullName ? new URL('/dashboard', request.url) : new URL('/onboarding', request.url))
      }
    }

    // Protected routes - redirect to login if not authenticated
    const protectedRoutes = ['/dashboard', '/lahan', '/scan', '/laporan', '/peta', '/verifikasi']
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

    if (isProtectedRoute && !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Check onboarding completion for app routes (except onboarding itself)
    if (user && isProtectedRoute) {
      const profile = await fetchProfile(request, isConfigured, url, anonKey, user.id)

      const fullName = profile?.full_name || user.user_metadata?.full_name

      if (!fullName) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }

      // Role-based access for verifikasi (ppl/dinas only)
      if (pathname.startsWith('/verifikasi')) {
        const role = profile?.role || user.user_metadata?.role
        if (role !== 'ppl' && role !== 'dinas') {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      }
    }
  } catch (error) {
    console.warn('[supabase] middleware: gagal verifikasi (offline?), lanjut tanpa blokir.', error)
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}