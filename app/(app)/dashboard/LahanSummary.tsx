'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sprout, AlertTriangle, AlertCircle, ChevronRight, Image } from 'lucide-react'
import { listMyLahan, type LahanWithPolygon } from '@/app/(app)/lahan/actions'
import { listMyReports, type ReportItem } from '@/app/(app)/laporan/actions'
import { formatHectares, registeredArea, uniqueRegisteredArea } from '@/lib/reports/area'
import { reportAdvisory, UNKNOWN_AFFECTED_AREA_LABEL } from '@/lib/reports/advisory'
import AdvisoryAssessment from '@/components/features/AdvisoryAssessment'

export default function LahanSummary({ userId }: { userId: string }) {
  const [lahan, setLahan] = useState<LahanWithPolygon[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLahan([]); setReports([]); setError(null)
    const load = async () => {
      try {
        const [fields, evidence] = await Promise.all([listMyLahan(userId), listMyReports()])
        if (cancelled) return
        if (fields.error || evidence.error) throw new Error('Ringkasan lahan/laporan belum dapat dimuat. Kondisi belum dapat disimpulkan.')
        setLahan(fields.data || []); setReports(evidence.data || [])
      } catch {
        if (!cancelled) setError('Ringkasan lahan/laporan belum dapat dimuat. Kondisi belum dapat disimpulkan.')
      } finally { if (!cancelled) setLoading(false) }
    }
    if (userId) void load()
    else setLoading(false)
    return () => { cancelled = true }
  }, [userId])

  const conditions = useMemo(() => {
    const latest = new Map<string, ReportItem>()
    for (const report of reports) {
      const id = report.lahan_id ?? report.lahan?.id
      if (id && !latest.has(id)) latest.set(id, report)
    }
    return lahan.map((field) => ({ ...field, report: latest.get(field.id) ?? null }))
  }, [lahan, reports])
  const area = uniqueRegisteredArea(lahan.map((field) => ({ parcel_id: field.id, registered_area_hectares: field.area_hectares })), 'lahan saya yang berhasil dimuat')
  const cards = [
    { label: 'Luas Terdaftar Unik', value: formatHectares(area.hectares), sub: `${area.unique_parcel_count} ID lahan`, icon: Sprout },
    { label: 'Tidak Tampak Kerusakan pada Foto', value: String(conditions.filter((c) => c.report?.ai_status === 'aman').length), sub: 'laporan terbaru per bidang, bukan jaminan sehat', icon: Image },
    { label: 'Indikasi Ringan pada Laporan', value: String(conditions.filter((c) => c.report?.ai_status === 'rusak_ringan').length), sub: 'penilaian awal perlu verifikasi', icon: AlertTriangle },
    { label: 'Indikasi Berat pada Laporan', value: String(conditions.filter((c) => c.report?.ai_status === 'rusak_berat').length), sub: 'penilaian awal perlu verifikasi', icon: AlertCircle },
  ]
  return <div className="space-y-6">
    {error && <p className="p-3 rounded-lg border bg-slate-50 text-slate-700 text-sm" role="alert">{error}</p>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <card.icon size={22} className="text-slate-600 mb-3" aria-hidden="true" />
        <p className="text-xl font-bold text-slate-900">{loading || error ? '—' : card.value}</p>
        <p className="text-xs text-slate-600 mt-1">{card.label}</p>
        <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
      </div>)}
    </div>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Penilaian pada Laporan Terbaru</h2>
        <Link href="/lahan" className="text-sm text-green-800 inline-flex gap-1 items-center">Lihat Lahan <ChevronRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        {loading ? <p role="status">Memuat ringkasan…</p> : error ? <p className="text-sm text-slate-600">Penilaian belum tersedia.</p>
          : conditions.length === 0 ? <p className="text-sm text-slate-600">Belum ada lahan terdaftar yang dimuat.</p>
          : <ul className="space-y-5">{conditions.slice(0, 4).map((field) => <li key={field.id}>
            <p className="font-medium text-sm">{field.name}</p>
            <p className="text-xs text-slate-600 mb-2">Luas terdaftar: {formatHectares(registeredArea(field.area_hectares))}</p>
            {field.report ? <AdvisoryAssessment assessment={reportAdvisory(field.report)} compact />
              : <p className="text-xs text-slate-600">Belum ada laporan termuat; kondisi belum dinilai.</p>}
          </li>)}</ul>}
        <p className="text-xs text-slate-600">{UNKNOWN_AFFECTED_AREA_LABEL}. Ringkasan foto/laporan tidak mengukur persentase kesehatan atau kondisi seluruh bidang.</p>
      </div>
    </div>
  </div>
}
