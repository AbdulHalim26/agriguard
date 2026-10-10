export type AiStatus = 'aman' | 'rusak_ringan' | 'rusak_berat'

export interface AiStatusInfo {
  label: string
  badgeClass: string
  dotClass: string
  recommendation: string
}

export const AI_STATUS_INFO: Record<AiStatus, AiStatusInfo> = {
  aman: {
    label: 'Aman',
    badgeClass: 'bg-green-100 text-green-700',
    dotClass: 'bg-green-500',
    recommendation:
      'Tanaman tampak sehat. Teruskan pemantauan rutin dan pastikan drainase lahan lancar.',
  },
  rusak_ringan: {
    label: 'Rusak Ringan',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    dotClass: 'bg-yellow-500',
    recommendation:
      'Kerusakan ringan terdeteksi. Bersihkan lumpur/genangan, perbaiki drainase, dan beri pemupukan pemulihan. Laporkan agar dipantau PPL.',
  },
  rusak_berat: {
    label: 'Rusak Berat',
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    recommendation:
      'Kerusakan parah terdeteksi. Segera laporkan untuk verifikasi PPL dan pengajuan klaim AUTP. Jangan panen dini sebelum diverifikasi.',
  },
}

export const AI_STATUS_LIST: AiStatus[] = ['aman', 'rusak_ringan', 'rusak_berat']

export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null) return '—'
  return `${Math.round(confidence * 100)}%`
}