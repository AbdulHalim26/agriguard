export type OtpProvider = 'mock' | 'wa'

export interface OtpService {
  requestOtp(phone: string): Promise<{ success: boolean; code?: string; error?: string }>
  verifyOtp(phone: string, code: string): Promise<{ success: boolean; error?: string }>
}

const MOCK_CODE = '123456'
const OTP_EXPIRY_MS = 5 * 60 * 1000
const STORAGE_KEY = 'agriguard-otp-store'

function loadOtpStore(): Map<string, { code: string; expiresAt: number }> {
  if (typeof window === 'undefined') return new Map()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const map = new Map<string, { code: string; expiresAt: number }>()
      for (const [key, value] of Object.entries(parsed)) {
        map.set(key, value as { code: string; expiresAt: number })
      }
      return map
    }
  } catch {
    // ignore parse errors
  }
  return new Map()
}

function saveOtpStore(store: Map<string, { code: string; expiresAt: number }>) {
  if (typeof window === 'undefined') return
  try {
    const obj = Object.fromEntries(store)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // ignore
  }
}

const otpStore = loadOtpStore()

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('08')) {
    return '62' + cleaned.slice(1)
  }
  if (cleaned.startsWith('628')) {
    return cleaned
  }
  return cleaned
}

class MockOtpService implements OtpService {
  async requestOtp(phone: string) {
    const normalized = normalizePhone(phone)
    const expiresAt = Date.now() + OTP_EXPIRY_MS
    otpStore.set(normalized, { code: MOCK_CODE, expiresAt })
    saveOtpStore(otpStore)
    return { success: true, code: MOCK_CODE }
  }

  async verifyOtp(phone: string, code: string) {
    const normalized = normalizePhone(phone)
    const stored = otpStore.get(normalized)

    if (!stored) {
      return { success: false, error: 'Kode OTP tidak ditemukan atau sudah kadaluarsa' }
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalized)
      saveOtpStore(otpStore)
      return { success: false, error: 'Kode OTP sudah kadaluarsa' }
    }

    if (stored.code !== code) {
      return { success: false, error: 'Kode OTP salah' }
    }

    otpStore.delete(normalized)
    saveOtpStore(otpStore)
    return { success: true }
  }
}

class WaOtpService implements OtpService {
  async requestOtp(phone: string) {
    const gatewayUrl = process.env.WA_GATEWAY_URL
    const gatewayToken = process.env.WA_GATEWAY_TOKEN

    if (!gatewayUrl || !gatewayToken) {
      return { success: false, error: 'WA Gateway tidak dikonfigurasi' }
    }

    const normalized = normalizePhone(phone)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + OTP_EXPIRY_MS
    otpStore.set(normalized, { code, expiresAt })
    saveOtpStore(otpStore)

    try {
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({
          target: normalized.replace('62', '0'),
          message: `Kode OTP AgriGuard Anda: ${code}. Berlaku 5 menit. Jangan bagikan ke siapapun.`,
        }),
      })

      if (!response.ok) {
        throw new Error('Gagal mengirim OTP via WA')
      }

      return { success: true }
    } catch (error) {
      otpStore.delete(normalized)
      saveOtpStore(otpStore)
      return { success: false, error: 'Gagal mengirim OTP' }
    }
  }

  async verifyOtp(phone: string, code: string) {
    const normalized = normalizePhone(phone)
    const stored = otpStore.get(normalized)

    if (!stored) {
      return { success: false, error: 'Kode OTP tidak ditemukan atau sudah kadaluarsa' }
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalized)
      saveOtpStore(otpStore)
      return { success: false, error: 'Kode OTP sudah kadaluarsa' }
    }

    if (stored.code !== code) {
      return { success: false, error: 'Kode OTP salah' }
    }

    otpStore.delete(normalized)
    saveOtpStore(otpStore)
    return { success: true }
  }
}

export function getOtpService(): OtpService {
  const mode = (process.env.OTP_MODE as OtpProvider) || 'mock'
  switch (mode) {
    case 'wa':
      return new WaOtpService()
    case 'mock':
    default:
      return new MockOtpService()
  }
}

export function getMockCode(): string {
  return MOCK_CODE
}

export function isMockMode(): boolean {
  return (process.env.OTP_MODE || 'mock') === 'mock'
}