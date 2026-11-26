import { z } from 'zod'
import { clientCaptureMetadataSchema, type ClientCaptureMetadata } from './photo-evidence'

export const aiResultSchema = z.object({
  status: z.enum(['aman', 'rusak_ringan', 'rusak_berat']),
  confidence: z.number().finite().min(0).max(1),
  damage_pct: z.number().finite().min(0).max(100),
})

export type EvidenceSource = 'legacy_unverified' | 'pending' | 'manual' | 'server_ai'
export const EVIDENCE_LABELS: Record<EvidenceSource, string> = {
  legacy_unverified: 'Data lama — asal analisis belum terverifikasi',
  pending: 'Menunggu analisis server',
  manual: 'Penilaian manual pengguna',
  server_ai: 'Hasil AI server — terikat foto',
}

export function evidenceLabel(source?: string | null) {
  return EVIDENCE_LABELS[source as EvidenceSource] || EVIDENCE_LABELS.legacy_unverified
}

const optionalText = z.preprocess((value) => value === null || value === '' ? undefined : value, z.string().optional())
export const reportInputSchema = z.object({
  lahan_id: z.string().uuid('ID lahan tidak valid'),
  latitude: z.preprocess((v) => v === null || v === '' ? undefined : v, z.coerce.number().finite().min(-90).max(90)),
  longitude: z.preprocess((v) => v === null || v === '' ? undefined : v, z.coerce.number().finite().min(-180).max(180)),
  idempotency_key: z.string().uuid('ID laporan tidak valid'),
  client_created_at: z.string().datetime({ offset: true }),
  analysis_id: optionalText.pipe(z.string().uuid().optional()),
  evidence_source: optionalText.pipe(z.enum(['ai', 'manual', 'pending']).optional()),
  manual_status: optionalText.pipe(z.enum(['aman', 'rusak_ringan', 'rusak_berat']).optional()),
})

export class ReportError extends Error {
  constructor(message: string, public status = 400, public code = 'REPORT_INVALID') { super(message) }
}

export function parseReportInput(form: FormData) {
  const parsed = reportInputSchema.safeParse(Object.fromEntries([
    'lahan_id', 'latitude', 'longitude', 'idempotency_key', 'client_created_at',
    'analysis_id', 'evidence_source', 'manual_status',
  ].map((key) => [key, form.get(key)])))
  if (!parsed.success) throw new ReportError(parsed.error.errors[0].message)
  const input = parsed.data
  // Legacy queued AI values are NEVER promoted to trusted AI. A legacy manual
  // status can be preserved only as explicitly untrusted manual input.
  if (!input.evidence_source && form.get('ai_status') && !form.get('ai_confidence') && !form.get('ai_damage_pct')) {
    const manual = aiResultSchema.shape.status.safeParse(form.get('ai_status'))
    if (manual.success) { input.evidence_source = 'manual'; input.manual_status = manual.data }
  }
  if (input.evidence_source === 'manual' && !input.manual_status) throw new ReportError('Status manual diperlukan.')
  if (input.evidence_source !== 'manual' && input.manual_status) throw new ReportError('Sumber penilaian tidak sesuai.')

  let capture_metadata: ClientCaptureMetadata | null = null
  const rawMeta = form.get('capture_metadata')
  if (typeof rawMeta === 'string' && rawMeta.trim().length > 0) {
    let decoded: unknown
    try {
      decoded = JSON.parse(rawMeta)
    } catch {
      throw new ReportError('Format metadata bukti foto tidak valid.')
    }
    const parsedMeta = clientCaptureMetadataSchema.safeParse(decoded)
    if (!parsedMeta.success) {
      throw new ReportError('Metadata bukti foto tidak sesuai kontrak.')
    }
    capture_metadata = parsedMeta.data
  }
  return { ...input, capture_metadata }
}
