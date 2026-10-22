import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditTrail from './AuditTrail'
import OfflineFallback from '@/components/features/OfflineFallback'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  let userId: string | null = null
  let fullName: string | null = null
  let role: string | null = null
  let loadFailed = false

  try {
    const supabase = await createClient()
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
    console.error('[audit] gagal memuat data (offline?):', error)
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
            <p className="text-gray-500 mt-1">
              Riwayat aktivitas verifikasi dan pelaporan
            </p>
          </div>
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full capitalize">
            {role}
          </span>
        </div>
        <AuditTrail />
      </div>
    </div>
  )
}
