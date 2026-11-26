import { readFileSync } from 'node:fs'
import { z } from 'zod'

export const PRODUCTION_PROJECT_REF = 'gvrwzfwybvyqlvbqxebe'
const targetSchema = z.object({ schema_version: z.literal(1), project_ref: z.string().regex(/^[a-z]{20}$/),
  name: z.literal('agriguard-staging'), region: z.literal('ap-southeast-1'),
  postgres_major: z.literal(17), production_project_ref: z.literal(PRODUCTION_PROJECT_REF),
  migration_or_seed_approval: z.literal(false) }).passthrough()

export function validatePinnedTarget(input: unknown) {
  const parsed = targetSchema.safeParse(input)
  if (!parsed.success || parsed.data.project_ref === PRODUCTION_PROJECT_REF) throw new Error('INVALID_PINNED_STAGING_TARGET')
  return parsed.data
}
// Public project metadata only. Never load a key, DSN, or production link as the
// staging target, and never interpret this local registry as remote-write approval.
export const STAGING_TARGET = validatePinnedTarget(JSON.parse(readFileSync(
  new URL('../../supabase/staging/target.json', import.meta.url), 'utf8')))
export const STAGING_PROJECT_REF = STAGING_TARGET.project_ref
