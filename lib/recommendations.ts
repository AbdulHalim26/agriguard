export type AiStatus = 'aman' | 'rusak_ringan' | 'rusak_berat'

export interface AiStatusInfo {
  label: string
  badgeClass: string
  dotClass: string
  recommendation: string
}

export const AI_STATUS_INFO: Record<AiStatus, AiStatusInfo> = {
  aman: {
    label: 'Tidak Tampak Kerusakan (Foto)',
    badgeClass: 'bg-sky-100 text-sky-800',
    dotClass: 'bg-sky-500',
    recommendation:
      'Hasil awal pada foto bukan jaminan tanaman sehat atau bebas banjir. Tetap dokumentasikan kondisi dan minta peninjauan PPL/Dinas.',
  },
  rusak_ringan: {
    label: 'Indikasi Kerusakan Ringan',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    dotClass: 'bg-yellow-500',
    recommendation:
      'Dokumentasikan indikasi pada tanaman dan konteks kejadian. Minta peninjauan PPL/Dinas sebelum menyimpulkan penyebab atau tindakan penanganan.',
  },
  rusak_berat: {
    label: 'Indikasi Kerusakan Berat',
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    recommendation:
      'Kirim bukti untuk ditinjau PPL/Dinas. Indikasi visual ini belum menentukan luas kerusakan, penyebab banjir, atau kelayakan klaim AUTP.',
  },
}

export const AI_STATUS_LIST: AiStatus[] = ['aman', 'rusak_ringan', 'rusak_berat']

export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return '—'
  return `${Math.round(confidence * 100)}%`
}
