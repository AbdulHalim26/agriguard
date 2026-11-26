import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPhoneOtpUser } from '@/lib/auth/session'
import { VersioningError, type VersioningActor } from './contracts'

// Candidate adapter only; not called by current land/report endpoints.
export async function loadVersioningActor(client: SupabaseClient): Promise<VersioningActor> {
  const { data: { user }, error } = await getPhoneOtpUser(client.auth)
  if (error || !user) throw new VersioningError('AUTH_REQUIRED')
  const { data: profile, error: profileError } = await client.from('profiles').select('phone, poktan_id').eq('id', user.id).single()
  if (profileError || !profile?.poktan_id || profile.phone !== user.phone) throw new VersioningError('PINNED_PROFILE_REQUIRED')
  return { user_id: user.id, poktan_id: profile.poktan_id }
}
