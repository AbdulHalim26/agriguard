import { AI_STATUS_INFO, AI_STATUS_LIST, type AiStatus } from '@/lib/recommendations'
import { evidenceLabel } from './evidence'

export const AI_ADVISORY_NOTICE = 'Analisis foto bersifat awal dan belum menentukan luas kerusakan lahan, penyebab banjir, kehilangan hasil, atau kelayakan klaim AUTP.'
export const UNKNOWN_AFFECTED_AREA_LABEL = 'Luas terdampak belum terverifikasi'
export const INSURANCE_NOTICE = 'Verifikasi laporan bukan persetujuan klaim. Keputusan klaim tetap pada penanggung asuransi yang berwenang.'

export interface AdvisoryInput {
  status?: unknown
  confidence?: unknown
  damage_pct?: unknown
  evidence_source?: unknown
  analysis_id?: unknown
  report_id?: unknown
}

export function isAiStatus(value: unknown): value is AiStatus {
  return typeof value === 'string' && AI_STATUS_LIST.includes(value as AiStatus)
}

// Derived interpretation only. No update to receipts, queued fields or DB values.
// The API returns a mapped status, not the original disease/model class/version.
export function advisoryAssessment(input: AdvisoryInput, historical = false) {
  const source = typeof input.evidence_source === 'string' ? input.evidence_source : 'legacy_unverified'
  const manual = source === 'manual'
  const pending = source === 'pending'
  const status = !pending && isAiStatus(input.status) ? input.status : null
  const trustedAi = source === 'server_ai' && status !== null
  const confidence = !manual && !pending && typeof input.confidence === 'number' &&
    Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1 ? input.confidence : null
  const hasLegacyNumber = input.damage_pct !== null && input.damage_pct !== undefined
  const calibration = manual || pending || !status ? 'NOT_APPLICABLE'
    : historical ? 'LEGACY_UNCALIBRATED' : 'UNCALIBRATED'
  return {
    contract_version: 'advisory-v1' as const,
    origin: manual ? 'USER_REPORTED' as const : pending ? 'PENDING' as const
      : trustedAi ? 'SERVER_AI' as const : 'LEGACY_UNVERIFIED' as const,
    title: manual ? 'Penilaian Pelapor' : pending ? 'Analisis Belum Tersedia'
      : trustedAi ? 'Hasil Analisis AI' : 'Penilaian Tercatat',
    source_label: evidenceLabel(source),
    predicted_visual_status: status,
    visual_label: status ? AI_STATUS_INFO[status].label : pending ? 'Menunggu analisis server' : 'Belum ada penilaian yang dapat ditafsirkan',
    model_class: null, // never manufacture a disease class from a legacy status
    model_version: null, // existing receipts do not bind a model version/hash
    label_basis: 'COMPATIBILITY_STATUS_MAPPING' as const,
    confidence,
    confidence_label: trustedAi ? 'Keyakinan model (klasifikasi foto)' : 'Skor tercatat (asal belum terverifikasi)',
    calibration_status: calibration,
    review_status: 'REVIEW_REQUIRED' as const,
    severity_assessment_status: manual ? 'USER_REPORTED_UNVERIFIED' as const
      : pending || !status ? 'NO_AI_ASSESSMENT' as const : 'UNCALIBRATED_VISUAL_INDICATION' as const,
    legacy_damage_status: hasLegacyNumber ? historical ? 'LEGACY_UNCALIBRATED' as const : 'UNCALIBRATED' as const : 'NOT_AVAILABLE' as const,
    measured_affected_area: { status: 'UNKNOWN_AFFECTED_AREA' as const, hectares: null },
    measured_field_damage_pct: null,
    insurer_decision: 'NOT_DETERMINED' as const,
    notice: AI_ADVISORY_NOTICE,
    // Whitelist original fields, without coercion, zeroing, relabeling or mutation.
    raw: { status: input.status, confidence: input.confidence, damage_pct: input.damage_pct,
      evidence_source: input.evidence_source, analysis_id: input.analysis_id, report_id: input.report_id },
  }
}

export function reportAdvisory(report: {
  id?: unknown; ai_status?: unknown; ai_confidence?: unknown; ai_damage_pct?: unknown
  evidence_source?: unknown; ai_analysis_id?: unknown
}) {
  return advisoryAssessment({ status: report.ai_status, confidence: report.ai_confidence,
    damage_pct: report.ai_damage_pct, evidence_source: report.evidence_source,
    analysis_id: report.ai_analysis_id, report_id: report.id }, true)
}

export function reportVerification(input: { is_verified?: unknown; verified_at?: unknown }) {
  if (input.is_verified === true) return { status: 'VERIFIED_REPORT' as const, label: 'Laporan Terverifikasi PPL/Dinas' }
  if (typeof input.verified_at === 'string' && input.verified_at) return { status: 'REJECTED_REPORT' as const, label: 'Laporan Ditolak PPL/Dinas' }
  return { status: 'PENDING_REPORT_REVIEW' as const, label: 'Menunggu Verifikasi PPL/Dinas' }
}

// Used by both online form and the existing IndexedDB queue; manual evidence
// does not need AI, and original prediction/receipt values stay intact otherwise.
export function submissionEvidence(input: {
  manualMode: boolean; manualStatus: AiStatus
  prediction: { status: AiStatus; confidence: number; damage_pct: number; analysis_id: string } | null
}) {
  if (input.manualMode) return { source: 'manual' as const, status: input.manualStatus, confidence: null, damage_pct: null, analysis_id: undefined }
  if (input.prediction) return { source: 'ai' as const, ...input.prediction }
  return { source: 'pending' as const, status: null, confidence: null, damage_pct: null, analysis_id: undefined }
}
