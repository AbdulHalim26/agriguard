import { z } from 'zod'
import { assertStagingRef, STAGING_ACTORS } from './preflight'

export const STAGING_SEND_SMS_HOOK_URI = 'pg-functions://postgres/public/staging_send_sms_hook'
// Hard ceiling immediately after the 30 November 2026 competition deadline
// (2026-12-01 23:59:59 WIB = 2026-12-01T16:59:59Z).
export const STAGING_TEST_OTP_MAX_VALID_UNTIL = '2026-12-01T16:59:59Z'

const ALLOWED_PHONES = new Set<string>(STAGING_ACTORS.map((actor) => actor.phone))

const otpMapSchema = z.record(
  z.string().regex(/^628000000010[1-4]$/, 'ONLY_FOUR_SYNTHETIC_STAGING_PHONES_ALLOWED'),
  z.string().regex(/^\d{6}$/, 'SIX_DIGIT_NUMERIC_OTP_REQUIRED'),
)

export interface StagingPhoneAuthPatch {
  external_phone_enabled: true
  disable_signup: true
  sms_autoconfirm: false
  sms_test_otp: string
  sms_test_otp_valid_until: string
  hook_send_sms_enabled: true
  hook_send_sms_uri: string
}

export interface StagingPhoneAuthRollback {
  external_phone_enabled: false
  disable_signup: boolean
  sms_autoconfirm: false
  sms_test_otp: ''
  sms_test_otp_valid_until: null
  hook_send_sms_enabled: false
  hook_send_sms_uri: null
}

// OFFLINE PAYLOAD BUILDER ONLY: never calls Management API or prints OTP values.
export function buildStagingPhoneAuthPatch(input: {
  projectRef: string
  otps: Record<string, string>
  validUntilIso: string
  now?: Date
}): StagingPhoneAuthPatch {
  assertStagingRef(input.projectRef)
  const parsedOtps = otpMapSchema.safeParse(input.otps)
  if (!parsedOtps.success) throw new Error('INVALID_STAGING_TEST_OTP_MAP')

  const entries = Object.entries(parsedOtps.data)
  if (entries.length !== ALLOWED_PHONES.size || entries.some(([phone]) => !ALLOWED_PHONES.has(phone))) {
    throw new Error('EXACT_FOUR_SYNTHETIC_STAGING_PHONES_REQUIRED')
  }

  const nowMs = (input.now ?? new Date()).getTime()
  const validUntilMs = Date.parse(input.validUntilIso)
  const maxMs = Date.parse(STAGING_TEST_OTP_MAX_VALID_UNTIL)
  if (!Number.isFinite(validUntilMs) || validUntilMs <= nowMs || validUntilMs > maxMs) {
    throw new Error('INVALID_OR_EXCESSIVE_TEST_OTP_EXPIRY')
  }

  // Supabase sms_test_otp format: comma-separated "<E164_without_plus>=<otp>".
  const ordered = STAGING_ACTORS.map((actor) => `${actor.phone}=${parsedOtps.data[actor.phone]}`).join(',')
  return {
    external_phone_enabled: true,
    disable_signup: true,
    sms_autoconfirm: false,
    sms_test_otp: ordered,
    sms_test_otp_valid_until: new Date(validUntilMs).toISOString(),
    hook_send_sms_enabled: true,
    hook_send_sms_uri: STAGING_SEND_SMS_HOOK_URI,
  }
}

export function buildStagingPhoneAuthRollback(projectRef: string, restoreDisableSignup = false): StagingPhoneAuthRollback {
  assertStagingRef(projectRef)
  return {
    external_phone_enabled: false,
    disable_signup: restoreDisableSignup,
    sms_autoconfirm: false,
    sms_test_otp: '',
    sms_test_otp_valid_until: null,
    hook_send_sms_enabled: false,
    hook_send_sms_uri: null,
  }
}

const SECRET_KEY_PATTERN = /(secret|token|password|key|sms_test_otp$|twilio|vonage|messagebird|textlocal)/i

export function redactAuthConfigSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      safe[key] = value ? '[REDACTED]' : null
    } else {
      safe[key] = value
    }
  }
  return safe
}
