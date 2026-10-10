import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardContent from './DashboardContent'
import OfflineFallback from '@/components/features/OfflineFallback'

export default async function DashboardPage() {
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
    console.error('[dashboard] gagal memuat data (offline?):', error)
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

  const demoMode = (process.env.OTP_MODE || 'mock') === 'mock'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <DashboardContent
          userName={fullName}
          userId={userId}
          demoMode={demoMode}
          role={role}
        />
      </div>
    </div>
  )
}