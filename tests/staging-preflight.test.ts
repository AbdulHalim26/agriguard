import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { assessLandGeometry, classifyPointInPolygon } from '../lib/land/geometry'
import { assertStagingRef, buildStagingSeed, nativeAuthPayloads, parseStagingIdentities,
  prepareStagingPlan, prepareStagingSeed, PRODUCTION_PROJECT_REF, STAGING_MIGRATIONS,
  STAGING_TEMP_ROOT, STAGING_PROJECT_REF, validateStagingEnvironment } from '../lib/staging/preflight'

// Offline only. SQL/GoTrue/Storage/RLS are NOT emulated or claimed tested here.
const ref = STAGING_PROJECT_REF // Public verified ref; tests never contact it.
const uuid = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identities = { farmer_a: uuid(1), farmer_b: uuid(2), ppl: uuid(3), dinas: uuid(4) }
const jwt = (project: string, role: string) => `header.${Buffer.from(JSON.stringify({ ref: project, role })).toString('base64url')}.synthetic-signature`
const environment = (): NodeJS.ProcessEnv => ({ NODE_ENV: 'development', AGRIGUARD_ENVIRONMENT: 'staging', AGRIGUARD_STAGING_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(ref, 'anon'),
  SUPABASE_SERVICE_ROLE_KEY: jwt(ref, 'service_role'), NEXT_PUBLIC_APP_URL: 'http://localhost:3201',
  AUTH_PHONE_OTP_ENABLED: 'false', AGRIGUARD_YOLO_ENABLED: 'false' })
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

test('staging target: production, malformed refs and placeholder refs fail before bundle creation', async () => {
  for (const value of [PRODUCTION_PROJECT_REF, 'abcdefghijklmnopqrst', '', '__NEW_STAGING_PROJECT_REF__', `${ref}.evil`, `${ref}/../production`]) {
    assert.throws(() => assertStagingRef(value))
    await assert.rejects(prepareStagingPlan(value, path.join(STAGING_TEMP_ROOT, 'must-not-be-created')))
  }
})
test('staging environment: explicit isolated target passes only an OFFLINE sanity check', () => {
  const summary = validateStagingEnvironment(environment())
  assert.equal(summary.project_ref, ref); assert.equal(summary.network_or_provider_verified, false)
  assert.equal(summary.credentials_printed, false); assert.equal(summary.phone_otp_enabled, false)
  assert.ok(!JSON.stringify(summary).includes('synthetic-signature'))
})
test('staging environment: production URL, mixed-project key, wrong-role key and unsafe origins fail closed', () => {
  for (const patch of [
    { NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co/extra` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co?token=secret` },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_PROJECT_REF, 'anon') },
    { SUPABASE_SERVICE_ROLE_KEY: jwt(PRODUCTION_PROJECT_REF, 'service_role') },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(ref, 'service_role') },
    { NEXT_PUBLIC_APP_URL: 'https://agriguard-five.vercel.app' },
    { NEXT_PUBLIC_APP_URL: 'http://unrelated.invalid' },
    { AGRIGUARD_ENVIRONMENT: 'production' }, { AGRIGUARD_YOLO_ENABLED: 'true' },
  ]) assert.throws(() => validateStagingEnvironment({ ...environment(), ...patch }))
})
test('staging environment: opaque keys are not misrepresented as project/signature verification', () => {
  const value = validateStagingEnvironment({ ...environment(), NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${'x'.repeat(32)}`,
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'y'.repeat(32)}` })
  assert.equal(value.server_key_check, 'OPAQUE_KEY_REQUIRES_SERVER_AUTH_TEST')
  assert.equal(value.network_or_provider_verified, false)
})
test('staging Auth payloads: exactly two farmer fixtures, PPL/Dinas assignment separate from user metadata', () => {
  const payloads = nativeAuthPayloads(ref)
  assert.equal(payloads.length, 4)
  assert.equal(payloads.filter((p) => p.expected_profile_role_after_seed === 'petani').length, 2)
  for (const entry of payloads) {
    assert.equal(entry.payload.user_metadata.staging_project_ref, ref)
    assert.ok(entry.payload.user_metadata.full_name.includes('SYNTHETIC'))
    assert.ok(!('password' in entry.payload)); assert.ok(!('role' in entry.payload.user_metadata))
  }
})
test('staging identities: only four distinct Auth UUIDs accepted; no client-controlled role/phone fields', () => {
  assert.deepEqual(parseStagingIdentities(identities), identities)
  for (const value of [{ ...identities, farmer_b: identities.farmer_a }, { ...identities, role: 'dinas' },
    { ...identities, farmer_a: '__UUID__' }, { farmer_a: uuid(1) }]) assert.throws(() => parseStagingIdentities(value))
})
test('staging fixtures: D1-valid synthetic polygons, inside GPS and cross-Poktan officer scope', () => {
  const seed = buildStagingSeed(ref, identities)
  assert.equal(seed.fixture.groups.length, 2); assert.equal(seed.fixture.parcels.length, 2)
  const farmerB = seed.actors.find((a) => a.alias === 'farmer_b')!, ppl = seed.actors.find((a) => a.alias === 'ppl')!
  assert.notEqual(farmerB.poktan_id, ppl.poktan_id)
  for (const parcel of seed.fixture.parcels) assert.equal(assessLandGeometry(parcel.polygon, parcel.area_hectares).geometry.valid, true)
  for (const report of seed.fixture.reports) {
    const parcel = seed.fixture.parcels.find((p) => p.id === report.lahan_id)!
    assert.equal(classifyPointInPolygon([report.longitude,report.latitude], parcel.polygon), 'INSIDE')
  }
})
test('staging fixtures: real PNG bytes/hash/object paths and unchanged v1 submission hash shape agree', () => {
  const seed = buildStagingSeed(ref, identities)
  assert.equal(new Set(seed.uploads.map((p) => p.sha256)).size, 3)
  for (const [index, upload] of seed.uploads.entries()) {
    assert.equal(upload.sha256, hash(upload.bytes)); assert.equal(upload.file_size, upload.bytes.length)
    assert.deepEqual([...upload.bytes.subarray(0,8)], [137,80,78,71,13,10,26,10])
    let cursor = 8, data: Buffer | null = null
    while (cursor < upload.bytes.length) {
      const size = upload.bytes.readUInt32BE(cursor), name = upload.bytes.toString('ascii', cursor + 4, cursor + 8)
      if (name === 'IDAT') data = upload.bytes.subarray(cursor + 8, cursor + 8 + size)
      cursor += size + 12
    }
    assert.equal(inflateSync(data!).length, 64 * (1 + 96 * 3))
    const row = seed.fixture.reports[index]
    assert.equal(upload.path, `${row.user_id}/reports/${row.idempotency_key}/0_${row.photo_hash}.png`)
    assert.equal(row.submission_hash, hash(JSON.stringify({ lahan: row.lahan_id, latitude: row.latitude,
      longitude: row.longitude, photos: [upload.sha256], manual: row.manual_status })))
  }
})
test('staging plan: exact nine-file schema/security allowlist, original bytes/hashes, exclusive private outputs', async () => {
  const temporary = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-plan-test-'))
  try {
    const output = path.join(temporary, 'new-plan'), result = await prepareStagingPlan(ref, output)
    assert.equal(result.cloud_actions_executed, false)
    assert.deepEqual((await readdir(path.join(output, 'migrations'))).sort(), [...STAGING_MIGRATIONS].sort())
    for (const entry of result.migrations) {
      const original = await readFile(path.join('supabase/migrations', entry.name))
      assert.deepEqual(await readFile(path.join(output, 'migrations', entry.name)), original)
      assert.equal(entry.sha256, hash(original))
    }
    assert.equal((await stat(path.join(output, 'manifest.json'))).mode & 0o777, 0o600)
    const suite = await readFile(path.join(output, 'phase0a_security.dashboard.sql'), 'utf8')
    assert.ok(!suite.includes('\\set ON_ERROR_STOP')); assert.ok(suite.includes('rollback;'))
    assert.equal(result.dashboard_suite_sha256, hash(suite))
    const before = await readFile(path.join(output, 'manifest.json'))
    await assert.rejects(prepareStagingPlan(ref, output), { code: 'EEXIST' })
    assert.deepEqual(await readFile(path.join(output, 'manifest.json')), before)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('staging bundle: rendered seed has pending/manual fixtures and no fabricated AI/verification history', async () => {
  const temporary = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-seed-test-'))
  try {
    const output = path.join(temporary, 'new-seed'), result = await prepareStagingSeed(ref, identities, output)
    assert.equal(result.verification_decisions_seeded, false); assert.equal(result.ai_receipts_seeded, false)
    const sql = await readFile(path.join(output, 'seed.sql'), 'utf8')
    assert.ok(!sql.includes('__ACTORS__')); assert.ok(!sql.includes('__FIXTURE__'))
    assert.ok(!/insert\s+into\s+auth\.users/i.test(sql)); assert.ok(!/insert\s+into\s+public\.ai_analyses/i.test(sql))
    assert.ok(sql.includes('EXACTLY_FOUR_NEW_NATIVE_TEST_USERS_REQUIRED'))
    assert.ok(sql.includes('FRESH_EMPTY_BUSINESS_TABLES_REQUIRED'))
    for (const photo of result.uploads) assert.equal(hash(await readFile(path.join(output, 'photos', photo.path))), photo.sha256)
    await assert.rejects(prepareStagingSeed(ref, identities, output), { code: 'EEXIST' })
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('staging outputs: source/production paths and escaping symlink parents cannot be used', async () => {
  await assert.rejects(prepareStagingPlan(ref, 'supabase/migrations/new-plan'), /PRIVATE_STAGING_OR_APPROVED_TMP/)
  const temporary = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-symlink-test-'))
  try {
    await symlink(process.cwd(), path.join(temporary, 'escape'))
    await assert.rejects(prepareStagingPlan(ref, path.join(temporary, 'escape', 'must-not-create')), /SYMLINK_OUTPUT/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('staging CLI: malformed identity input cannot leak a secret-shaped value or perform remote operations', async () => {
  const temporary = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-cli-test-'))
  try {
    const input = path.join(temporary, 'bad.json'), secret = 'synthetic-test-secret-do-not-print'
    await writeFile(input, `{"key":"${secret}",`)
    const result = spawnSync(process.execPath, ['--import','./tests/register.mjs','scripts/prepare-staging.ts','seed',
      '--project-ref',ref,'--identities',input,'--output',path.join(temporary, 'new')], { encoding: 'utf8' })
    assert.equal(result.status, 1); assert.match(result.stderr, /INVALID_LOCAL_IDENTITY_MAP_FILE/)
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret))
    assert.match(execFileSync(process.execPath, ['--import','./tests/register.mjs','scripts/prepare-staging.ts','--help'], { encoding: 'utf8' }), /OFFLINE ONLY/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('staging CLI: documented plan and seed commands generate local bundles without a cloud apply mode', async () => {
  const temporary = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-cli-success-'))
  try {
    const input = path.join(temporary, 'identities.json')
    await writeFile(input, JSON.stringify(identities), { mode: 0o600 })
    const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath,
      ['--import','./tests/register.mjs','scripts/prepare-staging.ts',...args], { encoding: 'utf8' }))
    assert.equal(run('plan','--project-ref',ref,'--output',path.join(temporary, 'plan')).migrations, 9)
    const seed = run('seed','--project-ref',ref,'--identities',input,'--output',path.join(temporary, 'seed'))
    assert.equal(seed.cloud_actions_executed, false); assert.equal(seed.users, 4); assert.equal(seed.images, 3)
    const apply = spawnSync(process.execPath, ['--import','./tests/register.mjs','scripts/prepare-staging.ts',
      'apply','--project-ref',ref,'--output',path.join(temporary, 'forbidden')], { encoding: 'utf8' })
    assert.equal(apply.status, 1); assert.match(apply.stderr, /EXPECTED_PLAN_SEED_OR_CHECK_ENV/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
