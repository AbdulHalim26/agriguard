import { assessLandGeometry, GEOMETRY_POLICY } from './geometry'

export const INVENTORY_POLICY = { version: 'land-inventory-v1', absolute_difference_ha: 0.01, relative_difference: 0.20 } as const
export type InventoryStatus = 'INVALID_GEOMETRY' | 'VALID_GEOMETRY' | 'AREA_DISCREPANCY_REVIEW' | 'INSUFFICIENT_DATA'
const reference = (value: unknown) => typeof value === 'string' && value.trim() ? value : null
export function polygonFormat(value: unknown): string {
  if (value === undefined || value === null) return 'MISSING'
  if (Array.isArray(value)) return value.length === 0 || (Array.isArray(value[0]) && !Array.isArray(value[0][0])) ? 'LNG_LAT_RING' : 'UNSUPPORTED_ARRAY'
  if (typeof value === 'object') return `UNSUPPORTED_${String((value as { type?: unknown }).type || 'OBJECT').slice(0, 40)}`
  return typeof value === 'string' ? 'UNSUPPORTED_STRING' : 'UNSUPPORTED_VALUE'
}

export function inventoryParcels(records: readonly unknown[]) {
  const counts: Record<InventoryStatus, number> = { INVALID_GEOMETRY: 0, VALID_GEOMETRY: 0, AREA_DISCREPANCY_REVIEW: 0, INSUFFICIENT_DATA: 0 }
  const parcels = records.map((input, index) => {
    const row = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
    const assessment = assessLandGeometry(row.polygon, row.area_hectares)
    const missingGeometry = row.polygon === undefined || row.polygon === null
    const missingRefs = !reference(row.id) || !reference(row.owner_id) || !reference(row.poktan_id)
    let status: InventoryStatus
    if (missingGeometry) status = 'INSUFFICIENT_DATA'
    else if (!assessment.geometry.valid) status = 'INVALID_GEOMETRY'
    else if (assessment.declared_area_hectares === null || missingRefs) status = 'INSUFFICIENT_DATA'
    else if (Math.abs(assessment.area_difference_hectares!) > INVENTORY_POLICY.absolute_difference_ha &&
        Math.abs(assessment.area_difference_hectares!) > INVENTORY_POLICY.relative_difference * assessment.declared_area_hectares) status = 'AREA_DISCREPANCY_REVIEW'
    else status = 'VALID_GEOMETRY'
    counts[status]++
    return { input_record_index: index, parcel_id: reference(row.id), owner_ref: reference(row.owner_id), poktan_ref: reference(row.poktan_id),
      polygon_format: polygonFormat(row.polygon), vertex_count: assessment.geometry.diagnostics.input_vertex_count,
      distinct_vertex_count: assessment.geometry.diagnostics.distinct_vertex_count,
      geometry_status: missingGeometry ? 'INSUFFICIENT_DATA' : assessment.geometry.valid ? 'VALID_GEOMETRY' : 'INVALID_GEOMETRY',
      inventory_status: status, geometry_errors: assessment.geometry.errors,
      diagnostics: assessment.geometry.diagnostics,
      declared_area_hectares: assessment.declared_area_hectares,
      computed_area_square_meters: assessment.computed_area_square_meters, computed_area_hectares: assessment.computed_area_hectares,
      area_difference_hectares: assessment.area_difference_hectares, relative_difference: assessment.relative_difference,
      relative_difference_unavailable_reason: assessment.relative_difference_unavailable_reason,
      calculation_method: assessment.calculation_method, verification_status: assessment.verification_status,
      concerns: [
        ...(missingRefs ? ['MISSING_PARCEL_OWNER_OR_POKTAN_REFERENCE'] : []),
        ...(assessment.declared_area_hectares === null ? ['DECLARED_AREA_UNAVAILABLE_OR_INVALID'] : []),
        ...(assessment.relative_difference_unavailable_reason === 'NUMERIC_RANGE' ? ['RELATIVE_DIFFERENCE_NOT_REPRESENTABLE'] : []),
        ...(status === 'AREA_DISCREPANCY_REVIEW' ? ['DECLARED_COMPUTED_DIFFERENCE_REQUIRES_REVIEW_NOT_FRAUD'] : []),
        ...assessment.geometry.errors.map((error) => error.code),
      ], ownership_verified: false, claim_authorized: false }
  })
  return { schema_version: 'land-inventory-v1', policy: INVENTORY_POLICY, geometry_policy: GEOMETRY_POLICY,
    summary: { total_parcels: parcels.length, counts }, parcels }
}

// Narrow parser for the repository's demo INSERT literals ONLY. Never execute SQL,
// inspect Auth/credentials or guess a changed schema. Unknown lahan inserts fail.
export function parcelsFromRepositorySeed(sql: string) {
  const literal = "'((?:[^']|'')*)'"
  const statement = new RegExp('insert\\s+into\\s+(?:public\\.)?lahan\\s*\\(\\s*id\\s*,\\s*poktan_id\\s*,\\s*owner_id\\s*,\\s*name\\s*,\\s*area_hectares\\s*,\\s*polygon\\s*\\)\\s*values\\s*\\(\\s*' +
    literal + '\\s*,\\s*' + literal + '\\s*,\\s*' + literal + '\\s*,\\s*' + literal +
    '\\s*,\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))\\s*,\\s*' + literal + '\\s*::jsonb\\s*\\)\\s*;', 'gi')
  const matches = [...sql.matchAll(statement)]
  const insertCount = [...sql.matchAll(/\binsert\s+into\s+(?:public\.)?lahan\b/gi)].length
  if (!matches.length || matches.length !== insertCount) throw new Error('SEED_FORMAT_UNSUPPORTED')
  return matches.map((match) => ({ id: match[1], poktan_id: match[2], owner_id: match[3],
    area_hectares: Number(match[5]), polygon: JSON.parse(match[6].replaceAll("''", "'")) as unknown }))
}
