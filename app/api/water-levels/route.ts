import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('water_levels')
    .select('district, river_level_m, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return NextResponse.json(null)
  }

  return NextResponse.json(data[0])
}