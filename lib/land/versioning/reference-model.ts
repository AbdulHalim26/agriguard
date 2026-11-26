import 'server-only'
import { createHash } from 'node:crypto'
import { assessLandGeometry, classifyPointInPolygon, GEOMETRY_POLICY } from '@/lib/land/geometry'
import { aiResultSchema } from '@/lib/reports/evidence'
import { geometryCommandSchema, parseCommand, reportCommandSchema, reportGeometryContext, VersioningError, type VersioningActor } from './contracts'

// IN-MEMORY REFERENCE MODEL, NOT A POSTGRESQL TRANSACTION/CONCURRENCY PROOF.
// No production imports/routes activate this model. Inputs are synthetic fixtures.
export interface PocParcel {
  id: string; owner_id: string; poktan_id: string; polygon: unknown; area_hectares: number
  current_geometry_version_id?: string | null
}
export interface PocReport {
  id: string; user_id: string; lahan_id: string; idempotency_key: string; submission_hash: string | null
  latitude: number; longitude: number; client_created_at: string; server_created_at: string
  photo_paths: string[]; photo_hash: string; geometry_version_id?: string | null
  evidence_source: string; ai_status: string | null; ai_confidence: number | null; ai_damage_pct: number | null
  ai_analysis_id: string | null; manual_status: string | null; is_verified: boolean
}
interface GeometryArtifact {
  id: string; actor_id: string; parcel_id: string; command_id: string; command_hash: string
  expected_version_id: string | null; original_polygon: unknown; computed_area_m2: number
  declared_area_hectares: number; reason: string; created_at: string; expires_at: string
  validation_metadata: { policy: typeof GEOMETRY_POLICY; method: string }; operation: 'BASELINE' | 'CHANGE'
}
interface GeometryVersion {
  id: string; parcel_id: string; version_number: number; previous_version_id: string | null
  validation_receipt_id: string; actor_id: string; created_at: string
  provenance: 'BASELINE_CAPTURED_NOT_HISTORICAL' | 'EXPLICIT_BOUNDARY_CHANGE'
}
interface ReportIntent {
  id: string; actor_id: string; command_hash: string; capture: string | null; row: PocReport
  created_at: string; expires_at: string
}
interface ModelState {
  parcels: PocParcel[]; artifacts: GeometryArtifact[]; versions: GeometryVersion[]; reports: PocReport[]
  reportIntents: ReportIntent[]; audit: { actor_id: string; action: string; entity_id: string; at: string }[]
}
const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex')
export type ModelFaultStage = 'after_version_insert' | 'after_head_advance' | 'after_report_insert' | 'before_commit'

export function createGeometryVersioningReference(config: {
  fixture_only: true; parcels: PocParcel[]; legacyReports?: PocReport[]
  photos?: { id: string; user_id: string; bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }[]
  analyses?: { id: string; user_id: string; photo_hash: string; status: string; confidence: number; damage_pct: number }[]
  authenticate: () => Promise<VersioningActor | null>; id: () => string; now: () => string
  fault?: (stage: ModelFaultStage) => void | Promise<void>
}) {
  if (config.fixture_only !== true) throw new VersioningError('REFERENCE_MODEL_ONLY')
  let state: ModelState = structuredClone({ parcels: config.parcels, artifacts: [], versions: [],
    reports: config.legacyReports || [], reportIntents: [], audit: [] })
  const photos = structuredClone(config.photos || []), analyses = structuredClone(config.analyses || [])
  let tail: Promise<void> = Promise.resolve()
  const actor = async () => {
    const identity = await config.authenticate()
    if (!identity?.user_id || !identity.poktan_id) throw new VersioningError('AUTH_REQUIRED')
    return structuredClone(identity)
  }
  const parcelFor = (working: ModelState, parcelId: string, identity: VersioningActor, ownerOnly: boolean) => {
    const parcel = working.parcels.find((p) => p.id === parcelId)
    if (!parcel || (ownerOnly ? parcel.owner_id !== identity.user_id || parcel.poktan_id !== identity.poktan_id
      : parcel.owner_id !== identity.user_id && parcel.poktan_id !== identity.poktan_id)) throw new VersioningError('PARCEL_ACCESS_DENIED')
    return parcel
  }
  // One process-local FIFO + copy-on-commit. Deliberately does NOT emulate PG
  // locks/isolation/roles. SQL tests must separately prove those properties.
  const transaction = async <T,>(run: (working: ModelState) => T | Promise<T>): Promise<T> => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      const working = structuredClone(state)
      const result = await run(working)
      await config.fault?.('before_commit')
      state = working
      return structuredClone(result)
    } finally { release() }
  }
  const versionView = (working: ModelState, versionId: string) => {
    const version = working.versions.find((v) => v.id === versionId)
    if (!version) throw new VersioningError('VERSION_NOT_FOUND')
    const receipt = working.artifacts.find((r) => r.id === version.validation_receipt_id)!
    return { ...version, original_polygon: receipt.original_polygon, computed_area_m2: receipt.computed_area_m2,
      computed_area_hectares: receipt.computed_area_m2 / 10_000, declared_area_hectares: receipt.declared_area_hectares,
      reason: receipt.reason, validation_metadata: receipt.validation_metadata, review_status: 'UNVERIFIED' as const,
      ownership_verified: false }
  }
  return {
    purpose: 'UNIT_REFERENCE_NOT_DATABASE_PROOF' as const,
    inspect: () => structuredClone(state),
    version: (versionId: string) => structuredClone(versionView(state, versionId)),
    reportContext: (reportId: string) => {
      const row = state.reports.find((r) => r.id === reportId)
      if (!row) throw new VersioningError('REPORT_NOT_FOUND')
      return reportGeometryContext(row)
    },
    stageGeometry: async (input: unknown) => {
      const identity = await actor(), command = parseCommand(geometryCommandSchema, input)
      return transaction((working) => {
        const parcel = parcelFor(working, command.parcel_id, identity, true)
        const fingerprint = hash(command)
        const duplicate = working.artifacts.find((r) => r.actor_id === identity.user_id && r.command_id === command.command_id)
        if (duplicate) {
          if (duplicate.command_hash !== fingerprint) throw new VersioningError('COMMAND_REPLAY_CONFLICT')
          return duplicate.id
        }
        if (command.expected_version_id && !working.versions.some((v) =>
          v.id === command.expected_version_id && v.parcel_id === command.parcel_id)) throw new VersioningError('VERSION_PARCEL_MISMATCH')
        const assessment = assessLandGeometry(command.operation === 'BASELINE' ? parcel.polygon : command.polygon,
          command.operation === 'BASELINE' ? parcel.area_hectares : command.declared_area_hectares ?? parcel.area_hectares)
        if (!assessment.geometry.valid) throw new VersioningError(assessment.geometry.errors[0].code)
        if (assessment.declared_area_hectares === null || assessment.declared_area_hectares > 1000) throw new VersioningError('INVALID_DECLARED_AREA')
        const now = config.now(), id = config.id()
        working.artifacts.push({ id, actor_id: identity.user_id, parcel_id: parcel.id, command_id: command.command_id,
          command_hash: fingerprint, expected_version_id: command.expected_version_id,
          original_polygon: assessment.geometry.original_ring, computed_area_m2: assessment.computed_area_square_meters!,
          declared_area_hectares: assessment.declared_area_hectares, reason: command.reason,
          validation_metadata: { policy: structuredClone(GEOMETRY_POLICY), method: assessment.calculation_method },
          created_at: now, expires_at: new Date(Date.parse(now) + 300_000).toISOString(), operation: command.operation })
        return id
      })
    },
    advanceGeometry: async (receiptId: string) => {
      const identity = await actor()
      return transaction(async (working) => {
        const receipt = working.artifacts.find((r) => r.id === receiptId && r.actor_id === identity.user_id)
        if (!receipt) throw new VersioningError('VALIDATION_RECEIPT_REQUIRED')
        const parcel = parcelFor(working, receipt.parcel_id, identity, true)
        const replay = working.versions.find((v) => v.validation_receipt_id === receipt.id)
        if (replay) return { version: versionView(working, replay.id), replayed: true }
        if (Date.parse(receipt.expires_at) <= Date.parse(config.now())) throw new VersioningError('VALIDATION_RECEIPT_EXPIRED')
        const head = parcel.current_geometry_version_id ?? null
        if (head !== receipt.expected_version_id) throw new VersioningError('VERSION_CONFLICT')
        if (!head && (receipt.operation !== 'BASELINE' || hash(parcel.polygon) !== hash(receipt.original_polygon) ||
          parcel.area_hectares !== receipt.declared_area_hectares)) throw new VersioningError('BASELINE_SNAPSHOT_CONFLICT')
        if (head && receipt.operation !== 'CHANGE') throw new VersioningError('VERSION_CONFLICT')
        const previous = head ? working.versions.find((v) => v.id === head && v.parcel_id === parcel.id) : null
        if (head && !previous) throw new VersioningError('HEAD_INTEGRITY_ERROR')
        const version: GeometryVersion = { id: config.id(), parcel_id: parcel.id,
          version_number: previous ? previous.version_number + 1 : 1, previous_version_id: head,
          validation_receipt_id: receipt.id, actor_id: identity.user_id, created_at: config.now(),
          provenance: head ? 'EXPLICIT_BOUNDARY_CHANGE' : 'BASELINE_CAPTURED_NOT_HISTORICAL' }
        working.versions.push(version)
        await config.fault?.('after_version_insert')
        parcel.current_geometry_version_id = version.id
        parcel.polygon = structuredClone(receipt.original_polygon)
        parcel.area_hectares = receipt.declared_area_hectares
        await config.fault?.('after_head_advance')
        working.audit.push({ actor_id: identity.user_id, action: 'advance_lahan_geometry', entity_id: parcel.id, at: config.now() })
        return { version: versionView(working, version.id), replayed: false }
      })
    },
    stageReport: async (input: unknown) => {
      const identity = await actor(), command = parseCommand(reportCommandSchema, input)
      return transaction((working) => {
        parcelFor(working, command.parcel_id, identity, false)
        const fingerprint = hash(command)
        const existing = working.reportIntents.find((r) => r.id === command.command_id)
        if (existing) {
          if (existing.actor_id !== identity.user_id || existing.command_hash !== fingerprint) throw new VersioningError('COMMAND_REPLAY_CONFLICT')
          return existing.id
        }
        if (command.captured_geometry_version_id && !working.versions.some((v) =>
          v.id === command.captured_geometry_version_id && v.parcel_id === command.parcel_id)) throw new VersioningError('VERSION_PARCEL_MISMATCH')
        const hashes = command.photo_refs.map((ref) => {
          const photo = photos.find((p) => p.id === ref && p.user_id === identity.user_id)
          if (!photo || !photo.bytes.length || photo.bytes.length > 5 * 1024 * 1024 || !['image/jpeg','image/png'].includes(photo.mime)) throw new VersioningError('PHOTO_EVIDENCE_MISMATCH')
          return { hash: createHash('sha256').update(photo.bytes).digest('hex'), mime: photo.mime }
        })
        let ai: { id: string; status: string; confidence: number; damage_pct: number } | null = null
        if (command.evidence.mode === 'server_ai') {
          const analysisId = command.evidence.analysis_id
          const receipt = analyses.find((r) => r.id === analysisId && r.user_id === identity.user_id && r.photo_hash === hashes[0].hash)
          if (!receipt || !aiResultSchema.safeParse(receipt).success) throw new VersioningError('AI_RECEIPT_MISMATCH')
          ai = receipt
        }
        const manual = command.evidence.mode === 'manual' ? command.evidence.status : null
        // EXACT existing v1 submission-hash shape. Binding is checked separately.
        const submissionHash = hash({ lahan: command.parcel_id, latitude: command.latitude, longitude: command.longitude,
          photos: hashes.map((h) => h.hash), manual })
        const row: PocReport = { id: config.id(), user_id: identity.user_id, lahan_id: command.parcel_id,
          idempotency_key: command.idempotency_key, submission_hash: submissionHash,
          latitude: command.latitude, longitude: command.longitude, client_created_at: command.client_created_at,
          server_created_at: config.now(), photo_hash: hashes[0].hash,
          photo_paths: hashes.map((photo, i) => `${identity.user_id}/reports/${command.idempotency_key}/${i}_${photo.hash}.${photo.mime === 'image/png' ? 'png' : 'jpg'}`),
          geometry_version_id: command.captured_geometry_version_id,
          evidence_source: manual ? 'manual' : ai ? 'server_ai' : 'pending',
          ai_status: manual ?? ai?.status ?? null, manual_status: manual,
          ai_confidence: ai?.confidence ?? null, ai_damage_pct: ai?.damage_pct ?? null,
          ai_analysis_id: ai?.id ?? null, is_verified: false }
        const now = config.now()
        working.reportIntents.push({ id: command.command_id, actor_id: identity.user_id, command_hash: fingerprint,
          capture: command.captured_geometry_version_id, row, created_at: now,
          expires_at: new Date(Date.parse(now) + 300_000).toISOString() })
        return command.command_id
      })
    },
    commitReport: async (intentId: string) => {
      const identity = await actor()
      return transaction(async (working) => {
        const intent = working.reportIntents.find((r) => r.id === intentId && r.actor_id === identity.user_id)
        if (!intent) throw new VersioningError('REPORT_INTENT_REQUIRED')
        const existing = working.reports.find((r) => r.idempotency_key === intent.row.idempotency_key)
        if (existing) {
          const samePayload = existing.submission_hash ? existing.submission_hash === intent.row.submission_hash
            : existing.lahan_id === intent.row.lahan_id && existing.photo_hash === intent.row.photo_hash &&
              existing.latitude === intent.row.latitude && existing.longitude === intent.row.longitude && existing.photo_paths.length === intent.row.photo_paths.length
          if (existing.user_id !== identity.user_id || !samePayload) throw new VersioningError('IDEMPOTENCY_CONFLICT')
          if (intent.capture && existing.geometry_version_id !== intent.capture) throw new VersioningError('IDEMPOTENCY_GEOMETRY_CONFLICT')
          return { report: existing, context: reportGeometryContext(existing), replayed: true }
        }
        if (Date.parse(intent.expires_at) <= Date.parse(config.now())) throw new VersioningError('REPORT_INTENT_EXPIRED')
        const parcel = parcelFor(working, intent.row.lahan_id, identity, false)
        if (!intent.capture) throw new VersioningError('GEOMETRY_REFERENCE_REQUIRED')
        const snapshot = working.versions.find((v) => v.id === intent.capture)
        if (!snapshot || snapshot.parcel_id !== parcel.id) throw new VersioningError('VERSION_PARCEL_MISMATCH')
        if (parcel.current_geometry_version_id !== intent.capture) throw new VersioningError('GEOMETRY_VERSION_STALE')
        const version = versionView(working, intent.capture)
        const position = classifyPointInPolygon([intent.row.longitude, intent.row.latitude], version.original_polygon)
        if (position !== 'INSIDE' && position !== 'BOUNDARY') throw new VersioningError('REPORT_OUTSIDE_VERSION')
        const row = structuredClone(intent.row)
        row.server_created_at = config.now()
        working.reports.push(row)
        await config.fault?.('after_report_insert')
        working.audit.push({ actor_id: identity.user_id, action: 'submit_versioned_report', entity_id: row.id, at: config.now() })
        return { report: row, context: reportGeometryContext(row), replayed: false }
      })
    },
  }
}
