import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPhoneOtpUser } from '@/lib/auth/session'
import { getSupabaseConfig } from '@/lib/supabase/env'

const protectedRoutes = ['/dashboard', '/lahan', '/scan', '/laporan', '/peta', '/verifikasi', '/audit', '/notifikasi', '/settings', '/onboarding']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const protectedRoute = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  const loginRoute = pathname === '/login' || pathname === '/daftar'
  const { url, anonKey, isConfigured } = getSupabaseConfig()
  let response = NextResponse.next({ request })
  const redirect = (path: string) => {
    const result = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie))
    return result
  }

  if (!isConfigured) return protectedRoute ? redirect('/login') : response

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })
    const { data: { user }, error } = await getPhoneOtpUser(supabase.auth)
    if (error || !user) return protectedRoute ? redirect('/login') : response

    if (protectedRoute || loginRoute) {
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('full_name, role, phone').eq('id', user.id).single()
      if (profileError || profile?.phone !== user.phone) return protectedRoute ? redirect('/login') : response
      if (loginRoute) return redirect(profile?.full_name ? '/dashboard' : '/onboarding')
      if (!profile?.full_name && pathname !== '/onboarding') return redirect('/onboarding')
      if (profile?.full_name && pathname === '/onboarding') return redirect('/dashboard')
      if ((pathname.startsWith('/verifikasi') || pathname.startsWith('/audit')) &&
          profile?.role !== 'ppl' && profile?.role !== 'dinas') return redirect('/dashboard')
    }
  } catch {
    // Failed verification is never an authenticated session. An already open
    // offline scan still uses IndexedDB; server-rendered protected data stays closed.
    if (protectedRoute) return redirect('/login')
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
