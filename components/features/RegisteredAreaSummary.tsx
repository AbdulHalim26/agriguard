import { formatHectares, type uniqueRegisteredArea } from '@/lib/reports/area'

export default function RegisteredAreaSummary({ summary }: { summary: ReturnType<typeof uniqueRegisteredArea> }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2" data-area-kind={summary.kind}>
    <p className="font-semibold text-slate-800">Luas Terdaftar Unik dalam Cakupan Data</p>
    <p className="text-lg font-bold text-slate-800">{formatHectares(summary.hectares)}</p>
    <p className="text-slate-600">Cakupan: {summary.scope}. {summary.unique_parcel_count} ID lahan unik; setiap ID dihitung paling banyak sekali.</p>
    {(summary.status === 'PARTIAL' || summary.status === 'UNKNOWN') && <p className="text-amber-900">
      Total belum lengkap. Subtotal nilai yang konsisten: {formatHectares(summary.known_subtotal_hectares)};
      {' '}{summary.unknown_parcel_ids.length} lahan belum mempunyai luas yang konsisten dan {summary.unidentified_report_count} baris tanpa ID lahan.
    </p>}
    <p className="text-slate-700">Nilai berasal dari pendaftaran, bukan hasil survei batas atau bukti keunikan fisik/legal antar-ID.</p>
    <p className="font-semibold text-slate-800" data-affected-area-status={summary.measured_affected_area.status}>{summary.measured_affected_area.label}.</p>
    <p className="text-slate-600">Luas terdaftar tidak dianggap luas rusak. Banyak laporan atau hasil AI tidak menjadi pengukuran luas terdampak.</p>
  </div>
}
