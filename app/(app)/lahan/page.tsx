import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LahanList from './LahanList'
import LahanForm from './LahanForm'

export default async function LahanPage() {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Lahan Saya</h1>
        </div>
        <LahanForm />
        <LahanList />
      </div>
    </div>
  )
}