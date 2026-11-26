import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GALLERY_LOCATION_WARNING,
  PHOTO_EVIDENCE_DISCLAIMER,
  PHOTO_EVIDENCE_VERSION,
  buildWatermarkLines,
  captureSourceLabel,
  clientCaptureMetadataSchema,
  formatWibTimestamp,
  locationStatusLabel,
  type ServerPhotoEvidence,
} from '@/lib/reports/photo-evidence'
import { parseReportInput, ReportError } from '@/lib/reports/evidence'
import { submitEvidence } from '@/lib/reports/submit'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const LAHAN_ID = '22222222-2222-4222-8222-222222222222'
const IDEMP_KEY = '33333333-3333-4333-8333-333333333333'
const IDEMP_KEY_2 = '44444444-4444-4444-8444-444444444444'

const VALID_POLYGON = [
  [107.6, -6.9],
  [107.61, -6.9],
  [107.61, -6.89],
  [107.6, -6.89],
  [107.6, -6.9],
]

function sha256Hex(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

function makeFakeClients() {
  const reports: any[] = []
  const audits: any[] = []
  const uploads: Array<{ path: string; bytes: Uint8Array; contentType: string }> = []

  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from(table: string) {
      const filters: Record<string, any> = {}
      const neqFilters: Record<string, any> = {}
      const chain: any = {
        select: () => chain,
        eq(col: string, val: any) { filters[col] = val; return chain },
        neq(col: string, val: any) { neqFilters[col] = val; return chain },
        gte: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'damage_reports') {
            const found = reports.find((r) => r.user_id === filters.user_id && r.idempotency_key === filters.idempotency_key) ?? null
            return { data: found, error: null }
          }
          if (table === 'lahan') {
            return {
              data: filters.id === LAHAN_ID ? { id: LAHAN_ID, owner_id: USER_ID, poktan_id: 'poktan-1', polygon: VALID_POLYGON } : null,
              error: null,
            }
          }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'profiles') return { data: { poktan_id: 'poktan-1' }, error: null }
          return { data: null, error: null }
        },
        then(resolveFn: (v: any) => void) {
          if (table === 'damage_reports') {
            const matches = reports.filter((r) =>
              r.user_id === filters.user_id &&
              r.photo_hash === filters.photo_hash &&
              r.idempotency_key !== neqFilters.idempotency_key
            )
            resolveFn({ data: matches, error: null })
            return
          }
          resolveFn({ data: [], error: null })
        },
      }
      return chain
    },
  }

  const admin: any = {
    storage: {
      from: () => ({
        upload: async (path: string, file: File, opts: { contentType: string }) => {
          const bytes = new Uint8Array(await file.arrayBuffer())
          uploads.push({ path, bytes, contentType: opts.contentType })
          return { data: { path }, error: null }
        },
      }),
    },
    from(table: string) {
      return {
        insert(payload: any) {
          if (table === 'damage_reports') {
            const inserted = { ...payload, server_created_at: '2026-11-26T09:15:00.000Z' }
            reports.push(inserted)
            return {
              select: () => ({
                single: async () => ({ data: inserted, error: null }),
              }),
            }
          }
          if (table === 'audit_logs') {
            audits.push(payload)
            return Promise.resolve({ error: null })
          }
          return Promise.resolve({ error: null })
        },
      }
    },
  }

  return { client, admin, reports, audits, uploads }
}

test('buildWatermarkLines formats WIB timestamp, coordinates, verified region, parcel ID, and AgriGuard label', () => {
  const lines = buildWatermarkLines({
    gpsSnapshot: {
      latitude: -6.895123,
      longitude: 107.605456,
      accuracy_m: 12.4,
      captured_at: '2026-11-26T02:05:09.000Z',
    },
    locationStatus: 'gps_captured',
    deviceCapturedAt: '2026-11-26T02:05:09.000Z',
    regionLabel: 'Desa Sukamaju, Kec. Cianjur',
    lahanId: LAHAN_ID,
    captureSource: 'camera_capture',
  })

  assert.equal(lines.length, 4)
  assert.match(lines[0], /^AgriGuard · Kamera Aplikasi$/)
  assert.match(lines[1], /WIB · Lahan #22222222$/)
  assert.equal(lines[2], 'GPS: -6.895123, 107.605456 (±12 m)')
  assert.equal(lines[3], 'Wilayah: Desa Sukamaju, Kec. Cianjur')
  assert.match(formatWibTimestamp('2026-11-26T02:05:09.000Z'), /09:05:09 WIB/)
})

test('buildWatermarkLines handles gps_unavailable_unverified without fabricating GPS coordinates', () => {
  const lines = buildWatermarkLines({
    gpsSnapshot: null,
    locationStatus: 'gps_unavailable_unverified',
    deviceCapturedAt: '2026-11-26T02:05:09.000Z',
    regionLabel: null,
    lahanId: null,
    captureSource: 'gallery_upload',
  })

  assert.match(lines[0], /Unggahan Galeri/)
  assert.equal(lines[2], 'GPS: Lokasi belum terverifikasi')
  assert.equal(lines[3], 'Wilayah: Wilayah belum terverifikasi')
  assert.equal(captureSourceLabel('camera_capture'), 'Kamera Aplikasi')
  assert.equal(captureSourceLabel('gallery_upload'), 'Unggahan Galeri')
  assert.equal(captureSourceLabel(null), 'Tidak tercatat (data lama)')
  assert.equal(locationStatusLabel('gps_unavailable_unverified'), 'Lokasi GPS belum terverifikasi')
})

test('parseReportInput accepts valid capture_metadata and rejects malformed JSON or invalid schema', () => {
  const validForm = new FormData()
  validForm.append('lahan_id', LAHAN_ID)
  validForm.append('latitude', '-6.895')
  validForm.append('longitude', '107.605')
  validForm.append('idempotency_key', IDEMP_KEY)
  validForm.append('client_created_at', '2026-11-26T02:00:00.000Z')
  validForm.append('evidence_source', 'manual')
  validForm.append('manual_status', 'rusak_berat')
  validForm.append('capture_metadata', JSON.stringify({
    version: PHOTO_EVIDENCE_VERSION,
    capture_source: 'camera_capture',
    location_status: 'gps_captured',
    gps_snapshot: { latitude: -6.895, longitude: 107.605, accuracy_m: 9, captured_at: '2026-11-26T02:00:00.000Z' },
    device_captured_at: '2026-11-26T02:00:00.000Z',
    submitted_offline: false,
    region_label: 'Desa Sukamaju',
    geometry_version_id: null,
    watermark_applied: true,
    watermark_lines: ['AgriGuard · Kamera Aplikasi'],
  }))

  const parsed = parseReportInput(validForm)
  assert.equal(parsed.capture_metadata?.capture_source, 'camera_capture')
  assert.equal(parsed.capture_metadata?.gps_snapshot?.accuracy_m, 9)

  // Malformed JSON rejected
  const badJsonForm = new FormData()
  badJsonForm.append('lahan_id', LAHAN_ID)
  badJsonForm.append('latitude', '-6.895')
  badJsonForm.append('longitude', '107.605')
  badJsonForm.append('idempotency_key', IDEMP_KEY)
  badJsonForm.append('client_created_at', '2026-11-26T02:00:00.000Z')
  badJsonForm.append('evidence_source', 'manual')
  badJsonForm.append('manual_status', 'rusak_berat')
  badJsonForm.append('capture_metadata', '{not-json')
  assert.throws(() => parseReportInput(badJsonForm), ReportError)

  // Legacy submission without capture_metadata stays valid
  const legacyForm = new FormData()
  legacyForm.append('lahan_id', LAHAN_ID)
  legacyForm.append('latitude', '-6.895')
  legacyForm.append('longitude', '107.605')
  legacyForm.append('idempotency_key', IDEMP_KEY)
  legacyForm.append('client_created_at', '2026-11-26T02:00:00.000Z')
  legacyForm.append('evidence_source', 'manual')
  legacyForm.append('manual_status', 'rusak_berat')
  const legacyParsed = parseReportInput(legacyForm)
  assert.equal(legacyParsed.capture_metadata, null)
})

test('submitEvidence preserves byte-identical original + separate watermarked copy with SHA-256 and immutable audit binding', async () => {
  const { client, admin, reports, audits, uploads } = makeFakeClients()
  const originalBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const watermarkedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6, 5])
  const origHash = sha256Hex(originalBytes)
  const wmHash = sha256Hex(watermarkedBytes)

  const form = new FormData()
  form.append('lahan_id', LAHAN_ID)
  form.append('latitude', '-6.895')
  form.append('longitude', '107.605')
  form.append('idempotency_key', IDEMP_KEY)
  form.append('client_created_at', '2026-11-26T02:00:00.000Z')
  form.append('evidence_source', 'manual')
  form.append('manual_status', 'rusak_berat')
  form.append('photos', new File([originalBytes], 'original.png', { type: 'image/png' }))
  form.append('photos', new File([watermarkedBytes], 'watermarked.png', { type: 'image/png' }))
  form.append('capture_metadata', JSON.stringify(clientCaptureMetadataSchema.parse({
    version: PHOTO_EVIDENCE_VERSION,
    capture_source: 'camera_capture',
    location_status: 'gps_captured',
    gps_snapshot: { latitude: -6.895, longitude: 107.605, accuracy_m: 8.5, captured_at: '2026-11-26T02:00:00.000Z' },
    device_captured_at: '2026-11-26T02:00:00.000Z',
    submitted_offline: false,
    region_label: 'Desa Sukamaju, Kec. Cianjur',
    geometry_version_id: null,
    watermark_applied: true,
    watermark_lines: ['AgriGuard · Kamera Aplikasi'],
  })))

  const res = await submitEvidence(form, {
    client,
    admin,
    analyze: async () => { throw new Error('should not call AI for manual') },
  })

  assert.equal(res.success, true)
  assert.equal(res.original_photo_sha256, origHash)
  assert.equal(res.watermarked_photo_sha256, wmHash)
  assert.notEqual(origHash, wmHash)

  // Original uploaded file is byte-identical
  assert.equal(uploads.length, 2)
  assert.deepEqual(uploads[0].bytes, originalBytes)
  assert.deepEqual(uploads[1].bytes, watermarkedBytes)

  // damage_reports.photo_hash binds original photo, photo_paths has both
  assert.equal(reports.length, 1)
  assert.equal(reports[0].photo_hash, origHash)
  assert.equal(reports[0].photo_paths.length, 2)

  // audit_logs stores server-bound photo_evidence with separate server_received_at and disclaimer
  assert.equal(audits.length, 1)
  const ev = audits[0].meta.photo_evidence as ServerPhotoEvidence
  assert.equal(ev.version, PHOTO_EVIDENCE_VERSION)
  assert.equal(ev.report_id, res.id)
  assert.equal(ev.user_id, USER_ID)
  assert.equal(ev.lahan_id, LAHAN_ID)
  assert.equal(ev.capture_source, 'camera_capture')
  assert.equal(ev.geofence_status, 'INSIDE')
  assert.equal(ev.device_captured_at, '2026-11-26T02:00:00.000Z')
  assert.equal(ev.server_received_at, '2026-11-26T09:15:00.000Z')
  assert.notEqual(ev.device_captured_at, ev.server_received_at)
  assert.equal(ev.original_photo_sha256, origHash)
  assert.equal(ev.watermarked_photo_sha256, wmHash)
  assert.equal(ev.authenticity_note, PHOTO_EVIDENCE_DISCLAIMER)

  // Idempotent retry with identical payload returns same report without duplicating rows or audit entries
  const retry = await submitEvidence(form, {
    client,
    admin,
    analyze: async () => { throw new Error('should not call AI') },
  })
  assert.equal(retry.id, res.id)
  assert.equal(reports.length, 1)
  assert.equal(audits.length, 1)
})

test('submitEvidence preserves offline flag, gallery source, and gps_unavailable_unverified without fabricating server timestamp', async () => {
  const { client, admin, audits } = makeFakeClients()
  const originalBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  const form = new FormData()
  form.append('lahan_id', LAHAN_ID)
  form.append('latitude', '-6.895')
  form.append('longitude', '107.605')
  form.append('idempotency_key', IDEMP_KEY_2)
  form.append('client_created_at', '2026-11-26T01:00:00.000Z')
  form.append('evidence_source', 'manual')
  form.append('manual_status', 'rusak_ringan')
  form.append('photos', new File([originalBytes], 'gallery.jpg', { type: 'image/jpeg' }))
  form.append('capture_metadata', JSON.stringify({
    version: PHOTO_EVIDENCE_VERSION,
    capture_source: 'gallery_upload',
    location_status: 'gps_unavailable_unverified',
    gps_snapshot: null,
    device_captured_at: '2026-11-26T01:00:00.000Z',
    submitted_offline: true,
    region_label: 'Lahan A',
    geometry_version_id: null,
    watermark_applied: false,
    watermark_lines: [],
  }))

  const res = await submitEvidence(form, {
    client,
    admin,
    analyze: async () => { throw new Error('unused') },
  })

  assert.equal(res.success, true)
  assert.equal(res.watermarked_photo_sha256, null)
  const ev = audits[0].meta.photo_evidence as ServerPhotoEvidence
  assert.equal(ev.capture_source, 'gallery_upload')
  assert.equal(ev.location_status, 'gps_unavailable_unverified')
  assert.equal(ev.gps_snapshot, null)
  assert.equal(ev.submitted_offline, true)
  assert.equal(ev.device_captured_at, '2026-11-26T01:00:00.000Z')
  assert.equal(ev.server_received_at, '2026-11-26T09:15:00.000Z')
})

test('PPL ReportVerification component renders inspection panel fields, original/watermarked toggle, and authenticity disclaimer', () => {
  const src = readFileSync(resolve(process.cwd(), 'components/features/ReportVerification.tsx'), 'utf8')
  assert.match(src, /Pemeriksaan Bukti Foto & Lokasi/)
  assert.match(src, /Salinan Watermark/)
  assert.match(src, /Foto Asli/)
  assert.match(src, /Akurasi GPS saat Capture/)
  assert.match(src, /Waktu Foto \(Perangkat\)/)
  assert.match(src, /Waktu Diterima Server/)
  assert.match(src, /SHA-256 Foto Asli/)
  assert.match(src, /SHA-256 Salinan Watermark/)
  assert.match(src, /PHOTO_EVIDENCE_DISCLAIMER/)
  assert.match(src, /GALLERY_LOCATION_WARNING/)
  assert.match(src, /Dikirim Offline/)
})

test('gallery_upload never claims GPS or watermark is proof of original photo location', () => {
  assert.equal(
    locationStatusLabel('gps_captured', 'gallery_upload'),
    'GPS perangkat saat pilih file (bukan bukti lokasi foto asli)'
  )
  assert.equal(locationStatusLabel('gps_captured', 'camera_capture'), 'Snapshot GPS saat capture')
  assert.match(GALLERY_LOCATION_WARNING, /bukan bukti lokasi atau waktu pengambilan foto asli/i)

  const lines = buildWatermarkLines({
    gpsSnapshot: {
      latitude: -6.3302,
      longitude: 107.3102,
      accuracy_m: 15,
      captured_at: '2026-11-26T02:05:09.000Z',
    },
    locationStatus: 'gps_captured',
    deviceCapturedAt: '2026-11-26T02:05:09.000Z',
    regionLabel: 'Lahan A',
    lahanId: LAHAN_ID,
    captureSource: 'gallery_upload',
  })
  assert.match(lines[2], /^GPS Unggah \(bukan lokasi asli\): -6\.330200, 107\.310200 \(±15 m\)$/)
})
