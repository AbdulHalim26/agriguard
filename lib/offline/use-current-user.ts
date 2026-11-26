'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { rememberOfflineUser, rememberedOfflineUser } from './identity'

export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let changed = false
    const update = (id: string | null) => {
      if (cancelled) return
      setUserId(id)
      rememberOfflineUser(id)
    }
    const client = createClient()
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      changed = true
      update(session?.user.id ?? null)
    })
    // This identity is a LOCAL queue label, never server authorization.
    // Synchronization independently revalidates the active server session.
    client.auth.getSession().then(({ data, error }) => {
      if (changed || cancelled) return
      if (error?.name === 'AuthRetryableFetchError') setUserId(rememberedOfflineUser())
      else update(data.session?.user.id ?? null)
    }).catch(() => {
      if (!cancelled && !changed) setUserId(rememberedOfflineUser())
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])
  return userId
}
