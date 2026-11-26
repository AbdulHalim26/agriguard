export const VERIFICATION_REPORT_LIMIT = 200
export interface ReportReadScope {
  loaded_count: number
  visible_count: number | null
  limit: number
  completeness: 'COMPLETE' | 'TRUNCATED' | 'UNKNOWN'
  loaded_at: string
}

export function reportReadScope(loaded: number, count: unknown, loadedAt: string): ReportReadScope {
  const visible = typeof count === 'number' && Number.isSafeInteger(count) && count >= loaded ? count : null
  return { loaded_count: loaded, visible_count: visible, limit: VERIFICATION_REPORT_LIMIT,
    completeness: visible === null ? 'UNKNOWN' : visible > loaded ? 'TRUNCATED' : 'COMPLETE', loaded_at: loadedAt }
}

function wibDayStart(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const utc = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null
  return Date.parse(`${value}T00:00:00+07:00`)
}

export function verifiedReportScope<T extends { is_verified: boolean; district: string | null; server_created_at: string }>(
  reports: readonly T[], filters: { from: string; to: string; region: string }
) {
  const start = filters.from ? wibDayStart(filters.from) : null
  const end = filters.to ? wibDayStart(filters.to) : null
  const scope = `laporan terverifikasi dalam data termuat; wilayah ${filters.region === 'all' ? 'semua yang dapat diakses' : filters.region}; ` +
    `tanggal server WIB ${filters.from || 'tanpa batas awal'} s.d. ${filters.to || 'tanpa batas akhir'}`
  if ((filters.from && start === null) || (filters.to && end === null) || (start !== null && end !== null && start > end)) {
    return { rows: [] as T[], scope, error: 'Rentang tanggal tidak valid. Gunakan tanggal awal sampai akhir dalam WIB.', invalid_timestamp_count: 0 }
  }
  let invalidTimes = 0
  const rows = reports.filter((report) => {
    if (report.is_verified !== true || (filters.region !== 'all' && report.district !== filters.region)) return false
    if (start === null && end === null) return true
    const at = Date.parse(report.server_created_at)
    if (!Number.isFinite(at)) { invalidTimes++; return false }
    return (start === null || at >= start) && (end === null || at < end + 86_400_000)
  })
  return { rows, scope, error: null, invalid_timestamp_count: invalidTimes }
}
