'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getOtpService, isMockMode } from '@/lib/auth/otp'
import { normalizePhone } from '@/lib/utils'
import BrandLogo from '@/components/brand/BrandLogo'
import { Waves, Sparkles, ClipboardList, Sprout } from 'lucide-react'

const BENEFITS = [
  {
    icon: Waves,
    title: 'Deteksi Dini',
    desc: 'Peringatan banjir hiper-lokal untuk lahan Anda.',
  },
  {
    icon: Sparkles,
    title: 'Rekomendasi AI',
    desc: 'Analisis foto sawah dengan penilaian otomatis.',
  },
  {
    icon: ClipboardList,
    title: 'Hasil & Laporan',
    desc: 'Laporan tersimpan rapi dan siap diverifikasi.',
  },
  {
    icon: Sprout,
    title: 'Mendukung Ketahanan Pangan',
    desc: 'Membantu petani mengambil keputusan lebih cepat.',
  },
]

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

        const email = `${normalizedPhone}@otp.agriguard.id`
        const password = `AgriGuard-${normalizedPhone.slice(-6)}`

        let { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

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
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-2">
      <div className="relative h-52 lg:h-auto overflow-hidden">
        <Image
          src="/ilustrations/hero-tentang.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1B5E20] via-[#1B5E20]/80 to-[#2E7D32]/40 lg:via-[#1B5E20]/65 lg:to-[#2E7D32]/25" />
        <div className="relative h-full flex flex-col justify-between p-4 lg:p-10 xl:p-14 text-white">
          <BrandLogo variant="white" size="lg" />

          {/* Heading ringkas untuk mobile (desktop memakai blok lengkap di bawah) */}
          <h2 className="lg:hidden text-base font-bold leading-snug max-w-[280px]">
            Kita Jaga Masa Depan Pertanian Indonesia
          </h2>

          <div className="hidden lg:block">
            <h2 className="text-2xl xl:text-3xl font-bold leading-tight mb-6">
              Bersama Teknologi
              <br />
              Kita Jaga Masa Depan
              <br />
              <span className="text-[#A5D6A7]">Pertanian Indonesia</span>
            </h2>
            <ul className="space-y-4 max-w-md">
              {BENEFITS.map((b) => (
                <li key={b.title} className="flex gap-3 items-start">
                  <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <b.icon size={20} className="text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold">{b.title}</p>
                    <p className="text-sm text-green-50/80">{b.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="hidden lg:block text-xs text-green-50/70">
            AgriGuard — peringatan dini banjir sawah hiper-lokal.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-white px-4 py-8 lg:py-12">
        <div className="w-full max-w-md">
          <div className="hidden lg:flex justify-center mb-6">
            <BrandLogo variant="color" size="md" />
          </div>
          <h1 className="text-2xl font-bold text-center text-[#0B2545]">
            Hai, selamat datang kembali
          </h1>
          <p className="text-gray-500 text-center mt-1 mb-6">Masuk dengan nomor WhatsApp Anda</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          {mockMode && mockCode && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm" role="status">
              <strong>Mode Demo: </strong>Kode OTP Anda adalah{' '}
              <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono">{mockCode}</code>
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
                  className="w-full py-3 min-h-[48px] bg-[#2E7D32] text-white font-medium rounded-lg hover:bg-[#276b2a] focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="w-full py-3 min-h-[48px] bg-[#2E7D32] text-white font-medium rounded-lg hover:bg-[#276b2a] focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            Dengan masuk, Anda menyetujui Syarat &amp; Ketentuan dan Kebijakan Privasi AgriGuard.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white px-4 py-12">Memuat...</div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
