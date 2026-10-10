'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!fullName.trim()) {
      setError('Nama lengkap wajib diisi')
      setLoading(false)
      return
    }

    if (!inviteCode.trim()) {
      setError('Kode undangan Poktan wajib diisi')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Sesi tidak valid. Silakan login ulang.')
        setLoading(false)
        return
      }

      const { data: poktan, error: poktanError } = await supabase
        .from('poktan')
        .select('id')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (poktanError || !poktan) {
        setError('Kode undangan tidak valid')
        setLoading(false)
        return
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          poktan_id: poktan.id,
        })
        .eq('id', user.id)

      if (profileError) {
        throw profileError
      }

      // Update mock session cookie with new full_name
      if (typeof window !== 'undefined') {
        const sessionStr = localStorage.getItem('agriguard-mock-session')
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr)
            session.user.user_metadata.full_name = fullName.trim()
            session.user.user_metadata.poktan_id = poktan.id
            const updatedSession = JSON.stringify(session)
            localStorage.setItem('agriguard-mock-session', updatedSession)
            document.cookie = `agriguard-mock-session=${encodeURIComponent(updatedSession)}; path=/; max-age=3600; SameSite=Lax`
          } catch {
            // ignore parse errors
          }
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Gagal menyimpan profil. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Lengkapi Profil</h1>
          <p className="text-gray-500 mt-1">Bergabung dengan Poktan Anda</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                Nama Lengkap
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                disabled={loading}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
                Kode Undangan Poktan
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Contoh: DEMO01"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-center tracking-wider text-lg"
                disabled={loading}
                autoComplete="off"
                required
                maxLength={10}
              />
              <p className="mt-1 text-xs text-gray-500">Dapatkan kode dari ketua Poktan Anda</p>
            </div>

            <button
              type="submit"
              disabled={loading || !fullName.trim() || !inviteCode.trim()}
              className="w-full py-3 min-h-[48px] bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Menyimpan...' : 'Gabung & Masuk'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Belum punya kode? Hubungi ketua Poktan di desa Anda.
        </p>
      </div>
    </div>
  )
}