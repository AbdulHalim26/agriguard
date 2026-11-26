import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assessLandGeometry, declaredArea, type LngLat } from './geometry'

export type LahanInput = { name: string; area_hectares: number; polygon: LngLat[] }
export interface LahanWithPolygon {
  id: string; poktan_id: string; owner_id: string; name: string
  area_hectares: number; polygon: number[][]; created_at: string
}
export interface LandWriteResult {
  data: LahanWithPolygon | null
  error: string | null
  code?: string
  status: number
  geometry_assessment?: ReturnType<typeof assessLandGeometry>
}
const fields = z.object({
  name: z.string({ invalid_type_error: 'Nama lahan harus berupa teks.' }).trim().min(1, 'Nama lahan wajib diisi').max(100, 'Nama terlalu panjang'),
  area_hectares: z.preprocess((value) => declaredArea(value) ?? value,
    z.number({ invalid_type_error: 'Luas deklarasi harus berupa angka.' }).finite('Luas deklarasi harus angka finite.').positive('Luas deklarasi harus lebih dari 0').max(1000, 'Luas deklarasi maksimal 1000 ha')),
  polygon: z.unknown(),
}).strict('Field lahan tidak didukung. Identitas, Poktan, verifikasi, dan luas hitung tidak boleh ditentukan melalui payload ini.')
const fail = (code: string, error: string, status: number): LandWriteResult => ({ data: null, code, error, status })

export async function writeLahan(input: unknown, client: SupabaseClient, update?: { id: unknown }): Promise<LandWriteResult> {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return fail('AUTH_REQUIRED', 'Tidak terautentikasi', 401)
  let existing: LahanWithPolygon | null = null
  let targetId: string | undefined
  if (update !== undefined) {
    const parsedId = z.string().uuid().safeParse(update?.id)
    if (!parsedId.success) return fail('INVALID_LAND_ID', 'ID lahan tidak valid.', 400)
    targetId = parsedId.data
    const result = await client.from('lahan').select('*').eq('id', targetId).maybeSingle()
    if (result.error) return fail('LAND_LOOKUP_FAILED', 'Lahan belum dapat diperiksa. Coba lagi.', 503)
    existing = result.data as LahanWithPolygon | null
    if (!existing) return fail('LAND_NOT_FOUND', 'Lahan tidak ditemukan.', 404)
    if (existing.owner_id !== user.id) return fail('LAND_FORBIDDEN', 'Tidak berhak mengubah lahan ini.', 403)
  }
  const { data: profile, error: profileError } = await client.from('profiles').select('poktan_id').eq('id', user.id).single()
  if (profileError || !profile?.poktan_id) return fail('PROFILE_REQUIRED', 'Profil belum lengkap atau Poktan belum tersedia.', 403)
  if (existing && existing.poktan_id !== profile.poktan_id) {
    return fail('POKTAN_MISMATCH', 'Konteks Poktan lahan berbeda dari akun aktif. Minta pengelola memeriksa relasi; sistem tidak memindahkan lahan otomatis.', 403)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_LAND_INPUT', 'Payload perubahan lahan harus berupa object dengan field yang didukung.', 400)
  const parsed = (existing ? fields.partial() : fields).safeParse(input)
  if (!parsed.success) return fail('INVALID_LAND_INPUT', parsed.error.errors[0].message, 400)
  const values = parsed.data
  const suppliedPolygon = Object.prototype.hasOwnProperty.call(values, 'polygon')
  if (existing && Object.keys(values).length === 0) return fail('NO_CHANGES', 'Tidak ada perubahan lahan yang dikirim.', 400)
  const assessment = assessLandGeometry(suppliedPolygon ? values.polygon : existing?.polygon,
    values.area_hectares ?? existing?.area_hectares)
  if ((!existing || suppliedPolygon) && !assessment.geometry.valid) {
    const issue = assessment.geometry.errors[0]
    return { ...fail(issue.code, issue.message, 422), geometry_assessment: assessment }
  }
  // Metadata-only updates of legacy invalid geometry remain possible: do not
  // silently repair or resubmit an old ring. New/supplied boundaries must validate.
  const payload: Record<string, unknown> = {}
  if (values.name !== undefined) payload.name = values.name
  if (values.area_hectares !== undefined) payload.area_hectares = values.area_hectares
  if ((!existing || suppliedPolygon) && assessment.geometry.valid) payload.polygon = assessment.geometry.original_ring
  let result
  if (existing) {
    result = await client.from('lahan').update(payload).eq('id', targetId!).eq('owner_id', user.id)
      .eq('poktan_id', profile.poktan_id).select('*').maybeSingle()
  } else {
    result = await client.from('lahan').insert({ ...payload, owner_id: user.id, poktan_id: profile.poktan_id }).select('*').single()
  }
  if (result.error) return fail('LAND_SAVE_FAILED', 'Lahan belum dapat disimpan. Coba lagi.', 503)
  if (!result.data) return fail('LAND_CHANGED', 'Akses atau data lahan berubah. Muat ulang sebelum mencoba lagi.', 409)
  return { data: result.data as LahanWithPolygon, error: null, status: 200, geometry_assessment: assessment }
}
