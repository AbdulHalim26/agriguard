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

// ===== Presentasi warna banner/badge status (terpusat) =====
// Catatan: ini HANYA token presentasi. Logika ambang tetap di calculateFloodStatus.
export interface FloodStatusStyle {
  gradient: string
  bannerClass: string
  iconBg: string
  chipBg: string
  chipText: string
  dot: string
}

export const STATUS_CONFIG: Record<FloodStatus, FloodStatusStyle> = {
  aman: {
    gradient: 'from-[#2E7D32] to-[#43A047]',
    bannerClass: 'banner-aman',
    iconBg: 'bg-white/20',
    chipBg: 'bg-green-100',
    chipText: 'text-green-700',
    dot: 'bg-[#2E7D32]',
  },
  waspada: {
    gradient: 'from-[#ED6C02] to-[#F59E0B]',
    bannerClass: 'banner-waspada',
    iconBg: 'bg-white/20',
    chipBg: 'bg-amber-100',
    chipText: 'text-[#ED6C02]',
    dot: 'bg-[#ED6C02]',
  },
  bahaya: {
    gradient: 'from-[#D32F2F] to-[#E53935]',
    bannerClass: 'banner-bahaya',
    iconBg: 'bg-white/20',
    chipBg: 'bg-red-100',
    chipText: 'text-[#D32F2F]',
    dot: 'bg-[#D32F2F]',
  },
}

export const STATUS_STYLE_FALLBACK: FloodStatusStyle = {
  gradient: 'from-gray-500 to-gray-600',
  bannerClass: 'bg-gradient-to-br from-gray-500 to-gray-600',
  iconBg: 'bg-white/20',
  chipBg: 'bg-gray-100',
  chipText: 'text-gray-600',
  dot: 'bg-gray-400',
}

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
        'Siapkan perlengkapan darurat sebagaimana',
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