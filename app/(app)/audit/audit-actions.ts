'use server'

import { createClient } from '@/lib/supabase/server'

export interface AuditLog {
  id: string
  action: string
  entity: string | null
  entity_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
  actor_name: string | null
}

async function requirePplDinas(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, error: 'Tidak terautentikasi' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'ppl' && profile.role !== 'dinas')) {
    return { user: null, error: 'Hanya PPL/Dinas yang dapat melihat audit trail' }
  }
  return { user, error: null }
}

export async function listAuditLogs(): Promise<{
  data: AuditLog[] | null
  error: string | null
}> {
  const supabase = createClient()

  const { user, error: guardError } = await requirePplDinas(supabase)
  if (!user) return { data: null, error: guardError }

  const { data: rows, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity, entity_id, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { data: null, error: error.message }

  const logRows = (rows || []) as Array<{
    id: string
    actor_id: string | null
    action: string
    entity: string | null
    entity_id: string | null
    meta: unknown
    created_at: string
  }>

  const actorIds = Array.from(
    new Set(logRows.map((r) => r.actor_id).filter((id): id is string => !!id))
  )

  const nameMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    for (const p of profiles || []) {
      nameMap.set(p.id, p.full_name)
    }
  }

  const logs: AuditLog[] = logRows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    created_at: r.created_at,
    actor_name: r.actor_id ? nameMap.get(r.actor_id) ?? null : null,
  }))

  return { data: logs, error: null }
}
