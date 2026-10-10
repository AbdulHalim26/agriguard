import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VerifikasiContent from './VerifikasiContent'

export default async function VerifikasiPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile?.full_name) {
    redirect('/onboarding')
  }

  if (profile.role !== 'ppl' && profile.role !== 'dinas') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Verifikasi & Admin</h1>
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full capitalize">
            {profile.role}
          </span>
        </div>
        <VerifikasiContent />
      </div>
    </div>
  )
}