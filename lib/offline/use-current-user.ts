'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (!cancelled && data.user) {
        setUserId(data.user.id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return userId
}