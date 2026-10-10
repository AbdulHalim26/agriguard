'use client'

import Link from 'next/link'
import { Camera, MapPin, FileText, Plus } from 'lucide-react'
import FloodStatusCard from '@/components/features/FloodStatusCard'
import SyncWidget from '@/components/features/SyncWidget'
import { getFloodStatus } from '@/app/(app)/dashboard/flood-actions'

interface DashboardContentProps {
  userName: string
  userId: string
  demoMode: boolean
}

export default function DashboardContent({ userName, userId, demoMode }: DashboardContentProps) {
  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Selamat datang, {userName}!</h1>
          <p className="text-gray-500 mt-1">Pantau kondisi sawah Anda secara real-time</p>
        </div>
      </div>

      {/* Widget antrian offline (FR-03) */}
      <SyncWidget userId={userId} />

      {/* Flood Status Card - FR-01 */}
      <FloodStatusCard />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/scan"
          className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:border-green-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
            <Camera size={24} className="text-green-600" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Scan Tanaman</h3>
          <p className="text-sm text-gray-500">Foto & analisis kerusakan padi dengan AI</p>
        </Link>

        <Link
          href="/lahan"
          className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:border-green-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
            <MapPin size={24} className="text-blue-600" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Lahan Saya</h3>
          <p className="text-sm text-gray-500">Kelola data lahan & polygon sawah</p>
        </Link>

        <Link
          href="/laporan"
          className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:border-green-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
            <FileText size={24} className="text-purple-600" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Laporan Saya</h3>
          <p className="text-sm text-gray-500">Riwayat laporan kerusakan & status sync</p>
        </Link>

        <Link
          href="/peta"
          className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:border-green-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-200 transition-colors">
            <Plus size={24} className="text-orange-600" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Peta & Laporan Baru</h3>
          <p className="text-sm text-gray-500">Lihat peta lahan & buat laporan offline</p>
        </Link>
      </div>

      {/* Info banner: hanya saat OTP_MODE=mock (read dari server, dikirim sebagai prop) */}
      {demoMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 text-sm font-bold">i</span>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-1">Mode Demo</h4>
              <p className="text-blue-700 text-sm">
                Aplikasi berjalan dalam mode demo dengan data simulasi. Data cuaca menggunakan fallback mock
                jika API key tidak dikonfigurasi. Login dengan OTP: <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono">123456</code>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}