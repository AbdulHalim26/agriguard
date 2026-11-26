// Fixed read-only Management API audit. No Supabase db/link/login commands,
// temporary-login-role endpoint, migration/seed execution, arbitrary SQL or writes.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const productionRef = 'gvrwzfwybvyqlvbqxebe'
const pinned = JSON.parse(await readFile(path.join(root, 'supabase/staging/target.json'), 'utf8'))
/** @typedef {{observed_at:string, staging:{ref:string,name:string,region:string,status:string},
 * production_ref:string, refs_differ:boolean, root_cli_link:string, cli_link_changed:boolean,
 * credential_values_printed:boolean, remote_mutations_executed:boolean, catalog?:Record<string,unknown>,
 * migration_history?:{ledger_present:boolean,count:number|null,note?:string},
 * auth_configuration?:{phone_enabled:boolean|null,signup_disabled:boolean|null,sms_autoconfirm:boolean|null,provider_secrets_printed:boolean}}} AuditResult */

/**
 * @param {{target:{project_ref:string,production_project_ref:string,name:string,region:string},token?:string,catalog?:boolean,fetcher?:typeof fetch,loadFile?:typeof readFile}} options
 * @returns {Promise<AuditResult>}
 */
export async function auditStagingTarget({ target, token = undefined, catalog = false, fetcher = fetch, loadFile = readFile }) {
  if (!/^[a-z0-9]{20}$/.test(target.project_ref) || target.project_ref === productionRef ||
      target.project_ref !== pinned.project_ref ||
      target.production_project_ref !== productionRef || target.name !== 'agriguard-staging' || target.region !== 'ap-southeast-1') {
    throw new Error('INVALID_OR_PRODUCTION_STAGING_TARGET')
  }
  if (!token) throw new Error('EXPLICIT_MANAGEMENT_ACCESS_TOKEN_REQUIRED_NO_LOGIN_ATTEMPTED')
  if (!/^sbp_[A-Za-z0-9]+$/.test(token)) throw new Error('INVALID_MANAGEMENT_CREDENTIAL_FORMAT')
  const api = async (endpoint, query) => {
    const allowed = [`/v1/projects/${target.project_ref}`, `/v1/projects/${target.project_ref}/config/auth`]
    const queryPath = `/v1/projects/${target.project_ref}/database/query`
    if (!(query === undefined ? allowed.includes(endpoint) : endpoint === queryPath)) throw new Error('READONLY_ROUTE_NOT_ALLOWLISTED')
    const response = await fetcher(`https://api.supabase.com${endpoint}`, {
      method: query === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: query === undefined ? undefined : JSON.stringify({ query, read_only: true }),
    })
    if (!response.ok) throw new Error(`MANAGEMENT_READONLY_HTTP_${response.status}`)
    return response.json()
  }
  const live = await api(`/v1/projects/${target.project_ref}`)
  if (live.id !== target.project_ref || live.name !== target.name || live.region !== target.region || live.status !== 'ACTIVE_HEALTHY') {
    throw new Error('LIVE_STAGING_IDENTITY_OR_HEALTH_MISMATCH')
  }
  /** @type {AuditResult} */
  const result = { observed_at: new Date().toISOString(), staging: { ref: live.id, name: live.name, region: live.region, status: live.status },
    production_ref: productionRef, refs_differ: live.id !== productionRef,
    root_cli_link: (await loadFile(path.join(root, 'supabase/.temp/project-ref'), 'utf8')).trim(),
    cli_link_changed: false, credential_values_printed: false, remote_mutations_executed: false }
  if (catalog) {
    const sql = await loadFile(path.join(root, 'supabase/staging/platform-preflight-readonly.sql'), 'utf8')
    const rows = await api(`/v1/projects/${target.project_ref}/database/query`, sql)
    const catalog = Array.isArray(rows) ? rows[0]?.preflight : undefined
    if (catalog?.transaction_read_only !== 'on') throw new Error('READ_ONLY_TRANSACTION_NOT_CONFIRMED')
    result.catalog = catalog
    if (catalog.migration_ledger_present) {
      const countRows = await api(`/v1/projects/${target.project_ref}/database/query`,
        "begin transaction read only; select count(*)::integer as migration_count from supabase_migrations.schema_migrations; rollback;")
      result.migration_history = { ledger_present: true, count: countRows[0]?.migration_count ?? null }
    } else result.migration_history = { ledger_present: false, count: 0, note: 'No ledger initialized; app tables also inspected separately' }
    const auth = await api(`/v1/projects/${target.project_ref}/config/auth`)
    result.auth_configuration = { phone_enabled: auth.external_phone_enabled ?? null, signup_disabled: auth.disable_signup ?? null,
      sms_autoconfirm: auth.sms_autoconfirm ?? null, provider_secrets_printed: false }
  }
  return result
}
async function main() {
  if (process.argv.slice(2).some((arg) => !['--catalog','--help'].includes(arg))) throw new Error('UNSUPPORTED_AUDIT_OPTION')
  if (process.argv.includes('--help')) {
    console.log('audit-staging-target.mjs [--catalog]: explicit Management token, pinned metadata / fixed READ ONLY catalog; no remote writes')
    return
  }
  const target = JSON.parse(await readFile(path.join(root, 'supabase/staging/target.json'), 'utf8'))
  const result = await auditStagingTarget({ target, token: process.env.SUPABASE_ACCESS_TOKEN?.trim(), catalog: process.argv.includes('--catalog') })
  console.log(JSON.stringify(result, null, 2))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'READONLY_STAGING_AUDIT_FAILED_NO_WRITE_ATTEMPTED')
    process.exitCode = 1
  })
}
