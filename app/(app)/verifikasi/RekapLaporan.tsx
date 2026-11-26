'use client'

import { useEffect, useMemo, useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import { listVerificationReports, type VerificationReport } from './verification-actions'
import { verifiedReportScope, type ReportReadScope } from '@/lib/reports/reporting'
import AutpSupportingReport from '@/components/features/AutpSupportingReport'

export default function RekapLaporan() {
  const [reports, setReports] = useState<VerificationReport[]>([])
  const [readScope, setReadScope] = useState<ReportReadScope | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [region, setRegion] = useState('all')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const load = async () => {
    setLoading(true); setError(null); setReports([]); setReadScope(null)
    try {
      const result = await listVerificationReports()
      if (result.error) throw new Error('Data rekap belum dapat dimuat. Coba lagi saat online.')
      setReports(result.data || []); setReadScope(result.scope ?? null)
      setGeneratedAt(new Date().toISOString())
    } catch { setError('Data rekap belum dapat dimuat. Coba lagi saat online; dokumen belum siap dicetak.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const selected = useMemo(() => verifiedReportScope(reports, { from, to, region }), [reports, from, to, region])
  const regions = [...new Set(reports.filter((r) => r.is_verified && r.district).map((r) => r.district!))].sort()
  const canPrint = !loading && !error && !selected.error && selected.rows.length > 0 && Boolean(generatedAt)
  return <div className="space-y-4">
    <div className="print:hidden bg-white border rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">Rekap Pendukung AUTP — Filter Data Termuat</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <label>Dari tanggal server (WIB)<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block w-full min-h-[48px] border rounded px-2 mt-1" /></label>
        <label>Sampai tanggal server (WIB)<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block w-full min-h-[48px] border rounded px-2 mt-1" /></label>
        <label className="col-span-2 sm:col-span-1">Wilayah (kecamatan)<select value={region} onChange={(e) => setRegion(e.target.value)} className="block w-full min-h-[48px] border rounded px-2 mt-1">
          <option value="all">Semua wilayah termuat</option>{regions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={loading} onClick={() => void load()} className="min-h-[48px] px-4 py-2 border rounded-lg inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw size={16} aria-hidden="true" />Muat Ulang</button>
        <button type="button" disabled={!canPrint} onClick={() => { if (canPrint) window.print() }} className="min-h-[48px] px-4 py-2 bg-green-700 text-white rounded-lg inline-flex gap-2 items-center disabled:opacity-50"><Printer size={16} aria-hidden="true" />Cetak / Simpan PDF</button>
      </div>
    </div>
    {loading ? <p role="status" className="p-5 border rounded-lg bg-slate-50">Memuat data rekap; dokumen belum siap dicetak.</p>
      : error || selected.error ? <p role="alert" className="p-4 border rounded-lg text-slate-800">{error || selected.error}</p>
        : selected.rows.length === 0 ? <p className="p-5 border rounded-lg text-slate-700">Belum ada laporan terverifikasi dalam data termuat/filter ini. Ini bukan bukti tidak ada kerusakan atau klaim.</p>
          : generatedAt && <AutpSupportingReport reports={selected.rows} scopeLabel={selected.scope} readScope={readScope}
            generatedAt={generatedAt} invalidTimeCount={selected.invalid_timestamp_count} />}
  </div>
}
