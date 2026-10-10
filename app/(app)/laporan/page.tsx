'use client'

import { FileText, Clock, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

const mockReports = [
  { id: '1', lahan: 'Sawah Budi Blok A', status: 'rusak_ringan', verified: true, date: '2026-01-15', synced: true },
  { id: '2', lahan: 'Sawah Budi Blok B', status: 'rusak_berat', verified: true, date: '2026-01-14', synced: true },
  { id: '3', lahan: 'Sawah Budi Blok A', status: 'aman', verified: false, date: '2026-01-10', synced: true },
  { id: '4', lahan: 'Sawah Bersama', status: 'rusak_ringan', verified: false, date: '2026-01-08', synced: false },
]

const statusConfig = {
  aman: { label: 'Aman', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rusak_ringan: { label: 'Rusak Ringan', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  rusak_berat: { label: 'Rusak Berat', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
}

export default function LaporanPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Saya</h1>
          <p className="text-gray-500 mt-1">Riwayat laporan kerusakan padi</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-5 h-5" aria-hidden="true" />
          Sync Ulang
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lahan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status AI</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mockReports.map((report) => {
                const config = statusConfig[report.status as keyof typeof statusConfig]
                const StatusIcon = config.icon
                return (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{report.lahan}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.color)}>
                        <StatusIcon className="w-3 h-3" aria-hidden="true" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {report.verified ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" aria-hidden="true" />
                          Tervalidasi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          Menunggu
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-600">{report.date}</td>
                    <td className="px-4 py-4">
                      {report.synced ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" aria-hidden="true" />
                          Tersinkron
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          Menunggu
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {mockReports.length === 0 && (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada laporan</h3>
            <p className="text-gray-500">Laporan Anda akan muncul di sini setelah scan atau input manual</p>
          </div>
        )}
      </div>
    </div>
  )
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}