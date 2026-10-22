import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { calculateSha256 } from '@/lib/geo'
import { analyzeImage } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Tidak terautentikasi' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const idempotencyKey = formData.get('idempotency_key') as string
    const userId = formData.get('user_id') as string
    const lahanId = formData.get('lahan_id') as string
    const latitude = parseFloat(formData.get('latitude') as string)
    const longitude = parseFloat(formData.get('longitude') as string)
    const clientCreatedAt = formData.get('client_created_at') as string
    const aiStatus = formData.get('ai_status') as 'aman' | 'rusak_ringan' | 'rusak_berat' | null
    const aiConfidence = formData.get('ai_confidence') ? parseFloat(formData.get('ai_confidence') as string) : null
    const aiDamagePct = formData.get('ai_damage_pct') ? parseFloat(formData.get('ai_damage_pct') as string) : null

    if (!idempotencyKey || !userId || !lahanId || isNaN(latitude) || isNaN(longitude) || !clientCreatedAt) {
      return NextResponse.json(
        { error: 'Data tidak lengkap' },
        { status: 400 }
      )
    }

    if (userId !== user.id) {
      return NextResponse.json(
        { error: 'User ID tidak cocok' },
        { status: 403 }
      )
    }

    // Check if lahan belongs to user or same poktan
    const { data: lahan, error: lahanError } = await supabase
      .from('lahan')
      .select('id, owner_id, poktan_id, polygon')
      .eq('id', lahanId)
      .single()

    if (lahanError || !lahan) {
      return NextResponse.json(
        { error: 'Lahan tidak ditemukan' },
        { status: 404 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('poktan_id')
      .eq('id', user.id)
      .single()

    const isOwner = lahan.owner_id === user.id
    const isSamePoktan = profile?.poktan_id && profile.poktan_id === lahan.poktan_id

    if (!isOwner && !isSamePoktan) {
      return NextResponse.json(
        { error: 'Tidak memiliki akses ke lahan ini' },
        { status: 403 }
      )
    }

    // Validate geofence
    const polygon = lahan.polygon as number[][]
    const isInside = validateGeofence(latitude, longitude, polygon)

    if (!isInside) {
      return NextResponse.json(
        { error: 'Lokasi laporan di luar batas lahan' },
        { status: 400 }
      )
    }

    // Idempotent: jika laporan (idempotency_key) sudah pernah tersimpan, jangan
    // proses ulang. Ini juga menghindari jalur UPDATE RLS (upsert pada baris
    // yang sudah ada) yang tidak diizinkan untuk petani -> tetap 200 tanpa duplikat.
    const { data: existingByKey } = await supabase
      .from('damage_reports')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingByKey) {
      return NextResponse.json({ success: true, id: existingByKey.id })
    }

    // Process photos
    const photos: File[] = []
    for (const [key, value] of Array.from(formData.entries())) {
      if (key.startsWith('photos') && value instanceof File) {
        photos.push(value)
      }
    }

    if (photos.length === 0) {
      return NextResponse.json(
        { error: 'Minimal 1 foto diperlukan' },
        { status: 400 }
      )
    }

    if (photos.length > 3) {
      return NextResponse.json(
        { error: 'Maksimal 3 foto per laporan' },
        { status: 400 }
      )
    }

    // Calculate hash of first photo for dedupe
    const firstPhotoHash = await calculateSha256(photos[0])

    // Check dedupe: same hash from same user within 24 hours.
    // Exclude idempotency_key sendiri agar re-sync (retry/dup) tidak diblokir.
    const dedupeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingReport } = await supabase
      .from('damage_reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('photo_hash', firstPhotoHash)
      .neq('idempotency_key', idempotencyKey)
      .gte('server_created_at', dedupeCutoff)
      .limit(1)

    if (existingReport && existingReport.length > 0) {
      return NextResponse.json(
        { error: 'Foto serupa sudah dilaporkan dalam 24 jam terakhir' },
        { status: 409 }
      )
    }

    // Upload photos to storage. upsert:true agar re-sync laporan yang sama
    // (foto sudah terupload sebagian) tidak gagal.
    const photoPaths: string[] = []
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      const ext = photo.type === 'image/png' ? 'png' : 'jpg'
      const path = `${user.id}/reports/${idempotencyKey}_${i}.${ext}`

      const { error: uploadError } = await admin.storage
        .from('photos')
        .upload(path, photo, {
          contentType: photo.type,
          upsert: true,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: 'Gagal mengupload foto' },
          { status: 500 }
        )
      }

      photoPaths.push(path)
    }

    // Insert report (upsert by idempotency_key)
    const { data: inserted, error: reportError } = await supabase
      .from('damage_reports')
      .upsert({
        idempotency_key: idempotencyKey,
        user_id: userId,
        lahan_id: lahanId,
        photo_paths: photoPaths,
        photo_hash: firstPhotoHash,
        ai_status: aiStatus,
        ai_confidence: aiConfidence,
        ai_damage_pct: aiDamagePct,
        latitude,
        longitude,
        client_created_at: clientCreatedAt,
      }, {
        onConflict: 'idempotency_key',
      })
      .select('id')
      .single()

    if (reportError) {
      return NextResponse.json(
        { error: 'Gagal menyimpan laporan' },
        { status: 500 }
      )
    }

    // FR-03 lanjutan: laporan yang diantre offline tersimpan dengan ai_status
    // NULL. Begitu online & baris tersimpan, jalankan analisis AI di server
    // (server-to-server ke AI_API_URL) lalu lengkapi baris. Dipilih di server
    // (bukan dari klien) agar analisis tetap berjalan walau tab ditutup setelah
    // sync, dan tidak bergantung pada jaringan klien. Laporan dengan status
    // manual (ai_status terisi) tidak dianalisis ulang.
    let finalAiStatus = aiStatus
    let finalAiConfidence = aiConfidence
    let finalAiDamagePct = aiDamagePct

    if (aiStatus === null) {
      try {
        const result = await analyzeImage(photos[0])
        const { error: aiUpdateError } = await admin
          .from('damage_reports')
          .update({
            ai_status: result.status,
            ai_confidence: result.confidence,
            ai_damage_pct: result.damage_pct,
          })
          .eq('id', inserted.id)

        if (!aiUpdateError) {
          finalAiStatus = result.status
          finalAiConfidence = result.confidence
          finalAiDamagePct = result.damage_pct
        } else {
          console.warn('[sync] gagal menyimpan hasil AI:', aiUpdateError.message)
        }
      } catch (aiError) {
        // Analisis gagal (mis. AI service offline): laporan tetap tersimpan
        // dengan ai_status NULL dan akan tampil sebagai "Menunggu Analisis AI".
        console.warn('[sync] analisis AI tertunda gagal:', aiError)
      }
    }

    // Audit log (entity_id = id laporan sebenarnya, bukan idempotency_key)
    await admin
      .from('audit_logs')
      .insert({
        actor_id: user.id,
        action: 'submit_report',
        entity: 'damage_reports',
        entity_id: inserted.id,
        meta: { lahan_id: lahanId, ai_status: finalAiStatus },
      })

    return NextResponse.json({
      success: true,
      id: inserted.id,
      ai_status: finalAiStatus,
      ai_confidence: finalAiConfidence,
      ai_damage_pct: finalAiDamagePct,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    )
  }
}

function validateGeofence(
  latitude: number,
  longitude: number,
  polygon: number[][]
): boolean {
  const [x, y] = [longitude, latitude]
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}
