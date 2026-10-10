export type FloodStatus = 'aman' | 'waspada' | 'bahaya'

export interface FloodStatusResult {
  status: FloodStatus
  label: string
  description: string
  color: 'green' | 'yellow' | 'red'
  icon: 'check-circle' | 'alert-triangle' | 'alert-circle'
}

export const RAIN_THRESHOLD_WASPADA_MM = 20
export const RAIN_THRESHOLD_BAHAYA_MM = 50
export const WATER_LEVEL_THRESHOLD_BAHAYA_M = 1.2

export function calculateFloodStatus(
  rain3hMm: number | null,
  waterLevelM: number | null
): FloodStatusResult {
  const hasRainData = rain3hMm !== null && rain3hMm !== undefined
  const hasWaterData = waterLevelM !== null && waterLevelM !== undefined

  if (!hasRainData && !hasWaterData) {
    return {
      status: 'aman',
      label: 'Data Tidak Tersedia',
      description: 'Data cuaca dan tinggi air belum tersedia',
      color: 'green',
      icon: 'check-circle',
    }
  }

  let status: FloodStatus = 'aman'

  if (hasRainData && rain3hMm! >= RAIN_THRESHOLD_BAHAYA_MM) {
    status = 'bahaya'
  } else if (hasWaterData && waterLevelM! >= WATER_LEVEL_THRESHOLD_BAHAYA_M) {
    status = 'bahaya'
  } else if (hasRainData && rain3hMm! >= RAIN_THRESHOLD_WASPADA_MM) {
    status = 'waspada'
  }

  switch (status) {
    case 'bahaya':
      return {
        status: 'bahaya',
        label: 'BAHAYA',
        description: 'Curah hujan tinggi atau tinggi air melebihi batas aman. Segera siapkan evakuasi.',
        color: 'red',
        icon: 'alert-circle',
      }
    case 'waspada':
      return {
        status: 'waspada',
        label: 'WASPADA',
        description: 'Curah hujan signifikan. Perhatikan perkembangan cuaca dan ketinggian air.',
        color: 'yellow',
        icon: 'alert-triangle',
      }
    case 'aman':
    default:
      return {
        status: 'aman',
        label: 'AMAN',
        description: 'Kondisi normal. Tidak ada indikasi banjir.',
        color: 'green',
        icon: 'check-circle',
      }
  }
}

export function getStaticRecommendation(status: FloodStatus): string[] {
  switch (status) {
    case 'bahaya':
      return [
        'Segera pindahkan barang berharga ke tempat tinggi',
        'Siapkan tas darurat (dokumen, obat, pakaian, makanan)',
        'Ikuti arahan petugas/BPBD untuk evakuasi',
        'Jangan mencoba menyeberangi aliran air',
      ]
    case 'waspada':
      return [
        'Pantau perkembangan cuaca melalui aplikasi BMKG',
        'Periksa kondisi bendungan/pintu air terdekat',
        'Siapkan perlengkapan darurat sebagaikeman',
        'Koordinasi dengan ketua Poktan/RT/RW setempat',
      ]
    case 'aman':
    default:
      return [
        'Kondisi aman, lanjutkan aktivitas pertanian seperti biasa',
        'Periksa saluran drainase secara berkala',
        'Jaga komunikasi dengan anggota Poktan',
      ]
  }
}