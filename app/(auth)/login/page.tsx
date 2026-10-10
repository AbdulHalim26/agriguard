'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getOtpService, isMockMode } from '@/lib/auth/otp'
import { normalizePhone } from '@/lib/utils'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mockCode, setMockCode] = useState<string | null>(null)

  const otpService = getOtpService()
  const mockMode = isMockMode()

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone.startsWith('628') || normalizedPhone.length < 11) {
      setError('Nomor WhatsApp tidak valid. Contoh: 081234567890')
      setLoading(false)
      return
    }

    try {
      const result = await otpService.requestOtp(normalizedPhone)
      if (result.success) {
        setStep('code')
        if (mockMode && result.code) {
          setMockCode(result.code)
        }
      } else {
        setError(result.error || 'Gagal mengirim OTP')
      }
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const normalizedPhone = normalizePhone(phone)

    try {
      const result = await otpService.verifyOtp(normalizedPhone, code)
      if (result.success) {
        const supabase = createClient()
        
        // Sign in/up user with Supabase Auth using email alias
        const email = `${normalizedPhone}@otp.agriguard.id`
        // Generate a deterministic password from phone for demo (in production, use random stored securely)
        const password = `AgriGuard-${normalizedPhone.slice(-6)}`
        
        // Try sign in first
        let { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        // If sign in fails (user doesn't exist), sign up
        if (signInError) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                phone: normalizedPhone,
                full_name: '',
                role: 'petani',
              },
            },
          })
          
          if (signUpError) {
            throw signUpError
          }
          
          authData = signUpData
        }
        
        if (authData.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', authData.user.id)
            .single()

          if (profile?.full_name) {
            router.push('/dashboard')
            router.refresh()
          } else {
            router.push('/onboarding')
          }
        } else {
          router.push('/onboarding')
        }
      } else {
        setError(result.error || 'Kode OTP salah')
      }
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setCode('')
    await handleRequestOtp({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">AgriGuard</h1>
          <p className="text-gray-500 mt-1">Masuk untuk melanjutkan</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        {mockMode && mockCode && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm" role="status">
            <strong>Mode Demo: </strong>Kode OTP Anda adalah <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono">{mockCode}</code>
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleRequestOtp}>
            <div className="space-y-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Nomor WhatsApp
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  disabled={loading}
                  autoComplete="tel"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !phone}
                className="w-full py-3 min-h-[48px] bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Mengirim...' : 'Kirim Kode OTP'}
              </button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Kode OTP (6 digit)
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-center tracking-widest text-xl"
                  disabled={loading}
                  autoComplete="one-time-code"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 min-h-[48px] bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Memverifikasi...' : 'Verifikasi & Masuk'}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full py-2 min-h-[48px] text-sm text-gray-600 hover:text-gray-900"
              >
                Kirim ulang kode
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Dengan masuk, Anda menyetujui Syarat & Ketentuan dan Kebijakan Privasi AgriGuard.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">Memuat...</div>}>
      <LoginForm />
    </Suspense>
  )
}