import { NextResponse, type NextRequest } from 'next/server'

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

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Use mock client if no env vars
  const supabase = url && key
    ? (await import('@supabase/ssr')).createServerClient(url, key, {
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
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Public routes
  const publicRoutes = ['/login', '/onboarding']
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // Auth routes - redirect if already logged in
  if (isPublicRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

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
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const fullName = profile?.full_name || user.user_metadata?.full_name

    if (!fullName) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  // Role-based access for verifikasi (ppl/dinas only)
  if (user && pathname.startsWith('/verifikasi')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'ppl' && profile?.role !== 'dinas') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}