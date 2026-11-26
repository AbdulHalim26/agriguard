import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { z } from 'zod'
import { assessLandGeometry, classifyPointInPolygon } from '@/lib/land/geometry'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, STAGING_TARGET } from './target'
export { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, STAGING_TARGET } from './target'

// OFFLINE PREPARATION ONLY: no HTTP/SDK, SQL execution, subprocess, Auth creation,
// cloud project creation/link, migration push/reset, or production data reads.
export const STAGING_MIGRATIONS = [
  '0001_init.sql', '0003_fix_rls_recursion.sql', '0004_unique_water_level_district.sql',
  '0005_water_levels_unique.sql', '0007_fix_signup_and_poktan_rls.sql',
  '0008_fix_handle_new_user.sql', '0009_fix_onboarding_full_name.sql',
  '0010_phase0a_security.sql', '0011_phase0a_effective_grants.sql',
] as const
export const STAGING_COMPATIBILITY_MIGRATION = '0012_staging_explicit_api_grants.sql'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const STAGING_TEMP_ROOT = process.platform === 'darwin'
  ? '/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode' : '/tmp'
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function fail(code: string): never { throw new Error(code) }
const id = (kind: number, n: number) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const groupA = id(2, 201), groupB = id(2, 202)
export const STAGING_ACTORS = [
  { alias: 'farmer_a', role: 'petani', phone: '6280000000101', full_name: '[STAGING SYNTHETIC] Petani A', poktan_id: groupA },
  { alias: 'farmer_b', role: 'petani', phone: '6280000000102', full_name: '[STAGING SYNTHETIC] Petani B', poktan_id: groupB },
  { alias: 'ppl', role: 'ppl', phone: '6280000000103', full_name: '[STAGING SYNTHETIC] PPL', poktan_id: groupA },
  { alias: 'dinas', role: 'dinas', phone: '6280000000104', full_name: '[STAGING SYNTHETIC] Dinas', poktan_id: groupA },
] as const
const identitiesSchema = z.object({ farmer_a: z.string().uuid(), farmer_b: z.string().uuid(),
  ppl: z.string().uuid(), dinas: z.string().uuid() }).strict()
export type StagingIdentities = z.infer<typeof identitiesSchema>

export function assertStagingRef(ref: string) {
  if (!/^[a-z0-9]{20}$/.test(ref)) fail('INVALID_STAGING_PROJECT_REF')
  if (ref === PRODUCTION_PROJECT_REF) fail('PRODUCTION_PROJECT_FORBIDDEN')
  if (ref !== STAGING_PROJECT_REF) fail('UNVERIFIED_STAGING_PROJECT_FORBIDDEN')
  return ref
}
export function parseStagingIdentities(input: unknown): StagingIdentities {
  const result = identitiesSchema.safeParse(input)
  if (!result.success || new Set(Object.values(result.data)).size !== 4) fail('FOUR_DISTINCT_NATIVE_AUTH_UUIDS_REQUIRED')
  return result.data
}
export function nativeAuthPayloads(ref: string) {
  assertStagingRef(ref)
  return STAGING_ACTORS.map((actor) => ({ alias: actor.alias, expected_profile_role_after_seed: actor.role,
    payload: { phone: `+${actor.phone}`, phone_confirm: true,
      user_metadata: { full_name: actor.full_name, agriguard_staging_seed: 'phase2i-v1', staging_project_ref: ref } } }))
}

function keyScope(key: string | undefined, ref: string, role: 'anon' | 'service_role') {
  if (!key || key.startsWith('__') || /placeholder|REPLACE/i.test(key)) fail('STAGING_KEYS_NOT_CONFIGURED')
  if (key.split('.').length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
      if (claims.ref !== ref || claims.role !== role) fail('STAGING_KEY_PROJECT_OR_ROLE_MISMATCH')
      // Decoding is an OFFLINE sanity check, never signature validation/Auth.
      return 'JWT_REF_MATCHED_SIGNATURE_NOT_VERIFIED'
    } catch { fail('STAGING_KEY_PROJECT_OR_ROLE_MISMATCH') }
  }
  if (key.length >= 32 && key.startsWith(role === 'anon' ? 'sb_publishable_' : 'sb_secret_')) return 'OPAQUE_KEY_REQUIRES_SERVER_AUTH_TEST'
  return fail('UNRECOGNIZED_STAGING_KEY_FORMAT')
}
export function validateStagingEnvironment(env: NodeJS.ProcessEnv) {
  if (env.AGRIGUARD_ENVIRONMENT !== 'staging') fail('EXPLICIT_STAGING_ENVIRONMENT_REQUIRED')
  const ref = assertStagingRef(env.AGRIGUARD_STAGING_PROJECT_REF || '')
  let target: URL, app: URL
  try { target = new URL(env.NEXT_PUBLIC_SUPABASE_URL || ''); app = new URL(env.NEXT_PUBLIC_APP_URL || '') }
  catch { return fail('INVALID_STAGING_URLS') }
  if (target.href !== `https://${ref}.supabase.co/`) fail('STAGING_SUPABASE_URL_REF_MISMATCH')
  const productionHosts = ['agriguard-five.vercel.app', 'agriguard-abdulhalim26s-projects.vercel.app',
    'agriguard-git-main-abdulhalim26s-projects.vercel.app', 'agriguard-3sjnoldp3-abdulhalim26s-projects.vercel.app']
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)
  if (productionHosts.includes(app.hostname) || (app.protocol !== 'https:' && !(loopback && app.protocol === 'http:')) ||
      app.username || app.password || app.search || app.hash || app.pathname !== '/') fail('STAGING_APP_ORIGIN_REQUIRED')
  if (!['true','false'].includes(env.AUTH_PHONE_OTP_ENABLED || '') || env.AGRIGUARD_YOLO_ENABLED !== 'false') fail('EXPLICIT_STAGING_FLAGS_REQUIRED')
  return { project_ref: ref, supabase_origin: target.origin, app_origin: app.origin,
    anon_key_check: keyScope(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ref, 'anon'),
    server_key_check: keyScope(env.SUPABASE_SERVICE_ROLE_KEY, ref, 'service_role'),
    phone_otp_enabled: env.AUTH_PHONE_OTP_ENABLED === 'true', yolo_enabled: false,
    network_or_provider_verified: false, credentials_printed: false }
}

function png(index: number) {
  const width = 96, height = 64, pixels = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 3) + 1 + x * 3
    const stripe = (Math.floor(x / 8) + Math.floor(y / 8) + index) % 3
    pixels[offset] = 20 + stripe * 35 + index
    pixels[offset + 1] = 120 + stripe * 25
    pixels[offset + 2] = 25 + index * 20
  }
  const chunk = (name: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(name), data]), length = Buffer.alloc(4), checksum = Buffer.alloc(4)
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(payload))
    return Buffer.concat([length, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('tEXt', Buffer.from('Description\0AgriGuard SYNTHETIC STAGING QA ONLY; not crop evidence')),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

export function buildStagingSeed(ref: string, input: unknown) {
  assertStagingRef(ref)
  const identities = parseStagingIdentities(input)
  const actors = STAGING_ACTORS.map((actor) => ({ ...actor, id: identities[actor.alias] }))
  const groups = [
    { id: groupA, name: '[STAGING SYNTHETIC] Poktan A', village: 'Desa Uji A', district: 'Telukjambe Timur', invite_code: 'STG2I-A' },
    { id: groupB, name: '[STAGING SYNTHETIC] Poktan B', village: 'Desa Uji B', district: 'Telukjambe Barat', invite_code: 'STG2I-B' },
  ]
  const parcels = [
    { id: id(3, 301), owner_id: identities.farmer_a, poktan_id: groupA, name: '[STAGING SYNTHETIC] Lahan A', area_hectares: .2,
      polygon: [[107.31,-6.33],[107.3104,-6.33],[107.3104,-6.3304],[107.31,-6.3304]] },
    { id: id(3, 302), owner_id: identities.farmer_b, poktan_id: groupB, name: '[STAGING SYNTHETIC] Lahan B', area_hectares: .3,
      polygon: [[107.312,-6.332],[107.3125,-6.332],[107.3125,-6.3325],[107.312,-6.3325]] },
  ]
  for (const parcel of parcels) if (!assessLandGeometry(parcel.polygon, parcel.area_hectares).geometry.valid) fail('INVALID_SYNTHETIC_GEOMETRY')
  const cases = [{ parcel: parcels[0], lat: -6.3302, lon: 107.3102, status: 'rusak_ringan' },
    { parcel: parcels[0], lat: -6.3302, lon: 107.3102, status: 'rusak_berat' },
    { parcel: parcels[1], lat: -6.33225, lon: 107.31225, status: 'aman' }]
  const uploads = cases.map((test, index) => {
    const bytes = png(index), hash = sha(bytes), key = id(5, 501 + index)
    return { bucket: 'photos', path: `${test.parcel.owner_id}/reports/${key}/0_${hash}.png`, bytes,
      sha256: hash, file_size: bytes.length, mime: 'image/png', synthetic: true }
  })
  const reports = cases.map((test, index) => {
    const upload = uploads[index], key = id(5, 501 + index)
    if (classifyPointInPolygon([test.lon,test.lat], test.parcel.polygon) !== 'INSIDE') fail('INVALID_SYNTHETIC_GEOFENCE')
    return { id: id(4, 401 + index), user_id: test.parcel.owner_id, lahan_id: test.parcel.id,
      latitude: test.lat, longitude: test.lon, idempotency_key: key, manual_status: test.status,
      photo_path: upload.path, photo_hash: upload.sha256, photo_bytes: upload.file_size,
      submission_hash: sha(JSON.stringify({ lahan: test.parcel.id, latitude: test.lat, longitude: test.lon,
        photos: [upload.sha256], manual: test.status })) }
  })
  return { actors, fixture: { groups, parcels, reports }, uploads }
}

async function newOutput(output: string) {
  const resolved = path.resolve(output), base = path.join(ROOT, '.staging')
  const inside = (value: string, root: string) => value.startsWith(root + path.sep)
  if (!inside(resolved, base) && !inside(resolved, STAGING_TEMP_ROOT)) fail('PRIVATE_STAGING_OR_APPROVED_TMP_OUTPUT_REQUIRED')
  if (inside(resolved, base)) {
    try { await mkdir(base, { mode: 0o700 }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  const parent = await realpath(path.dirname(resolved))
  // macOS resolves /var to /private/var. Compare canonical parents/allowlists,
  // while still rejecting links that escape both private output roots.
  const actualBase = path.join(await realpath(ROOT), '.staging'), actualTmp = await realpath(STAGING_TEMP_ROOT)
  if (!(parent === actualBase || inside(parent, actualBase) || parent === actualTmp || inside(parent, actualTmp))) fail('SYMLINK_OUTPUT_OUTSIDE_ALLOWED_ROOT')
  await mkdir(resolved, { mode: 0o700 }) // Exclusive: preserve all previous bundles.
  return resolved
}
const save = (directory: string, name: string, content: string | Uint8Array) => writeFile(path.join(directory, name), content, { flag: 'wx', mode: 0o600 })
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'
const workspaceConfig = (ref: string) => `project_id = "${ref}"\n\n[db]\nmajor_version = ${STAGING_TARGET.postgres_major}\n\n[db.seed]\nenabled = false\nsql_paths = []\n`

export async function prepareStagingPlan(ref: string, output: string) {
  assertStagingRef(ref)
  const sources = await Promise.all(STAGING_MIGRATIONS.map(async (name) => {
    const bytes = await readFile(path.join(ROOT, 'supabase/migrations', name))
    return { name, bytes, sha256: sha(bytes) }
  }))
  const directory = await newOutput(output)
  await mkdir(path.join(directory, 'migrations'), { mode: 0o700 })
  for (const source of sources) await save(path.join(directory, 'migrations'), source.name, source.bytes)
  for (const name of ['fresh-project-check.sql','read-only-audit.sql','platform-preflight-readonly.sql',
    'assert-api-access.sql','explicit-api-grants.sql','identities.example.json','target.json']) {
    await save(directory, name, await readFile(path.join(ROOT, 'supabase/staging', name)))
  }
  const compatibility = await readFile(path.join(ROOT, 'supabase/staging/explicit-api-grants.sql'))
  const workspace = path.join(directory, 'workspace/supabase')
  await mkdir(path.join(workspace, 'migrations'), { recursive: true, mode: 0o700 })
  for (const source of sources) await save(path.join(workspace, 'migrations'), source.name, source.bytes)
  await save(path.join(workspace, 'migrations'), STAGING_COMPATIBILITY_MIGRATION, compatibility)
  const config = workspaceConfig(ref)
  await save(workspace, 'config.toml', config)
  const executionSteps = [...sources.map(({ name, sha256 }) => ({ file: `workspace/supabase/migrations/${name}`, sha256, kind: 'original_schema' })),
    { file: `workspace/supabase/migrations/${STAGING_COMPATIBILITY_MIGRATION}`, sha256: sha(compatibility), kind: 'staging_explicit_grants' }]
  const securitySuite = await readFile(path.join(ROOT, 'supabase/tests/phase0a_security.sql'), 'utf8')
  const dashboardSuite = `-- OWNER ONLY: staging ref ${ref}; verify Dashboard target independently.\n` +
    `set agriguard.local_security_tests='enabled';\n` + securitySuite.replace(/^\\set ON_ERROR_STOP on\r?\n/m, '')
  await save(directory, 'phase0a_security.dashboard.sql', dashboardSuite)
  await save(directory, 'native-auth-create.json', json(nativeAuthPayloads(ref)))
  await save(directory, '.env.staging.example', (await readFile(path.join(ROOT, '.env.staging.example'), 'utf8')).replaceAll('__NEW_STAGING_PROJECT_REF__', ref))
  const configSha = sha(config)
  const manifest = { phase: '2.0I.3', status: 'OFFLINE_PREPARED_NOT_APPLIED', project_ref: ref,
    target_name: STAGING_TARGET.name, target_region: STAGING_TARGET.region,
    forbidden_production_ref: PRODUCTION_PROJECT_REF, migrations: sources.map(({ name, sha256 }) => ({ name, sha256 })),
    execution_steps: executionSteps, workspace_config_sha256: configSha,
    execution_plan_sha256: sha(JSON.stringify({ project_ref: ref, execution_steps: executionSteps, workspace_config_sha256: configSha })),
    remote_execution_approval: 'NOT_GRANTED', seed_approval: 'NOT_GRANTED',
    excluded: ['0002_seed.sql','0006_seed_auth.sql','supabase/seed.sql','supabase/poc/**'],
    security_suite_source_sha256: sha(securitySuite), dashboard_suite_sha256: sha(dashboardSuite),
    auth_user_creation_executed: false, cloud_actions_executed: false, source: 'LOCAL_REVIEWED_FILES_NOT_PRODUCTION_DUMP' }
  await save(directory, 'manifest.json', json(manifest))
  return manifest
}

export async function inspectRootCliLink() {
  try {
    const ref = (await readFile(path.join(ROOT, 'supabase/.temp/project-ref'), 'utf8')).trim()
    return { project_ref: ref, is_production: ref === PRODUCTION_PROJECT_REF, changed: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { project_ref: null, is_production: false, changed: false }
  }
}

export async function verifyPreparedStagingPlan(planDirectory: string) {
  const directory = path.resolve(planDirectory)
  let manifest: Awaited<ReturnType<typeof prepareStagingPlan>>
  try { manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) }
  catch { return fail('INVALID_STAGING_PLAN_MANIFEST') }
  assertStagingRef(manifest.project_ref)
  if (!['2.0I.1', '2.0I.3'].includes(manifest.phase) || manifest.remote_execution_approval !== 'NOT_GRANTED' ||
      manifest.cloud_actions_executed !== false) fail('REVIEWED_OFFLINE_PLAN_REQUIRED')
  const expected = [...STAGING_MIGRATIONS, STAGING_COMPATIBILITY_MIGRATION]
  const files = (await readdir(path.join(directory, 'workspace/supabase/migrations'))).sort()
  if (JSON.stringify(files) !== JSON.stringify([...expected].sort())) fail('UNAPPROVED_MIGRATION_IN_WORKSPACE')
  if (manifest.execution_steps.length !== expected.length) fail('INCOMPLETE_STAGING_EXECUTION_PLAN')
  for (const [index, name] of expected.entries()) {
    const step = manifest.execution_steps[index], expectedFile = `workspace/supabase/migrations/${name}`
    if (step.file !== expectedFile) fail('STAGING_EXECUTION_ORDER_OR_PATH_MISMATCH')
    const bytes = await readFile(path.join(directory, expectedFile))
    const source = await readFile(name === STAGING_COMPATIBILITY_MIGRATION
      ? path.join(ROOT, 'supabase/staging/explicit-api-grants.sql') : path.join(ROOT, 'supabase/migrations', name))
    if (sha(bytes) !== step.sha256 || sha(source) !== step.sha256) fail('STAGING_SQL_OR_REVIEWED_SOURCE_HASH_MISMATCH')
  }
  const config = await readFile(path.join(directory, 'workspace/supabase/config.toml'), 'utf8')
  if (sha(config) !== manifest.workspace_config_sha256 || config !== workspaceConfig(STAGING_PROJECT_REF)) fail('STAGING_SEED_OR_CONFIG_CHANGED')
  const digest = sha(JSON.stringify({ project_ref: manifest.project_ref, execution_steps: manifest.execution_steps,
    workspace_config_sha256: manifest.workspace_config_sha256 }))
  if (digest !== manifest.execution_plan_sha256) fail('STAGING_PLAN_DIGEST_MISMATCH')
  return { project_ref: manifest.project_ref, plan_sha256: digest, execution_steps: expected.length,
    seed_enabled: false, approval_granted: false, remote_actions_executed: false }
}

export async function verifyStagingWorkspace(workspaceDirectory: string, env: NodeJS.ProcessEnv = process.env) {
  const workspace = path.resolve(workspaceDirectory)
  if (path.basename(workspace) !== 'workspace') fail('ISOLATED_STAGING_WORKSPACE_REQUIRED')
  const checked = await verifyPreparedStagingPlan(path.dirname(workspace))
  for (const name of ['SUPABASE_PROJECT_ID','SUPABASE_PROJECT_REF']) {
    if (env[name] && env[name] !== STAGING_PROJECT_REF) fail('CONFLICTING_PROJECT_ENVIRONMENT_OVERRIDE')
  }
  for (const name of ['SUPABASE_DB_URL','DATABASE_URL','DB_URL','PGHOST','PGDATABASE','PGUSER','PGSERVICE','PGSERVICEFILE','PGOPTIONS']) {
    if (env[name]) fail('REMOTE_DATABASE_ENVIRONMENT_OVERRIDE_FORBIDDEN')
  }
  let linked: string
  try { linked = (await readFile(path.join(workspace, 'supabase/.temp/project-ref'), 'utf8')).trim() }
  catch { return fail('STAGING_WORKSPACE_NOT_LINKED_NO_ROOT_FALLBACK') }
  assertStagingRef(linked)
  try {
    const metadata = JSON.parse(await readFile(path.join(workspace, 'supabase/.temp/linked-project.json'), 'utf8'))
    const linkedId = metadata.ref ?? metadata.id
    if (linkedId !== linked || metadata.name !== STAGING_TARGET.name) fail('STAGING_LINK_METADATA_MISMATCH')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('STAGING_LINK_METADATA_MISSING')
    throw error
  }
  try {
    const value = (await readFile(path.join(workspace, 'supabase/.temp/pooler-url'), 'utf8')).trim()
    const url = new URL(value)
    const direct = url.hostname === `db.${linked}.supabase.co`
    const pooler = url.hostname.endsWith('.pooler.supabase.com') &&
      ['postgres','cli_login_postgres'].some((role) => url.username === `${role}.${linked}`)
    if (!['postgres:','postgresql:'].includes(url.protocol) || !(direct || pooler) ||
        ['host','hostaddr','user','service','password','dbname'].some((key) => url.searchParams.has(key))) fail('STAGING_POOLER_TARGET_MISMATCH')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return { ...checked, workspace_link: linked, root_link: await inspectRootCliLink(), production_link_changed: false }
}
export async function prepareStagingSeed(ref: string, identities: unknown, output: string) {
  const seed = buildStagingSeed(ref, identities)
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const template = await readFile(path.join(ROOT, 'supabase/staging/seed-template.sql'), 'utf8')
  const sql = template.replace('__PROJECT_REF__', quote(ref)).replace('__ACTORS__', quote(JSON.stringify(seed.actors)))
    .replace('__FIXTURE__', quote(JSON.stringify(seed.fixture)))
  const directory = await newOutput(output)
  for (const upload of seed.uploads) {
    const destination = path.join(directory, 'photos', upload.path)
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
    await save(path.dirname(destination), path.basename(destination), upload.bytes)
  }
  await save(directory, 'seed.sql', sql)
  const manifest = { phase: '2.0I', status: 'SYNTHETIC_FIXTURES_NOT_UPLOADED_OR_APPLIED', project_ref: ref,
    actors: seed.actors, fixture: seed.fixture, uploads: seed.uploads.map(({ bytes: _bytes, ...metadata }) => metadata),
    verification_decisions_seeded: false, ai_receipts_seeded: false, water_readings_seeded: false }
  await save(directory, 'seed-manifest.json', json(manifest))
  return manifest
}
