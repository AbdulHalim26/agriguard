'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AutoSync from '@/components/AutoSync'
import OfflineBanner from '@/components/features/OfflineBanner'
import {
  LayoutDashboard,
  MapPin,
  Camera,
  FileText,
  Map,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronDown,
  User,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Lahan Saya', href: '/lahan', icon: MapPin },
  { name: 'Scan Tanaman', href: '/scan', icon: Camera },
  { name: 'Laporan Saya', href: '/laporan', icon: FileText },
  { name: 'Peta', href: '/peta', icon: Map },
]

const adminNavigation = [
  { name: 'Verifikasi', href: '/verifikasi', icon: ShieldCheck },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userRole, setUserRole] = useState<'petani' | 'ppl' | 'dinas' | null>(null)
  const [userName, setUserName] = useState('')

  // Fetch user role on mount
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single()
        if (profile) {
          setUserName(profile.full_name)
          setUserRole(profile.role)
        }
      }
    }
    fetchUser()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isAdminRoute = pathname.startsWith('/verifikasi')
  const showAdminNav = userRole === 'ppl' || userRole === 'dinas'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigasi utama"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AG</span>
              </div>
              <span className="font-semibold text-gray-900">AgriGuard</span>
            </Link>
            <button
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
            >
              <X size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Menu navigasi">
            {navigation.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon size={20} aria-hidden="true" />
                  {item.name}
                </Link>
              )
            })}

            {showAdminNav && (
              <>
                <div className="pt-4 mt-2 border-t border-gray-200">
                  <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Admin
                  </h3>
                  {adminNavigation.map(item => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-green-50 text-green-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <item.icon size={20} aria-hidden="true" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </nav>

          {/* User menu */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <User size={16} className="text-green-600" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{userName || 'Petani'}</p>
                <p className="text-xs text-gray-500 capitalize">{userRole || 'petani'}</p>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut size={20} aria-hidden="true" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Server actions offline sync (berjalan sekali, global) */}
      <AutoSync />

      {/* Banner mode offline (navigator.onLine false ATAU request gagal) */}
      <OfflineBanner />

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              className="p-2 text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
            >
              <Menu size={24} />
            </button>
            <span className="font-semibold text-gray-900">AgriGuard</span>
            <div className="w-10" />
          </div>
        </header>

        <main className="pt-4 lg:pt-0">{children}</main>
      </div>
    </div>
  )
}