import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inventoryParcels, parcelsFromRepositorySeed } from '../lib/land/inventory'

export function runLandInventory(args: string[]): void {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Read-only local inventory. npm run land:inventory -- (--seed | --input authorized-fixture.json) [--output NEW-private-report.json]. No database/network access; stdout contains counts only.')
    return
  }
  let seed = false, input: string | undefined, output: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && !seed) seed = true
    else if (args[i] === '--input' && !input && args[i + 1] && !args[i + 1].startsWith('--')) input = args[++i]
    else if (args[i] === '--output' && !output && args[i + 1] && !args[i + 1].startsWith('--')) output = args[++i]
    else throw new Error('INVALID_ARGUMENTS')
  }
  if (seed === Boolean(input)) throw new Error('CHOOSE_ONE_LOCAL_INPUT')
  if (input?.includes('://') || output?.includes('://')) throw new Error('LOCAL_FILES_ONLY')
  const sourcePath = seed ? fileURLToPath(new URL('../supabase/migrations/0002_seed.sql', import.meta.url)) : resolve(input!)
  const stat = lstatSync(sourcePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw new Error('INPUT_FILE_UNSUPPORTED')
  const bytes = readFileSync(sourcePath)
  const sourceHash = createHash('sha256').update(bytes).digest('hex')
  const records: unknown = seed ? parcelsFromRepositorySeed(bytes.toString('utf8')) : JSON.parse(bytes.toString('utf8'))
  if (!Array.isArray(records) || records.length > 2000) throw new Error('INPUT_MUST_BE_ARRAY_MAX_2000')
  const inventory = inventoryParcels(records)
  const report = { ...inventory, source: { kind: seed ? 'REPOSITORY_DEMO_SEED' : 'AUTHORIZED_LOCAL_JSON',
    input_sha256: sourceHash, input_was_modified: false }, generated_at: new Date().toISOString() }
  // Refuse input/output aliasing and overwrites, with private permissions. The
  // original input + hash/index is the raw evidence; no coordinates in stdout.
  if (createHash('sha256').update(readFileSync(sourcePath)).digest('hex') !== sourceHash) throw new Error('INPUT_CHANGED_DURING_READ')
  if (output) {
    const destination = resolve(output)
    if (destination === realpathSync(sourcePath)) throw new Error('OUTPUT_CANNOT_REPLACE_INPUT')
    writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  }
  console.log(JSON.stringify({ schema_version: inventory.schema_version, source_kind: report.source.kind,
    input_sha256: sourceHash, ...inventory.summary, private_report_written: Boolean(output),
    input_was_modified: false, ownership_verified: false, claim_authorized: false }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runLandInventory(process.argv.slice(2)) }
  catch (error) {
    // Do not print JSON fragments, coordinates, identities, file paths or stacks.
    const known = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'INPUT_OR_OUTPUT_ERROR'
    console.error(`Inventaris lokal gagal: ${known}. Tidak ada perbaikan data otomatis.`)
    process.exitCode = 2
  }
}
