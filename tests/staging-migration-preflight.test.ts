import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { prepareStagingPlan, verifyPreparedStagingPlan, verifyStagingWorkspace, inspectRootCliLink,
  STAGING_PROJECT_REF, STAGING_TARGET, STAGING_TEMP_ROOT, PRODUCTION_PROJECT_REF, STAGING_COMPATIBILITY_MIGRATION } from '../lib/staging/preflight'
import { validatePinnedTarget } from '../lib/staging/target'
import { auditStagingTarget } from '../scripts/audit-staging-target.mjs'

// Offline source/plan/transport tests. NO cloud CLI link, migration execution,
// SQL privilege emulation, real Management request, or real Auth user creation.
async function temporaryPlan() {
  const root = await mkdtemp(path.join(STAGING_TEMP_ROOT, 'staging-i1-test-'))
  const directory = path.join(root, 'plan')
  await prepareStagingPlan(STAGING_PROJECT_REF, directory)
  return { root, directory, workspace: path.join(directory, 'workspace') }
}
const cleanEnv: NodeJS.ProcessEnv = { NODE_ENV: 'development' }

test('I1 target registry: wrong name/region/production/approval edits cannot change the verified staging target', () => {
  assert.equal(STAGING_PROJECT_REF, 'zlluhylmykoymynnjxjs')
  assert.notEqual(STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF)
  for (const patch of [{ project_ref: PRODUCTION_PROJECT_REF }, { name: 'agriguard' },
    { region: 'ap-northeast-2' }, { migration_or_seed_approval: true }, { production_project_ref: 'other' }]) {
    assert.throws(() => validatePinnedTarget({ ...STAGING_TARGET, ...patch }))
  }
})
test('I1 plan: nine unchanged originals plus a separate grants step, isolated seeded-disabled workspace, no root link change', async () => {
  const before = await inspectRootCliLink(), plan = await temporaryPlan()
  try {
    const checked = await verifyPreparedStagingPlan(plan.directory)
    assert.equal(checked.execution_steps, 10); assert.equal(checked.seed_enabled, false)
    assert.equal(checked.approval_granted, false); assert.equal(checked.remote_actions_executed, false)
    const manifest = JSON.parse(await readFile(path.join(plan.directory, 'manifest.json'), 'utf8'))
    assert.equal(manifest.migrations.length, 9)
    assert.equal(manifest.execution_steps.at(-1).file, `workspace/supabase/migrations/${STAGING_COMPATIBILITY_MIGRATION}`)
    assert.deepEqual(await inspectRootCliLink(), before)
    await assert.rejects(verifyStagingWorkspace(plan.workspace, cleanEnv), /NOT_LINKED_NO_ROOT_FALLBACK/)
  } finally { await rm(plan.root, { recursive: true, force: true }) }
})
test('I1 plan tampering: legacy migration injection, modified source copy and seed-enabled config fail before execution', async () => {
  const plan = await temporaryPlan()
  try {
    const migrations = path.join(plan.workspace, 'supabase/migrations'), injected = path.join(migrations, '0006_seed_auth.sql')
    await writeFile(injected, 'select 1;')
    await assert.rejects(verifyPreparedStagingPlan(plan.directory), /UNAPPROVED_MIGRATION/)
    await rm(injected)
    const original = path.join(migrations, '0001_init.sql'), bytes = await readFile(original)
    await writeFile(original, Buffer.concat([bytes, Buffer.from('\n-- unreviewed edit\n')]))
    await assert.rejects(verifyPreparedStagingPlan(plan.directory), /HASH_MISMATCH/)
    await writeFile(original, bytes)
    const config = path.join(plan.workspace, 'supabase/config.toml'), text = await readFile(config, 'utf8')
    await writeFile(config, text.replace('enabled = false', 'enabled = true'))
    await assert.rejects(verifyPreparedStagingPlan(plan.directory), /SEED_OR_CONFIG_CHANGED/)
  } finally { await rm(plan.root, { recursive: true, force: true }) }
})
test('I1 plan tampering: reordering original migrations is rejected even when file bytes are intact', async () => {
  const plan = await temporaryPlan()
  try {
    const file = path.join(plan.directory, 'manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8'))
    ;[manifest.execution_steps[0],manifest.execution_steps[1]] = [manifest.execution_steps[1],manifest.execution_steps[0]]
    await writeFile(file, JSON.stringify(manifest))
    await assert.rejects(verifyPreparedStagingPlan(plan.directory), /ORDER_OR_PATH_MISMATCH/)
  } finally { await rm(plan.root, { recursive: true, force: true }) }
})
test('I1 workspace guard: synthetic cached link must match pinned ID/name and inherited target variables must be safe', async () => {
  const plan = await temporaryPlan()
  try {
    // These files are test fixtures, NOT the result of a remote Supabase link.
    const cache = path.join(plan.workspace, 'supabase/.temp')
    await mkdir(cache)
    await writeFile(path.join(cache, 'project-ref'), PRODUCTION_PROJECT_REF)
    await assert.rejects(verifyStagingWorkspace(plan.workspace, cleanEnv), /PRODUCTION_PROJECT_FORBIDDEN/)
    await writeFile(path.join(cache, 'project-ref'), STAGING_PROJECT_REF)
    await writeFile(path.join(cache, 'linked-project.json'), JSON.stringify({ id: PRODUCTION_PROJECT_REF, name: 'agriguard' }))
    await assert.rejects(verifyStagingWorkspace(plan.workspace, cleanEnv), /LINK_METADATA_MISMATCH/)
    await writeFile(path.join(cache, 'linked-project.json'), JSON.stringify({ id: STAGING_PROJECT_REF, name: STAGING_TARGET.name }))
    const good = await verifyStagingWorkspace(plan.workspace, cleanEnv)
    assert.equal(good.workspace_link, STAGING_PROJECT_REF); assert.equal(good.production_link_changed, false)
    await assert.rejects(verifyStagingWorkspace(plan.workspace, { ...cleanEnv, SUPABASE_PROJECT_ID: PRODUCTION_PROJECT_REF }), /PROJECT_ENVIRONMENT_OVERRIDE/)
    await assert.rejects(verifyStagingWorkspace(plan.workspace, { ...cleanEnv, PGHOST: 'production.invalid' }), /DATABASE_ENVIRONMENT_OVERRIDE/)
    await writeFile(path.join(cache, 'pooler-url'), `postgresql://postgres.${PRODUCTION_PROJECT_REF}:synthetic-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`)
    await assert.rejects(verifyStagingWorkspace(plan.workspace, cleanEnv), /POOLER_TARGET_MISMATCH/)
    await writeFile(path.join(cache, 'pooler-url'), `postgresql://postgres.${STAGING_PROJECT_REF}:synthetic-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`)
    assert.ok(!JSON.stringify(await verifyStagingWorkspace(plan.workspace, cleanEnv)).includes('synthetic-password'))
  } finally { await rm(plan.root, { recursive: true, force: true }) }
})

test('I1 audit guard: production/unregistered targets or missing token fail before a Management request', async () => {
  let calls = 0
  const fetcher = async () => { calls++; throw new Error('must never be requested') }
  for (const patch of [{ project_ref: PRODUCTION_PROJECT_REF }, { project_ref: 'abcdefghijklmnopqrst' }, { region: 'wrong' }]) {
    await assert.rejects(auditStagingTarget({ target: { ...STAGING_TARGET, ...patch }, token: 'sbp_synthetic', fetcher }), /INVALID_OR_PRODUCTION/)
  }
  await assert.rejects(auditStagingTarget({ target: STAGING_TARGET, fetcher }), /EXPLICIT_MANAGEMENT_ACCESS_TOKEN_REQUIRED/)
  assert.equal(calls, 0)
})
test('I1 audit transport: fixed staging API paths, read_only flag/transaction and redacted auth output', async () => {
  const requests: { url: string; method: string; query?: string }[] = []
  const fetcher: typeof fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input), init = options ?? {}
    const body = init.body ? JSON.parse(String(init.body)) : null
    requests.push({ url, method: init.method!, query: body?.query })
    assert.ok(url.startsWith(`https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}`))
    assert.ok(!url.includes(PRODUCTION_PROJECT_REF))
    if (init.method === 'POST') {
      assert.ok(url.endsWith('/database/query')); assert.equal(body.read_only, true)
      assert.match(body.query, /begin transaction read only/i); assert.match(body.query, /rollback;/i)
      return Response.json(body.query.includes('migration_count') ? [{ migration_count: 0 }]
        : [{ preflight: { transaction_read_only: 'on', migration_ledger_present: true, auth_user_count: 0, app_tables: [] } }])
    }
    if (url.endsWith('/config/auth')) return Response.json({ external_phone_enabled: false, sms_twilio_auth_token: 'synthetic-secret' })
    return Response.json({ id: STAGING_PROJECT_REF, name: STAGING_TARGET.name, region: STAGING_TARGET.region, status: 'ACTIVE_HEALTHY' })
  }
  const result = await auditStagingTarget({ target: STAGING_TARGET, token: 'sbp_synthetic', catalog: true, fetcher })
  assert.equal(result.remote_mutations_executed, false); assert.equal(result.migration_history?.count, 0)
  assert.equal(requests.filter((r) => r.method === 'POST').length, 2)
  assert.ok(!JSON.stringify(result).includes('synthetic-secret')); assert.ok(!JSON.stringify(result).includes('sbp_synthetic'))
})
test('I1 audit CLI: missing explicit token fails locally without attempting Supabase CLI login/DB bootstrap', () => {
  const env = { ...process.env }; delete env.SUPABASE_ACCESS_TOKEN
  const result = spawnSync(process.execPath, ['scripts/audit-staging-target.mjs','--catalog'], { encoding: 'utf8', env })
  assert.equal(result.status, 1); assert.match(result.stderr, /EXPLICIT_MANAGEMENT_ACCESS_TOKEN_REQUIRED/)
  assert.ok(!result.stderr.includes('Initialising login role'))
})

test('I3 Q04 supplement: hardens global and public default privileges safely without modifying managed schemas', async () => {
  const sql = await readFile(path.resolve('supabase/staging/explicit-api-grants.sql'), 'utf8')
  const lower = sql.toLowerCase()
  // Creator role safety: hardens postgres + current_user, fails closed if non-member, conditional for supabase_admin.
  assert.match(lower, /migration_creator_must_be_postgres_or_member/)
  assert.match(lower, /array\['postgres',\s*current_user::text\]/)
  assert.match(lower, /pg_has_role\(current_user,\s*'supabase_admin',\s*'member'\)/)
  // Both global (built-in PUBLIC EXECUTE override) and per-schema public defaults must be revoked.
  for (const kind of ['tables', 'sequences', 'functions']) {
    assert.match(lower, new RegExp(`alter default privileges for role %i revoke all on ${kind} from public, anon, authenticated`))
    assert.match(lower, new RegExp(`alter default privileges for role %i in schema public revoke all on ${kind} from public, anon, authenticated`))
  }
  // Never alter default privileges or grant/revoke on managed auth/storage schemas.
  assert.doesNotMatch(lower, /in schema (auth|storage)\b/)
  assert.doesNotMatch(lower, /\b(grant|revoke)\b[^\n;]*\bon\s+(schema\s+)?(auth|storage)\b/)
  // PG 17 MAINTAIN + destructive privileges explicitly revoked across all 7 app tables.
  assert.match(lower, /revoke truncate, trigger, references, maintain on table public\.%i from public, anon, authenticated/)
  // Required explicit application grants preserved without widening destructive/protected paths.
  assert.match(lower, /grant usage on schema public to authenticated,service_role/)
  assert.match(lower, /grant usage on type public\.user_role,public\.ai_status to authenticated,service_role/)
  assert.match(lower, /grant insert\(name,area_hectares,polygon,owner_id,poktan_id\) on public\.lahan to authenticated/)
  assert.match(lower, /grant update\(name,area_hectares,polygon\) on public\.lahan to authenticated/)
  assert.match(lower, /grant insert\(district,river_level_m,updated_by,updated_at\) on public\.water_levels to authenticated/)
  assert.match(lower, /grant update\(district,river_level_m,updated_by,updated_at\) on public\.water_levels to authenticated/)
  assert.match(lower, /grant select on public\.lahan,public\.water_levels,public\.audit_logs to service_role/)
  assert.match(lower, /grant insert on public\.audit_logs to service_role/)
  assert.match(lower, /revoke all on function public\.handle_new_user\(\) from public,anon,authenticated,service_role/)
  assert.doesNotMatch(lower, /grant\s+delete\b/)
  assert.doesNotMatch(lower, /alter table[^\n;]*disable row level security/)
  assert.doesNotMatch(lower, /drop policy\b/)
})

test('I3 Q04 assertions and audit: strictly READ ONLY and enforce PG 17 MAINTAIN, default ACLs, Auth trigger, and RPCs', async () => {
  const assertSql = (await readFile(path.resolve('supabase/staging/assert-api-access.sql'), 'utf8')).toLowerCase()
  const auditSql = (await readFile(path.resolve('supabase/staging/read-only-audit.sql'), 'utf8')).toLowerCase()
  for (const doc of [assertSql, auditSql]) {
    const codeOnly = doc.replace(/--[^\n]*/g, '')
    assert.match(codeOnly, /\bbegin transaction read only;/)
    assert.match(codeOnly, /\brollback;/)
    assert.doesNotMatch(codeOnly, /\b(insert|update|delete|alter|create|drop|grant|revoke)\s+/)
  }
  // assert-api-access.sql covers PG 17 MAINTAIN, prospective default ACLs, owner posture, trigger, and 8 RPCs.
  assert.match(assertSql, /'truncate,trigger,references,maintain'/)
  assert.match(assertSql, /'select,insert,update,delete,truncate,trigger,references,maintain'/)
  assert.match(assertSql, /default_privileges_not_hardened/)
  assert.match(assertSql, /unexpected_table_owner/)
  assert.match(assertSql, /trigger_function_execute_exposed/)
  assert.match(assertSql, /auth_signup_trigger_missing/)
  assert.match(assertSql, /public\.complete_onboarding\(text,text\)/)
  assert.match(assertSql, /public\.verify_damage_report\(uuid,boolean,text\)/)
  // read-only-audit.sql exposes maintain and default_acl across all 7 app tables.
  assert.match(auditSql, /'maintain',\s*has_table_privilege/)
  assert.match(auditSql, /'default_acl'/)
  assert.match(auditSql, /'profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'/)
})

test('I3 immutable plan digest supersedes v2 while preserving original 9 migrations and non-approval', async () => {
  const plan = await temporaryPlan()
  try {
    const checked = await verifyPreparedStagingPlan(plan.directory)
    const manifest = JSON.parse(await readFile(path.join(plan.directory, 'manifest.json'), 'utf8'))
    assert.equal(manifest.phase, '2.0I.3')
    assert.equal(checked.execution_steps, 10)
    assert.equal(checked.approval_granted, false)
    assert.equal(checked.remote_actions_executed, false)
    assert.notEqual(checked.plan_sha256, 'c4d2205aa0ae72fdcc9b9a90f046592b27aa12e0684ff449a60e8a3194d3b421')
  } finally { await rm(plan.root, { recursive: true, force: true }) }
})
