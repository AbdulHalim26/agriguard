import { UNKNOWN_AFFECTED_AREA_LABEL } from './advisory'

export function registeredArea(value: unknown): number | null {
  const n = typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : value
  // Existing land-registration bounds; absence/invalid/zero is NOT a known area.
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1000 ? n : null
}

export function formatHectares(value: number | null): string {
  return value === null || !Number.isFinite(value) || value < 0 ? 'Belum diketahui'
    : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(value)} ha`
}

export interface AreaReference { parcel_id: unknown; registered_area_hectares: unknown }
export function uniqueRegisteredArea(rows: readonly AreaReference[], scope: string) {
  const parcels = new Map<string, { values: Set<number>; unknown: boolean }>()
  let unidentifiedReports = 0
  for (const row of rows) {
    if (typeof row.parcel_id !== 'string' || !row.parcel_id.trim()) { unidentifiedReports++; continue }
    const id = row.parcel_id.trim()
    const parcel = parcels.get(id) ?? { values: new Set<number>(), unknown: false }
    const area = registeredArea(row.registered_area_hectares)
    if (area === null) parcel.unknown = true
    else parcel.values.add(area)
    parcels.set(id, parcel)
  }
  let knownSubtotal = 0, countedParcels = 0
  const unknownParcelIds: string[] = [], conflictingParcelIds: string[] = []
  for (const [id, parcel] of parcels) {
    if (parcel.values.size > 1) conflictingParcelIds.push(id)
    if (parcel.unknown || parcel.values.size !== 1) unknownParcelIds.push(id)
    else { knownSubtotal += [...parcel.values][0]; countedParcels++ }
  }
  const complete = unknownParcelIds.length === 0 && unidentifiedReports === 0 && Number.isFinite(knownSubtotal)
  return {
    kind: 'UNIQUE_REGISTERED_FIELD_AREA' as const, scope,
    status: rows.length === 0 ? 'EMPTY' as const : complete ? 'KNOWN' as const : countedParcels ? 'PARTIAL' as const : 'UNKNOWN' as const,
    hectares: complete ? knownSubtotal : null,
    known_subtotal_hectares: Number.isFinite(knownSubtotal) ? knownSubtotal : null,
    unique_parcel_count: parcels.size, counted_parcel_count: countedParcels,
    unidentified_report_count: unidentifiedReports,
    unknown_parcel_ids: unknownParcelIds.sort(), conflicting_parcel_ids: conflictingParcelIds.sort(),
    measurement_basis: 'REGISTERED_VALUE_NOT_A_SURVEY' as const,
    physical_or_legal_uniqueness_verified: false,
    // No field measurement record exists in the current schema. Report approval,
    // confidence, image coverage and even plausible client fields cannot fill it.
    measured_affected_area: { status: 'UNKNOWN_AFFECTED_AREA' as const, hectares: null, label: UNKNOWN_AFFECTED_AREA_LABEL },
  }
}
