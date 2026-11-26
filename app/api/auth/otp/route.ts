import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { phoneOtp, PhoneOtpError } from '@/lib/auth/phone-otp'
import { isSameOriginRequest } from '@/lib/auth/origin'

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Origin tidak diizinkan.' }, { status: 403 })
  }
  try {
    const result = await phoneOtp(await request.json(), {
      client: await createClient(), admin: createAdminClient(),
      enabled: process.env.AUTH_PHONE_OTP_ENABLED === 'true',
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof PhoneOtpError ? error.message : 'Layanan autentikasi belum tersedia.' }, {
      status: error instanceof PhoneOtpError ? error.status : 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
