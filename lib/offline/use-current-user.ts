'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const CACHE_KEY = 'agriguard-user-id'

export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fallback ke sesi terakhir yang pernah online, agar form offline tetap
    // bisa menyimpan laporan ke antrian IndexedDB.
    try {
      const cached = window.localStorage.getItem(CACHE_KEY)
      if (cached && !cancelled) {
        setUserId(cached)
      }
    } catch {
      // ignore
    }

    const supabase = createClient()
    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        if (!cancelled && data.user) {
          setUserId(data.user.id)
          try {
            window.localStorage.setItem(CACHE_KEY, data.user.id)
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Offline: biarkan cached userId tetap dipakai.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return userId
}