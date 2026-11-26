import { z } from 'zod'

export class VersioningError extends Error {
  constructor(public code: string) { super(code) }
}
const uuid = z.string().uuid()
export const geometryCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('BASELINE'), command_id: uuid, parcel_id: uuid,
    expected_version_id: z.null(), reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ operation: z.literal('CHANGE'), command_id: uuid, parcel_id: uuid,
    expected_version_id: uuid, polygon: z.unknown(), declared_area_hectares: z.number().finite().positive().max(1000).optional(),
    reason: z.string().trim().min(1).max(500) }).strict(),
])
export const reportCommandSchema = z.object({
  command_id: uuid, parcel_id: uuid, captured_geometry_version_id: uuid.nullable(),
  idempotency_key: uuid, latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  client_created_at: z.string().datetime({ offset: true }), photo_refs: z.array(uuid).min(1).max(3),
  evidence: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('manual'), status: z.enum(['aman', 'rusak_ringan', 'rusak_berat']) }).strict(),
    z.object({ mode: z.literal('server_ai'), analysis_id: uuid }).strict(),
    z.object({ mode: z.literal('pending') }).strict(),
  ]),
}).strict()
export type GeometryCommand = z.infer<typeof geometryCommandSchema>
export type ReportCommand = z.infer<typeof reportCommandSchema>
export interface VersioningActor { user_id: string; poktan_id: string }

export function parseCommand<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new VersioningError('INVALID_COMMAND')
  return result.data
}

// Interpretation only; never backfill a current boundary into an older report.
export function reportGeometryContext(report: { id: string; lahan_id: string; geometry_version_id?: string | null }) {
  return { report_id: report.id, parcel_id: report.lahan_id, geometry_version_id: report.geometry_version_id ?? null,
    boundary_status: report.geometry_version_id ? 'VERSION_BOUND' as const : 'LEGACY_BOUNDARY_UNKNOWN' as const }
}
export function queuedGeometryRecovery(queue: { id: string; geometryVersionId?: unknown }, errorCode?: string) {
  const captured = uuid.safeParse(queue.geometryVersionId)
  return { original_queue_id: queue.id, captured_geometry_version_id: captured.success ? captured.data : null,
    action: !captured.success || errorCode === 'GEOMETRY_VERSION_STALE' ? 'HUMAN_REVIEW_REQUIRED' as const : 'SERVER_VALIDATION_REQUIRED' as const,
    reason: !captured.success ? 'LEGACY_BOUNDARY_UNKNOWN' : errorCode || 'UNTRUSTED_CAPTURE_REFERENCE',
    preserve_original_key: true, preserve_photos_and_coordinates: true, automatically_rebind: false }
}
