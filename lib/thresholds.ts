import type { EwsSource } from '@/lib/ews/data'

export type FloodStatus = 'aman' | 'waspada' | 'bahaya' | 'unknown' | 'stale'

export interface FloodStatusResult {
  status: FloodStatus
  label: string
  description: string
  color: 'green' | 'yellow' | 'red' | 'gray'
  icon: 'check-circle' | 'alert-triangle' | 'alert-circle' | 'help-circle' | 'clock'
  complete: boolean
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
  unknown: {
    gradient: 'from-slate-600 to-slate-700', bannerClass: 'bg-slate-700',
    iconBg: 'bg-white/20', chipBg: 'bg-slate-100', chipText: 'text-slate-700', dot: 'bg-slate-400',
  },
  stale: {
    gradient: 'from-gray-600 to-gray-700', bannerClass: 'bg-gray-700',
    iconBg: 'bg-white/20', chipBg: 'bg-gray-100', chipText: 'text-gray-700', dot: 'bg-gray-400',
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
  weather: Pick<EwsSource, 'quality' | 'value'>,
  water: Pick<EwsSource, 'quality' | 'value'>
): FloodStatusResult {
  const hasRainData = weather.quality === 'VALID' && typeof weather.value === 'number' &&
    Number.isFinite(weather.value) && weather.value >= 0 && weather.value <= 1000
  const hasWaterData = water.quality === 'VALID' && typeof water.value === 'number' &&
    Number.isFinite(water.value) && water.value >= 0 && water.value <= 10
  const complete = hasRainData && hasWaterData
  let status: FloodStatus
  if (hasRainData && weather.value! >= RAIN_THRESHOLD_BAHAYA_MM) {
    status = 'bahaya'
  } else if (hasWaterData && water.value! >= WATER_LEVEL_THRESHOLD_BAHAYA_M) {
    status = 'bahaya'
  } else if (hasRainData && weather.value! >= RAIN_THRESHOLD_WASPADA_MM) {
    status = 'waspada'
  } else if (complete) {
    status = 'aman'
  } else if ([weather, water].some((s) => s.quality === 'MISSING' || s.quality === 'INVALID' || s.quality === 'MOCK') ||
      (weather.quality === 'VALID' && !hasRainData) || (water.quality === 'VALID' && !hasWaterData)) {
    status = 'unknown'
  } else {
    // A stale required source with no higher-priority missing/invalid/mock input.
    status = 'stale'
  }

  switch (status) {
    case 'bahaya':
      return {
        status: 'bahaya',
        label: 'BAHAYA',
        description: 'Indikator hujan atau tinggi air melewati ambang bahaya. Ikuti arahan petugas; ini bukan konfirmasi banjir di lahan.' +
          (complete ? '' : ' Data lain belum layak digunakan; sinyal bahaya tetap ditampilkan.'),
        color: 'red',
        icon: 'alert-circle',
        complete,
      }
    case 'waspada':
      return {
        status: 'waspada',
        label: 'WASPADA',
        description: 'Prakiraan hujan melewati ambang waspada. Pantau cuaca dan arahan petugas.' +
          (complete ? '' : ' Data lain belum layak digunakan; penilaian masih terbatas.'),
        color: 'yellow',
        icon: 'alert-triangle',
        complete,
      }
    case 'unknown':
      return { status, label: 'BELUM DIKETAHUI', color: 'gray', icon: 'help-circle', complete,
        description: 'Data yang diperlukan belum tersedia atau belum dapat dipercaya. Kondisi aman belum dapat disimpulkan.' }
    case 'stale':
      return { status, label: 'DATA KEDALUWARSA', color: 'gray', icon: 'clock', complete,
        description: 'Data melewati batas umur atau masa berlaku. Perbarui data sebelum menyimpulkan kondisi saat ini.' }
    case 'aman':
    default:
      return {
        status: 'aman',
        label: 'AMAN',
        description: 'Kedua sumber layak digunakan dan belum melewati ambang. Ini bukan jaminan lahan bebas banjir.',
        color: 'green',
        icon: 'check-circle',
        complete,
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
        'Siapkan perlengkapan darurat sesuai arahan petugas',
        'Koordinasi dengan ketua Poktan/RT/RW setempat',
      ]
    case 'unknown':
    case 'stale':
      return ['Perbarui informasi cuaca dan minta laporan tinggi air terkini',
        'Jangan menganggap data tidak tersedia sebagai kondisi aman', 'Ikuti informasi petugas/BPBD setempat']
    case 'aman':
    default:
      return [
        'Tetap pantau cuaca; indikator saat ini bukan jaminan bebas banjir',
        'Periksa saluran drainase secara berkala',
        'Jaga komunikasi dengan anggota Poktan',
      ]
  }
}
