'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sprout, CheckCircle2, AlertTriangle, AlertCircle, ChevronRight } from 'lucide-react'
import { listMyLahan, type LahanWithPolygon } from '@/app/(app)/lahan/actions'
import { listMyReports, type ReportItem, type AiStatus } from '@/app/(app)/laporan/actions'
import { AI_STATUS_INFO } from '@/lib/recommendations'

interface LahanCondition {
  id: string
  name: string
  area: number
  status: AiStatus | null
  damagePct: number | null
  health: number
}

function healthFromReport(status: AiStatus | null, damagePct: number | null): number {
  if (!status) return 100
  if (damagePct != null) return Math.max(0, Math.round(100 - damagePct))
  if (status === 'aman') return 100
  if (status === 'rusak_ringan') return 50
  return 20
}

function barClass(status: AiStatus | null): string {
  if (status === 'rusak_berat') return 'bg-[#D32F2F]'
  if (status === 'rusak_ringan') return 'bg-[#ED6C02]'
  if (status === 'aman') return 'bg-[#2E7D32]'
  return 'bg-gray-300'
}

export default function LahanSummary({ userId }: { userId: string }) {
  const [lahan, setLahan] = useState<LahanWithPolygon[]>([])
  const [conditions, setConditions] = useState<LahanCondition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!userId) return
      try {
        const [lahanRes, reportRes] = await Promise.all([listMyLahan(), listMyReports()])
        if (cancelled) return
        const lahanRows = lahanRes.data || []
        const reports: ReportItem[] = reportRes.data || []

        // Laporan terbaru per lahan (reports sudah urut server_created_at desc)
        const latest = new Map<string, ReportItem>()
        for (const r of reports) {
          const lid = r.lahan?.id
          if (lid && !latest.has(lid)) latest.set(lid, r)
        }

        const conds: LahanCondition[] = lahanRows.map((l) => {
          const rep = latest.get(l.id) || null
          const status = rep?.ai_status ?? null
          const damagePct = rep?.ai_damage_pct ?? null
          return {
            id: l.id,
            name: l.name,
            area: Number(l.area_hectares),
            status,
            damagePct,
            health: healthFromReport(status, damagePct),
          }
        })

        setLahan(lahanRows)
        setConditions(conds)
      } catch {
        if (!cancelled) {
          setLahan([])
          setConditions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const totalHa = conditions.reduce((sum, c) => sum + (isNaN(c.area) ? 0 : c.area), 0)
  const amanCount = conditions.filter((c) => c.status === 'aman').length
  const ringanCount = conditions.filter((c) => c.status === 'rusak_ringan').length
  const beratCount = conditions.filter((c) => c.status === 'rusak_berat').length

  const cards = [
    {
      label: 'Lahan Saya',
      value: `${totalHa.toFixed(1)} Ha`,
      sub: `${conditions.length} bidang`,
      icon: Sprout,
      iconBg: 'bg-green-100',
      iconColor: 'text-[#2E7D32]',
      valueColor: 'text-gray-900',
    },
    {
      label: 'Lahan Aman',
      value: String(amanCount),
      sub: 'bidang',
      icon: CheckCircle2,
      iconBg: 'bg-green-100',
      iconColor: 'text-[#2E7D32]',
      valueColor: 'text-[#2E7D32]',
    },
    {
      label: 'Perlu Perhatian',
      value: String(ringanCount),
      sub: 'bidang',
      icon: AlertTriangle,
      iconBg: 'bg-amber-100',
      iconColor: 'text-[#ED6C02]',
      valueColor: 'text-[#ED6C02]',
    },
    {
      label: 'Rusak Berat',
      value: String(beratCount),
      sub: 'bidang',
      icon: AlertCircle,
      iconBg: 'bg-red-100',
      iconColor: 'text-[#D32F2F]',
      valueColor: 'text-[#D32F2F]',
    },
  ]

  return (
    <div className="space-y-6">
      {/* 4 kartu ringkasan lahan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center mb-3`}>
              <c.icon size={20} className={c.iconColor} aria-hidden="true" />
            </div>
            <p className={`text-2xl font-bold ${c.valueColor}`}>
              {loading ? '—' : c.value}
            </p>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">{c.label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {loading ? '' : c.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Widget Kondisi Lahan */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Kondisi Lahan</h2>
          <Link
            href="/lahan"
            className="text-sm font-medium text-[#2E7D32] hover:underline inline-flex items-center gap-1"
          >
            Lihat Semua <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-2 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : conditions.length === 0 ? (
            <div className="text-center py-6">
              <Sprout className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-gray-500">Belum ada lahan terdaftar.</p>
              <Link
                href="/lahan"
                className="mt-3 inline-flex text-sm font-medium text-[#2E7D32] hover:underline"
              >
                Tambah Lahan
              </Link>
            </div>
          ) : (
            <ul className="space-y-5">
              {conditions.slice(0, 4).map((c) => {
                const info = c.status ? AI_STATUS_INFO[c.status] : null
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.area.toFixed(1)} Ha</p>
                      </div>
                      {info ? (
                        <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${info.badgeClass}`}>
                          {info.label}
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Belum ada laporan
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barClass(c.status)}`}
                          style={{ width: `${c.health}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600 w-9 text-right">
                        {c.health}%
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
