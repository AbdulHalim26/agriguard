import type { VerificationReport } from '@/app/(app)/verifikasi/verification-actions'
import type { ReportReadScope } from '@/lib/reports/reporting'
import { formatHectares, registeredArea, uniqueRegisteredArea } from '@/lib/reports/area'
import { INSURANCE_NOTICE, reportAdvisory, reportVerification, UNKNOWN_AFFECTED_AREA_LABEL } from '@/lib/reports/advisory'
import { formatWib } from '@/lib/ews/data'
import AdvisoryAssessment from './AdvisoryAssessment'
import RegisteredAreaSummary from './RegisteredAreaSummary'

export default function AutpSupportingReport({ reports, scopeLabel, readScope, generatedAt, invalidTimeCount = 0 }: {
  reports: readonly VerificationReport[]; scopeLabel: string; readScope: ReportReadScope | null
  generatedAt: string; invalidTimeCount?: number
}) {
  // Defense in depth for callers other than the existing filtered rekap page.
  const rows = reports.filter((report) => report.is_verified === true)
  const area = uniqueRegisteredArea(rows.map((r) => ({ parcel_id: r.lahan_id, registered_area_hectares: r.lahan_area_hectares })), scopeLabel)
  const grouped = new Map<string, VerificationReport[]>()
  for (const report of rows) {
    const group = report.district || report.village || 'Wilayah belum tercatat'
    grouped.set(group, [...(grouped.get(group) || []), report])
  }
  return <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 print:border-0 print:p-0 space-y-5" aria-label="Dokumen pendukung internal AUTP">
    <header className="space-y-2">
      <h2 className="text-lg font-bold text-slate-900">Ringkasan Laporan Terverifikasi — Dokumen Pendukung AUTP (Internal)</h2>
      <p className="text-sm text-slate-700">{INSURANCE_NOTICE} Dokumen ini tidak menyatakan persetujuan atau integrasi resmi Jasindo.</p>
      <p className="text-xs text-slate-600">Disusun di perangkat: {formatWib(generatedAt)}. Data dibaca server: {formatWib(readScope?.loaded_at)}.</p>
      <p className="text-xs text-slate-700">Cakupan: {scopeLabel}. Filter tanggal mengikuti waktu server dalam WIB, bukan periode pertanggungan.</p>
      <p className="text-xs text-slate-700">Sumber dibatasi maksimal {readScope?.limit ?? 200} laporan terbaru yang dapat diakses, lalu difilter untuk rekap ini.
        {' '}Termuat: {readScope?.loaded_count ?? 'belum diketahui'}; total terlihat sebelum filter rekap: {readScope?.visible_count ?? 'belum diketahui'}.</p>
      {(!readScope || readScope.completeness !== 'COMPLETE') && <p className="text-sm font-semibold text-amber-900">
        Data termuat belum dapat dinyatakan lengkap untuk seluruh riwayat. Ringkasan/luas hanya berlaku pada data yang dimuat ini.
      </p>}
      {invalidTimeCount > 0 && <p className="text-xs text-amber-900">{invalidTimeCount} laporan dengan waktu tidak valid tidak dapat dicocokkan pada filter tanggal.</p>}
    </header>
    <RegisteredAreaSummary summary={area} />
    <div className="p-3 border border-slate-300 rounded-lg text-sm text-slate-800 space-y-1">
      <p>AI belum terkalibrasi untuk persentase kerusakan/kehilangan hasil atau hektar rusak. REVIEW_REQUIRED tetap berlaku untuk interpretasi AI meskipun laporan telah diverifikasi.</p>
      <p>{UNKNOWN_AFFECTED_AREA_LABEL}. Skema saat ini tidak menyediakan catatan pengukuran luas terdampak independen yang tervalidasi.</p>
      <p>Kelengkapan bukti, batas bidang, musim/kejadian, otorisasi lahan dan persyaratan polis AUTP yang berlaku masih memerlukan peninjauan. Referensi foto bukan bukti bahwa berkas/isi foto telah diperiksa ulang.</p>
    </div>
    {[...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([region, entries]) => <section key={region} className="space-y-3">
      <h3 className="font-semibold text-slate-800">{region} · {entries.length} laporan dalam cakupan data</h3>
      {entries.map((report) => <article key={report.id} className="border border-gray-200 rounded-lg p-3 text-sm space-y-3 break-inside-avoid">
        <div className="grid sm:grid-cols-2 gap-2">
          <div><p className="font-medium">ID Laporan</p><p className="font-mono text-xs break-all">{report.id}</p></div>
          <div><p className="font-medium">ID Lahan Terdaftar</p><p className="font-mono text-xs break-all">{report.lahan_id || 'Belum tersedia — tidak dideduplikasi dari nama'}</p></div>
          <p>Pelapor: {report.owner_name || 'Belum tercatat'} · ID {report.reporter_id || 'belum tersedia'}</p><p>Lahan: {report.lahan_name || 'Belum tercatat'} · {report.poktan_name || 'Poktan belum tercatat'}</p>
          <p>Luas terdaftar pada data lahan saat dibaca: {formatHectares(registeredArea(report.lahan_area_hectares))}. Nilai berulang antar-laporan bukan untuk dijumlahkan.</p>
          <p className="font-medium">{UNKNOWN_AFFECTED_AREA_LABEL}.</p>
        </div>
        <AdvisoryAssessment assessment={reportAdvisory(report)} />
        <div className="text-xs text-slate-700 space-y-1">
          <p className="font-semibold">{reportVerification(report).label} — bukan persetujuan klaim.</p>
          <p>Peninjau tercatat: {report.verifier_name || 'Belum tercatat'} · ID {report.verifier_id || 'belum tersedia'} · Waktu verifikasi: {formatWib(report.verified_at)}</p>
          <p>Catatan PPL/Dinas: {report.verification_note || 'Tidak ada catatan tercatat'}</p>
          <p>Waktu server: {formatWib(report.server_created_at)} · Waktu client (metadata): {formatWib(report.client_created_at)}</p>
          <p>Koordinat laporan: {Number.isFinite(report.latitude) ? report.latitude : 'Belum diketahui'}, {Number.isFinite(report.longitude) ? report.longitude : 'Belum diketahui'}</p>
          <p>ID receipt AI: {report.ai_analysis_id || 'Belum tersedia / bukan receipt AI'}</p>
          <p className="break-all">SHA-256 foto pertama (tercatat): {report.photo_hash || 'Belum tersedia'}</p>
          <p>Referensi foto privat (memerlukan akses berwenang):</p>
          {report.photo_paths?.length ? <ul className="list-disc pl-5 break-all">{report.photo_paths.map((path, i) => <li key={`${i}-${path}`}>{path}</li>)}</ul>
            : <p className="font-semibold">Referensi foto belum tersedia; bukti belum lengkap.</p>}
          {(!report.verified_at || !report.verifier_name || !report.photo_hash) && <p className="font-semibold">Sebagian metadata waktu/peninjau/hash belum tersedia. Lengkapi penelusuran bukti sebelum penyiapan dokumen lebih lanjut.</p>}
        </div>
      </article>)}
    </section>)}
    <footer className="text-xs text-slate-700 border-t pt-3 space-y-1">
      <p>{rows.length} laporan terverifikasi; {area.unique_parcel_count} ID lahan unik dalam cakupan data. Subkelompok wilayah tidak dijumlahkan untuk menghitung luas global.</p>
      <p>Nilai legacy dan sumber asli dipertahankan pada laporan/receipt. Ringkasan ini tidak mengubah audit trail, hak lahan, kelayakan, atau keputusan penanggung.</p>
      <p>Luas berasal dari data pendaftaran saat dibaca; belum ada snapshot luas/batas terverifikasi pada waktu kejadian.</p>
    </footer>
  </section>
}
