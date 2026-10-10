import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VerifikasiContent from './VerifikasiContent'
import OfflineFallback from '@/components/features/OfflineFallback'

export default async function VerifikasiPage() {
  let userId: string | null = null
  let fullName: string | null = null
  let role: string | null = null
  let loadFailed = false

  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single()
      fullName = profile?.full_name ?? null
      role = profile?.role ?? null
    }
  } catch (error) {
    // Supabase tidak terjangkau -> jangan crash/blank, tampilkan fallback.
    console.error('[verifikasi] gagal memuat data (offline?):', error)
    loadFailed = true
  }

  if (loadFailed) {
    return <OfflineFallback />
  }

  if (!userId) {
    redirect('/login')
  }

  if (!fullName) {
    redirect('/onboarding')
  }

  if (role !== 'ppl' && role !== 'dinas') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Verifikasi & Admin</h1>
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full capitalize">
            {role}
          </span>
        </div>
        <VerifikasiContent />
      </div>
    </div>
  )
}