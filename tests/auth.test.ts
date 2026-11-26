import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPhoneOtpUser, requirePhoneOtpSession } from '../lib/auth/session'
import { phoneOtp } from '../lib/auth/phone-otp'

const user = { id: 'test-user', phone: '6280000000000', phone_confirmed_at: '2026-01-01' }
const token = (method: string, sub = user.id) => `header.${Buffer.from(JSON.stringify({ sub, phone: user.phone, role: 'authenticated', exp: Date.now() / 1000 + 300, amr: [{ method }] })).toString('base64url')}.signature`

test('validated password sessions and forged mock cookies do not authenticate', async () => {
  const auth = {
    getSession: async () => ({ data: { session: { access_token: token('password') } }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
  }
  assert.equal((await getPhoneOtpUser(auth as any)).data.user, null)
  auth.getSession = async () => ({ data: { session: null as any }, error: null })
  assert.equal((await getPhoneOtpUser(auth as any)).data.user, null)
})

test('a token must be validated by Supabase, match the user, and contain phone OTP', async () => {
  let checkedToken: string | undefined
  const otpToken = token('otp')
  const auth = {
    getSession: async () => ({ data: { session: { access_token: otpToken } }, error: null }),
    getUser: async (jwt?: string) => { checkedToken = jwt; return { data: { user }, error: null } },
  }
  assert.equal((await getPhoneOtpUser(auth as any)).data.user?.id, user.id)
  assert.equal(checkedToken, otpToken)
  assert.equal((await getPhoneOtpUser(auth as any, token('otp', 'other'))).data.user, null)
  auth.getUser = async () => ({ data: { user: null as any }, error: new Error('invalid signature') }) as any
  assert.equal((await getPhoneOtpUser(auth as any)).data.user, null)
})

test('changing the Auth phone on a stolen legacy account cannot bypass the pinned profile identity', async () => {
  let profilePhone = '6280000000999'
  const client: any = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: token('otp') } }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone: profilePhone }, error: null }) }) }) }),
  }
  requirePhoneOtpSession(client)
  assert.equal((await client.auth.getUser()).data.user, null)
  profilePhone = user.phone
  assert.equal((await client.auth.getUser()).data.user.id, user.id)
})

function otpClients({ legacy = false, nativePending = false, deliveryError = false, verificationError = false } = {}) {
  let deliveryCalls = 0
  let passwordCalls = 0
  const client: any = {
    auth: {
      signInWithOtp: async () => { deliveryCalls++; return { error: deliveryError ? { status: 503 } : null } },
      verifyOtp: async () => ({ error: verificationError ? {} : null, data: { user, session: verificationError ? null : {} } }),
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: () => { passwordCalls++; throw new Error('forbidden') },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { full_name: 'Test' }, error: null }) }) }) }),
  }
  const admin: any = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: legacy || nativePending ? { id: user.id } : null, error: null }) }) }) }),
    auth: { admin: { getUserById: async () => ({ data: { user: { ...user, phone: nativePending ? user.phone : '', phone_confirmed_at: null } }, error: null }) } },
  }
  return { client, admin, counts: () => ({ deliveryCalls, passwordCalls }) }
}

test('OTP is fail-closed when disabled or provider fails; never falls back to a password', async () => {
  const deps = otpClients({ deliveryError: true })
  const input = { phone: user.phone, mode: 'login' }
  await assert.rejects(phoneOtp(input, { ...deps, enabled: false }), /belum diaktifkan/)
  assert.equal(deps.counts().deliveryCalls, 0)
  await assert.rejects(phoneOtp(input, { ...deps, enabled: true }), /tidak dapat dikirim/)
  assert.equal(deps.counts().passwordCalls, 0)
})

test('legacy accounts are not recreated, and failed verification does not yield a session', async () => {
  const legacy = otpClients({ legacy: true })
  await assert.rejects(phoneOtp({ phone: user.phone, mode: 'register' }, { ...legacy, enabled: true }), /penautan/)
  assert.equal(legacy.counts().deliveryCalls, 0)
  const failed = otpClients({ verificationError: true })
  await assert.rejects(phoneOtp({ phone: user.phone, code: '000000', mode: 'login' }, { ...failed, enabled: true }), /tidak valid/)
  const valid = otpClients()
  assert.deepEqual(await phoneOtp({ phone: user.phone, code: '000000', mode: 'login' }, { ...valid, enabled: true }), { success: true, next: '/dashboard' })
})

test('a newly issued native phone OTP can confirm an existing unconfirmed native identity', async () => {
  const deps = otpClients({ nativePending: true })
  const result = await phoneOtp({ phone: user.phone, code: '000000', mode: 'register' }, { ...deps, enabled: true })
  assert.equal(result.success, true)
  assert.equal(result.next, '/dashboard')
})

test('expired, malformed, and unconfirmed-phone sessions fail closed', async () => {
  const valid = JSON.parse(Buffer.from(token('otp').split('.')[1], 'base64url').toString())
  const expired = `header.${Buffer.from(JSON.stringify({ ...valid, exp: 1 })).toString('base64url')}.signature`
  const auth: any = {
    getSession: async () => ({ data: { session: { access_token: expired } }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
  }
  assert.equal((await getPhoneOtpUser(auth)).data.user, null)
  assert.equal((await getPhoneOtpUser(auth, 'malformed')).data.user, null)
  auth.getUser = async () => ({ data: { user: { ...user, phone_confirmed_at: null } }, error: null })
  assert.equal((await getPhoneOtpUser(auth, token('otp'))).data.user, null)
})

test('disabled OTP transport rejects verification as well as initiation without provider calls', async () => {
  const deps = otpClients()
  await assert.rejects(phoneOtp({ phone: user.phone, code: '000000', mode: 'login' }, { ...deps, enabled: false }), /belum diaktifkan/)
  assert.equal(deps.counts().deliveryCalls, 0)
  assert.equal(deps.counts().passwordCalls, 0)
})

test('existing native farmer/PPL/Dinas login preserves UUID/profile and does not request account creation', async () => {
  for (const role of ['petani', 'ppl', 'dinas']) {
    const existingProfile = { id: user.id, role, full_name: 'Existing fixture', poktan_id: 'assigned-group' }
    const before = structuredClone(existingProfile)
    let requested: any
    const client: any = {
      auth: {
        signInWithOtp: async (input: unknown) => { requested = input; return { error: null } },
        verifyOtp: async () => ({ data: { user, session: {} }, error: null }),
        getUser: async () => ({ data: { user }, error: null }),
      },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: existingProfile, error: null }) }) }) }),
    }
    const admin: any = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingProfile, error: null }) }) }) }),
      auth: { admin: { getUserById: async (id: string) => { assert.equal(id, user.id); return { data: { user }, error: null } } } },
    }
    await phoneOtp({ phone: user.phone, mode: 'login' }, { client, admin, enabled: true })
    assert.equal(requested.options.shouldCreateUser, false)
    assert.equal(requested.options.channel, 'sms')
    assert.equal((await phoneOtp({ phone: user.phone, code: '000000', mode: 'login' }, { client, admin, enabled: true })).next, '/dashboard')
    assert.deepEqual(existingProfile, before)
  }
})
