import { AlertCircle } from 'lucide-react'
import { AI_STATUS_INFO, formatConfidence } from '@/lib/recommendations'
import { INSURANCE_NOTICE, UNKNOWN_AFFECTED_AREA_LABEL, type advisoryAssessment } from '@/lib/reports/advisory'

export default function AdvisoryAssessment({ assessment, compact = false, technical = false }: {
  assessment: ReturnType<typeof advisoryAssessment>; compact?: boolean; technical?: boolean
}) {
  const status = assessment.predicted_visual_status
  const badge = status ? AI_STATUS_INFO[status].badgeClass : 'bg-gray-100 text-gray-700'
  return <div className={compact ? 'space-y-1 text-xs' : 'space-y-3 rounded-xl border border-slate-200 p-4 bg-slate-50 text-sm'}
    data-review-status={assessment.review_status} data-calibration-status={assessment.calibration_status}>
    <p className="font-semibold text-slate-800">{assessment.title}</p>
    <p><span className={`inline-flex px-2 py-1 rounded-lg font-medium ${badge}`}>{assessment.visual_label}</span></p>
    <p className="text-slate-600">{assessment.source_label}</p>
    {assessment.confidence !== null && <p className="text-slate-700">{assessment.confidence_label}: {formatConfidence(assessment.confidence)}</p>}
    <p className="font-semibold text-amber-800 flex items-start gap-1"><AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      Perlu Verifikasi · REVIEW_REQUIRED {compact ? '(penilaian)' : '(interpretasi penilaian awal)'}
    </p>
    {!compact && <>
      <p className="text-slate-700">{assessment.notice}</p>
      <p className="text-xs text-slate-600">Label indikasi adalah pemetaan status API, bukan diagnosis penyakit. Kelas asli dan versi model belum terikat pada receipt ini.</p>
      <p className="text-slate-700">{UNKNOWN_AFFECTED_AREA_LABEL}.</p>
      {assessment.calibration_status !== 'NOT_APPLICABLE' && <p className="text-xs text-slate-600">Kalibrasi kerusakan: belum terkalibrasi · {assessment.calibration_status}.</p>}
      {assessment.legacy_damage_status !== 'NOT_AVAILABLE' && <p className="text-xs text-slate-600">
        damage_pct: {assessment.legacy_damage_status}. Angka asli disimpan untuk audit, bukan persentase kerusakan lahan terukur.
      </p>}
      <p className="text-xs text-slate-600">Status verifikasi laporan terpisah dari hasil AI. {INSURANCE_NOTICE}</p>
    </>}
    {technical && <details className="text-xs text-slate-600">
      <summary className="cursor-pointer py-2">Output asli untuk audit — belum terkalibrasi</summary>
      <pre className="whitespace-pre-wrap break-all p-2 border rounded bg-white">{JSON.stringify(assessment.raw,
        (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value, 2)}</pre>
      <p>Label kelas model/versi tidak tersedia dalam receipt ini; label tampilan adalah pemetaan status kompatibilitas.</p>
    </details>}
  </div>
}
