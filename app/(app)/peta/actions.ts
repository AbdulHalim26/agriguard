'use server'

import { createClient } from '@/lib/supabase/server'
import type { AiStatus } from '@/lib/recommendations'

export interface PetaLahan {
  id: string
  name: string
  area_hectares: number
  polygon: number[][]
  owner_name: string | null
}

export interface PetaReport {
  id: string
  lahan_id: string
  lahan_name: string | null
  owner_name: string | null
  ai_status: AiStatus | null
  ai_confidence: number | null
  ai_damage_pct: number | null
  latitude: number
  longitude: number
  server_created_at: string
  is_verified: boolean
  photo_url: string | null
}

export interface PetaData {
  lahan: PetaLahan[]
  reports: PetaReport[]
}

export async function getPetaData(): Promise<{
  data: PetaData | null
  error: string | null
}> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Tidak terautentikasi' }
  }

  // Lahan yang terlihat (RLS: milik sendiri ATAU satu poktan)
  const { data: lahanRows, error: lahanError } = await supabase
    .from('lahan')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: true })

  if (lahanError) {
    return { data: null, error: lahanError.message }
  }

  // Laporan yang terlihat (RLS: sendiri, satu poktan, atau ppl/dinas)
  const { data: reportRows, error: reportError } = await supabase
    .from('damage_reports')
    .select('*, lahan(id, name), profiles!damage_reports_user_id_fkey(full_name)')
    .order('server_created_at', { ascending: false })
    .limit(200)

  if (reportError) {
    return { data: null, error: reportError.message }
  }

  const lahan: PetaLahan[] = (lahanRows || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    area_hectares: Number(row.area_hectares),
    polygon: row.polygon,
    owner_name: row.profiles?.full_name ?? null,
  }))

  const reports: PetaReport[] = []
  for (const row of (reportRows || []) as any[]) {
    const firstPath = (row.photo_paths?.[0] as string) || null
    let photoUrl: string | null = null
    if (firstPath) {
      const { data: signed } = await supabase.storage
        .from('photos')
        .createSignedUrl(firstPath, 3600)
      photoUrl = signed?.signedUrl ?? null
    }
    reports.push({
      id: row.id,
      lahan_id: row.lahan_id,
      lahan_name: row.lahan?.name ?? null,
      owner_name: row.profiles?.full_name ?? null,
      ai_status: row.ai_status ?? null,
      ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
      ai_damage_pct: row.ai_damage_pct != null ? Number(row.ai_damage_pct) : null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      server_created_at: row.server_created_at,
      is_verified: row.is_verified,
      photo_url: photoUrl,
    })
  }

  return { data: { lahan, reports }, error: null }
}