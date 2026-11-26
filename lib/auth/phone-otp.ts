import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

const schema = z.object({
  phone: z.string().transform((phone) => phone.replace(/\D/g, '').replace(/^0/, '62'))
    .pipe(z.string().regex(/^628\d{8,12}$/, 'Nomor telepon tidak valid.')),
  code: z.string().regex(/^\d{6}$/, 'Kode OTP harus 6 digit.').optional(),
  mode: z.enum(['login', 'register']),
})

export class PhoneOtpError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function phoneOtp(
  input: unknown,
  { client, admin, enabled }: { client: SupabaseClient; admin: SupabaseClient; enabled: boolean }
) {
  if (!enabled) throw new PhoneOtpError('Login OTP aman belum diaktifkan. Hubungi pengelola untuk konfigurasi Phone Auth dan penautan akun lama.', 503)
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new PhoneOtpError(parsed.error.errors[0].message)
  const { phone, code, mode } = parsed.data

  // Do not create a second UUID for a legacy email-alias account. Linking phone
  // identities is an operator-reviewed prerequisite, never an automatic mutation.
  const { data: profile, error: lookupError } = await admin.from('profiles').select('id').eq('phone', phone).maybeSingle()
  if (lookupError) throw new PhoneOtpError('Layanan autentikasi belum tersedia.', 503)
  if (profile) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id)
    if (error || data.user?.phone !== phone) {
      throw new PhoneOtpError('Akun memerlukan penautan nomor telepon oleh pengelola. Data dan peran akun tetap dipertahankan.', 409)
    }
  }

  if (!code) {
    const { error } = await client.auth.signInWithOtp({
      phone: `+${phone}`,
      options: { channel: 'sms', shouldCreateUser: mode === 'register', data: { full_name: '' } },
    })
    if (error) throw new PhoneOtpError('OTP tidak dapat dikirim. Periksa nomor atau hubungi pengelola untuk kesiapan layanan SMS.', error.status === 429 ? 429 : 503)
    return { success: true as const }
  }

  const { data, error } = await client.auth.verifyOtp({ phone: `+${phone}`, token: code, type: 'sms' })
  if (error || !data.user || !data.session) throw new PhoneOtpError('Kode OTP tidak valid atau kedaluwarsa.', 401)
  // Uses the hardened server client, so a missing/invalid session is rejected.
  const checked = await client.auth.getUser()
  if (checked.error || checked.data.user?.id !== data.user.id) throw new PhoneOtpError('Sesi OTP gagal diverifikasi.', 401)
  const { data: currentProfile, error: profileError } = await client.from('profiles').select('full_name').eq('id', data.user.id).single()
  if (profileError || !currentProfile) throw new PhoneOtpError('Profil akun belum siap. Hubungi pengelola.', 409)
  return { success: true as const, next: currentProfile.full_name ? '/dashboard' as const : '/onboarding' as const }
}
