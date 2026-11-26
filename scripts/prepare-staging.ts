import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { prepareStagingPlan, prepareStagingSeed, validateStagingEnvironment, verifyPreparedStagingPlan,
  verifyStagingWorkspace, inspectRootCliLink } from '../lib/staging/preflight'

// This CLI cannot connect to a database or create cloud/Auth/Storage resources.
async function main() {
  const args = parseArgs({ allowPositionals: true, options: {
    'project-ref': { type: 'string' }, output: { type: 'string' }, identities: { type: 'string' },
    plan: { type: 'string' }, workspace: { type: 'string' }, help: { type: 'boolean' },
  } })
  if (args.values.help) {
    console.log('OFFLINE ONLY: prepare-staging.ts plan --project-ref NEW_REF --output NEW_PRIVATE_DIR\n' +
      'prepare-staging.ts seed --project-ref NEW_REF --identities LOCAL_UUID_MAP.json --output NEW_PRIVATE_DIR\n' +
      'prepare-staging.ts check-env (load .env.staging.local explicitly; no network verification)\n' +
      'prepare-staging.ts verify-plan --plan PRIVATE_PLAN_DIR\n' +
      'prepare-staging.ts verify-workspace --workspace PRIVATE_PLAN_DIR/workspace\n' +
      'prepare-staging.ts inspect-link (read-only local cache inspection)')
    return
  }
  const [mode, ...extra] = args.positionals
  if (extra.length) throw new Error('UNEXPECTED_POSITIONAL_ARGUMENTS')
  if (mode === 'inspect-link' && !Object.keys(args.values).length) {
    console.log(JSON.stringify(await inspectRootCliLink(), null, 2)); return
  }
  if (mode === 'verify-plan' && args.values.plan && Object.keys(args.values).length === 1) {
    console.log(JSON.stringify(await verifyPreparedStagingPlan(args.values.plan), null, 2)); return
  }
  if (mode === 'verify-workspace' && args.values.workspace && Object.keys(args.values).length === 1) {
    console.log(JSON.stringify(await verifyStagingWorkspace(args.values.workspace), null, 2)); return
  }
  if (mode === 'check-env') {
    if (Object.keys(args.values).length) throw new Error('CHECK_ENV_TAKES_NO_OPTIONS')
    console.log(JSON.stringify(validateStagingEnvironment(process.env), null, 2)); return
  }
  const ref = args.values['project-ref'], output = args.values.output
  if (!ref || !output) throw new Error('PROJECT_REF_AND_NEW_OUTPUT_REQUIRED')
  if (mode === 'plan' && !args.values.identities) {
    const result = await prepareStagingPlan(ref, output)
    console.log(JSON.stringify({ status: result.status, migrations: result.migrations.length,
      execution_steps: result.execution_steps.length, plan_sha256: result.execution_plan_sha256, cloud_actions_executed: false })); return
  }
  if (mode === 'seed' && args.values.identities) {
    let identities: unknown
    try { identities = JSON.parse(await readFile(args.values.identities, 'utf8')) }
    catch { throw new Error('INVALID_LOCAL_IDENTITY_MAP_FILE') }
    const result = await prepareStagingSeed(ref, identities, output)
    console.log(JSON.stringify({ status: result.status, users: result.actors.length,
      reports: result.fixture.reports.length, images: result.uploads.length, cloud_actions_executed: false })); return
  }
  throw new Error('EXPECTED_PLAN_SEED_OR_CHECK_ENV')
}
main().catch((error) => {
  const code = (error as NodeJS.ErrnoException).code
  console.error(code === 'EEXIST' ? 'OUTPUT_EXISTS_PRIOR_BUNDLE_PRESERVED' : code === 'ENOENT' ? 'REQUIRED_LOCAL_FILE_OR_PARENT_MISSING'
    : error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'STAGING_PREPARATION_FAILED_NO_REMOTE_ACTIONS')
  process.exitCode = 1
})
