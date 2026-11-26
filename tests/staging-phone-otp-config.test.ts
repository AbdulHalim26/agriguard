import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import {
  buildStagingPhoneAuthPatch,
  buildStagingPhoneAuthRollback,
  redactAuthConfigSnapshot,
  STAGING_SEND_SMS_HOOK_URI,
  STAGING_TEST_OTP_MAX_VALID_UNTIL,
} from '../lib/staging/auth-test-config'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../lib/staging/preflight'
import { hasPhoneOtpClaims, getPhoneOtpUser } from '../lib/auth/session'

// LOCAL CONTRACT PROOF ONLY: validates staging Auth patch builder, fail-closed
// SQL hook contract, redaction, and session/JWT claim requirements. Does NOT
// contact hosted Supabase GoTrue or prove live Management API execution.

const VALID_OTPS = {
  '6280000000101': '111111',
  '6280000000102': '222222',
  '6280000000103': '333333',
  '6280000000104': '444444',
}
const NOW = new Date('2026-11-25T05:00:00Z')

function fakeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.local-contract-signature-fixture`
}

test('J1 staging Auth patch: pins staging ref, exact 4 synthetic phones, post-competition expiry, and zero Twilio fields', () => {
  const patch = buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF,
    otps: VALID_OTPS,
    validUntilIso: STAGING_TEST_OTP_MAX_VALID_UNTIL,
    now: NOW,
  })
  assert.equal(patch.external_phone_enabled, true)
  assert.equal(patch.disable_signup, true)
  assert.equal(patch.sms_autoconfirm, false)
  assert.equal(patch.hook_send_sms_enabled, true)
  assert.equal(patch.hook_send_sms_uri, STAGING_SEND_SMS_HOOK_URI)
  assert.equal(patch.sms_test_otp, '6280000000101=111111,6280000000102=222222,6280000000103=333333,6280000000104=444444')
  assert.ok(!Object.keys(patch).some((k) => /twilio|vonage|messagebird/i.test(k)))
})

test('J1 staging Auth patch: rejects production ref, unknown phones, missing phones, non-6-digit OTPs, and excessive expiry', () => {
  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: PRODUCTION_PROJECT_REF, otps: VALID_OTPS, validUntilIso: STAGING_TEST_OTP_MAX_VALID_UNTIL, now: NOW,
  }), /PRODUCTION_PROJECT_FORBIDDEN/)

  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF,
    otps: { ...VALID_OTPS, '6281234567890': '999999' },
    validUntilIso: STAGING_TEST_OTP_MAX_VALID_UNTIL,
    now: NOW,
  }), /INVALID_STAGING_TEST_OTP_MAP/)

  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF,
    otps: { '6280000000101': '111111' },
    validUntilIso: STAGING_TEST_OTP_MAX_VALID_UNTIL,
    now: NOW,
  }), /EXACT_FOUR_SYNTHETIC_STAGING_PHONES_REQUIRED/)

  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF,
    otps: { ...VALID_OTPS, '6280000000101': '1234' },
    validUntilIso: STAGING_TEST_OTP_MAX_VALID_UNTIL,
    now: NOW,
  }), /INVALID_STAGING_TEST_OTP_MAP/)

  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF, otps: VALID_OTPS, validUntilIso: '2026-11-24T00:00:00Z', now: NOW,
  }), /INVALID_OR_EXCESSIVE_TEST_OTP_EXPIRY/)

  assert.throws(() => buildStagingPhoneAuthPatch({
    projectRef: STAGING_PROJECT_REF, otps: VALID_OTPS, validUntilIso: '2026-12-15T00:00:00Z', now: NOW,
  }), /INVALID_OR_EXCESSIVE_TEST_OTP_EXPIRY/)
})

test('J1 rollback & redaction: disables phone/hook/test OTPs and strips all secrets from backup snapshots', () => {
  assert.throws(() => buildStagingPhoneAuthRollback(PRODUCTION_PROJECT_REF), /PRODUCTION_PROJECT_FORBIDDEN/)
  const rollback = buildStagingPhoneAuthRollback(STAGING_PROJECT_REF)
  assert.deepEqual(rollback, {
    external_phone_enabled: false,
    disable_signup: false,
    sms_autoconfirm: false,
    sms_test_otp: '',
    sms_test_otp_valid_until: null,
    hook_send_sms_enabled: false,
    hook_send_sms_uri: null,
  })
  const redacted = redactAuthConfigSnapshot({
    external_phone_enabled: false,
    sms_test_otp: '6280000000101=111111',
    sms_twilio_auth_token: 'secret-value',
    hook_send_sms_secrets: 'v1,whsec_secret',
    site_url: 'http://localhost:3201',
  })
  assert.equal(redacted.external_phone_enabled, false)
  assert.equal(redacted.site_url, 'http://localhost:3201')
  assert.equal(redacted.sms_test_otp, '[REDACTED]')
  assert.equal(redacted.sms_twilio_auth_token, '[REDACTED]')
  assert.equal(redacted.hook_send_sms_secrets, '[REDACTED]')
  assert.ok(!JSON.stringify(redacted).includes('111111'))
  assert.ok(!JSON.stringify(redacted).includes('secret-value'))
})

test('J1 SQL hook contract: fail-closed 403, zero OTP logging, restricted to supabase_auth_admin only', async () => {
  const sql = (await readFile(path.resolve('supabase/staging/staging-send-sms-hook.sql'), 'utf8')).toLowerCase()
  const codeOnly = sql.replace(/--[^\n]*/g, '')
  assert.match(codeOnly, /create or replace function public\.staging_send_sms_hook\(event jsonb\)/)
  assert.match(codeOnly, /returns jsonb/)
  assert.match(codeOnly, /security invoker/)
  assert.match(codeOnly, /set search_path = ''/)
  assert.match(codeOnly, /'http_code',\s*403/)
  assert.match(codeOnly, /revoke all on function public\.staging_send_sms_hook\(jsonb\)\s+from public, anon, authenticated, service_role/)
  assert.match(codeOnly, /grant execute on function public\.staging_send_sms_hook\(jsonb\)\s+to supabase_auth_admin/)
  // Never logs OTPs, never performs HTTP calls, never touches managed schemas or RLS.
  assert.doesNotMatch(codeOnly, /raise notice/)
  assert.doesNotMatch(codeOnly, /http_post|net\.http/)
  assert.doesNotMatch(codeOnly, /in schema (auth|storage)\b/)
  assert.doesNotMatch(codeOnly, /disable row level security|drop policy/)
})

test('J1 local session contract proof: GoTrue-shaped OTP JWT satisfies hasPhoneOtpClaims while password/expired/cross-phone fail', async () => {
  const futureExp = Math.floor(Date.now() / 1000) + 3600
  const expiredExp = Math.floor(Date.now() / 1000) - 60
  const uid = '1d32787b-089e-4581-b0e2-d48f4f62937e'
  const phone = '6280000000101'

  const validOtpJwt = fakeJwt({ sub: uid, role: 'authenticated', phone, exp: futureExp, aal: 'aal1', amr: [{ method: 'otp' }] })
  assert.equal(hasPhoneOtpClaims(validOtpJwt, uid, phone), true)

  // Negative cases: password-only, expired, wrong phone, wrong user ID.
  assert.equal(hasPhoneOtpClaims(fakeJwt({ sub: uid, role: 'authenticated', phone, exp: futureExp, amr: [{ method: 'password' }] }), uid, phone), false)
  assert.equal(hasPhoneOtpClaims(fakeJwt({ sub: uid, role: 'authenticated', phone, exp: expiredExp, amr: [{ method: 'otp' }] }), uid, phone), false)
  assert.equal(hasPhoneOtpClaims(fakeJwt({ sub: uid, role: 'authenticated', phone: '6280000000102', exp: futureExp, amr: [{ method: 'otp' }] }), uid, phone), false)
  assert.equal(hasPhoneOtpClaims(fakeJwt({ sub: 'b1bc5a23-2c23-404f-b941-4763f1ddc219', role: 'authenticated', phone, exp: futureExp, amr: [{ method: 'otp' }] }), uid, phone), false)

  // Unconfirmed phone rejected even with OTP claim.
  const unconfirmed = await getPhoneOtpUser({
    getSession: async () => ({ data: { session: { access_token: validOtpJwt } as never }, error: null }),
    getUser: async () => ({ data: { user: { id: uid, phone, phone_confirmed_at: null } as never }, error: null }),
  })
  assert.equal(unconfirmed.data.user, null)
  assert.ok(unconfirmed.error)
})
