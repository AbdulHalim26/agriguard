import { AuthError, type SupabaseClient } from '@supabase/supabase-js'

// Only call this for the EXACT token already validated by Auth.getUser(token).
// Decoding a JWT alone is never authentication.
export function hasPhoneOtpClaims(token: string, userId: string, phone: string): boolean {
  try {
    const payload = token.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return claims.sub === userId &&
      claims.role === 'authenticated' &&
      claims.phone === phone && phone.length > 0 &&
      Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now() &&
      Array.isArray(claims.amr) && claims.amr.some((entry: { method?: string }) => entry?.method === 'otp')
  } catch {
    return false
  }
}

type SessionAuth = Pick<SupabaseClient['auth'], 'getUser' | 'getSession'>

export async function getPhoneOtpUser(auth: SessionAuth, jwt?: string) {
  const denied = () => ({
    data: { user: null },
    error: new AuthError('Silakan masuk menggunakan OTP telepon yang terverifikasi.', 401, 'phone_otp_required'),
  })
  let token = jwt
  if (!token) {
    const { data, error } = await auth.getSession()
    if (error || !data.session) return denied()
    token = data.session.access_token
  }

  // Validate this token remotely before inspecting its authentication method.
  const result = await auth.getUser(token)
  const user = result.data.user
  if (result.error || !user) return result
  if (!user.phone_confirmed_at || !hasPhoneOtpClaims(token, user.id, user.phone || '')) return denied()
  return result
}

// Keep the existing server-client API, including every existing getUser guard.
// Capture the original method to avoid recursive validation / SDK fallback calls.
export function requirePhoneOtpSession<T extends SupabaseClient>(client: T): T {
  const auth = {
    getUser: client.auth.getUser.bind(client.auth),
    getSession: client.auth.getSession.bind(client.auth),
  }
  client.auth.getUser = async (jwt?: string) => {
    const result = await getPhoneOtpUser(auth, jwt)
    if (result.error || !result.data.user) return result
    const user = result.data.user
    const { data: profile, error } = await client.from('profiles').select('phone').eq('id', user.id).maybeSingle()
    // A stolen legacy password must not allow rebinding an officer account to
    // the attacker's phone via Auth.updateUser + a new phone OTP login.
    if (error || !profile || profile.phone !== user.phone) {
      return { data: { user: null }, error: new AuthError('Nomor akun memerlukan verifikasi pengelola.', 401, 'phone_identity_mismatch') }
    }
    return result
  }
  return client
}
