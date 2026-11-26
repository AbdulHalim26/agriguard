// Browser transport only. OTP issuance/verification is performed by Supabase
// Auth through the server endpoint; no local codes, credentials, or fallback.
export async function submitOtp(input: { phone: string; code?: string; mode: 'login' | 'register' }) {
  const response = await fetch('/api/auth/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await response.json()
  if (!response.ok || body.success !== true) throw new Error(body.error || 'Autentikasi gagal. Silakan coba lagi.')
  return body as { success: true; next?: '/dashboard' | '/onboarding' }
}
