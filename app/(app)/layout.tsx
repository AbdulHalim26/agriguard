'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandLogo from '@/components/brand/BrandLogo'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import AutoSync from '@/components/AutoSync'
import OfflineBanner from '@/components/features/OfflineBanner'
import PendingReportsBadge from '@/components/features/PendingReportsBadge'
import {
  LayoutDashboard,
  MapPin,
  Camera,
  FileText,
  Map,
  ShieldCheck,
  History,
  LogOut,
  Menu,
  X,
  ChevronDown,
  User,
  Bell,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Lahan Saya', href: '/lahan', icon: MapPin },
  { name: 'Scan Tanaman', href: '/scan', icon: Camera },
  { name: 'Laporan Saya', href: '/laporan', icon: FileText },
  { name: 'Peta', href: '/peta', icon: Map },
  { name: 'Notifikasi', href: '/notifikasi', icon: Bell },
]

const adminNavigation = [
  { name: 'Verifikasi', href: '/verifikasi', icon: ShieldCheck },
  { name: 'Audit Trail', href: '/audit', icon: History },
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
  const [poktanName, setPoktanName] = useState('')
  const [online, setOnline] = useState(true)

  // Tutup drawer mobile setiap kali rute berubah
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Status koneksi (badge Online/Offline)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // Fetch user role + nama poktan
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role, poktan_id')
          .eq('id', user.id)
          .single()
        if (profile) {
          setUserName(profile.full_name)
          setUserRole(profile.role)
          if (profile.poktan_id) {
            const { data: poktan } = await supabase
              .from('poktan')
              .select('name')
              .eq('id', profile.poktan_id)
              .single()
            if (poktan?.name) setPoktanName(poktan.name)
          }
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

  const showAdminNav = userRole === 'ppl' || userRole === 'dinas'
  const roleLabel = userRole === 'ppl' ? 'Petugas PPL' : userRole === 'dinas' ? 'Dinas Pertanian' : 'Petani'
  const initials = (userName || 'P').trim().charAt(0).toUpperCase()

  const activeClass = 'bg-white/15 text-white border-l-4 border-white'
  const idleClass = 'text-white/80 hover:bg-white/10 hover:text-white border-l-4 border-transparent'

  const renderNavItem = (item: (typeof navigation)[number]) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center gap-3 pl-3 pr-3 py-2.5 min-h-[48px] rounded-r-lg text-sm font-medium transition-colors ${
          isActive ? activeClass : idleClass
        }`}
        aria-current={isActive ? 'page' : undefined}
      >
        <item.icon size={20} aria-hidden="true" />
        {item.name}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-72 overflow-hidden bg-gradient-to-b from-[#2E7D32] via-[#2E7D32] to-[#1B5E20] shadow-xl transform transition-transform duration-200 lg:translate-x-0 print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigasi utama"
      >
        {/* Ilustrasi full-bleed di dasar sidebar — mask fade ke atas agar
            menyatu dengan warna sidebar (tanpa kartu/rounded/margin). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ilustrations/sidebar.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 w-full h-auto select-none"
          style={{
            WebkitMaskImage:
              'linear-gradient(to top, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to top, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Brand */}
          <div className="px-5 pt-6 pb-4 flex items-start justify-between">
            <div>
              <BrandLogo variant="white" size="md" />
              <p className="mt-2 text-[11px] leading-snug text-white/75 max-w-[190px]">
                Teknologi Cerdas untuk Sawah yang Lebih Terjaga
              </p>
            </div>
            <button
              className="lg:hidden p-2 -mr-1 text-white/80 hover:text-white"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
            >
              <X size={22} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-0 py-2 overflow-y-auto" aria-label="Menu navigasi">
            {navigation.map(renderNavItem)}

            {showAdminNav && (
              <div className="pt-4 mt-2 border-t border-white/15">
                <h3 className="px-4 text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-1">
                  Admin
                </h3>
                {adminNavigation.map(renderNavItem)}
              </div>
            )}

            <div className="pt-2 mt-2 border-t border-white/15">
              <Link
                href="/settings"
                className={`flex items-center gap-3 pl-3 pr-3 py-2.5 min-h-[48px] rounded-r-lg text-sm font-medium transition-colors ${
                  pathname.startsWith('/settings') ? activeClass : idleClass
                }`}
              >
                <Settings size={20} aria-hidden="true" />
                Pengaturan
              </Link>
            </div>
          </nav>

          {/* User — scrim halus menyatu dengan warna sidebar agar teks tetap
              terbaca di atas ilustrasi (bukan kotak/border). */}
          <div className="px-4 py-4 border-t border-white/15 bg-gradient-to-t from-[#1B5E20] via-[#1B5E20]/85 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <User size={16} className="text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName || 'Petani'}</p>
                <p className="text-xs text-white/70">{roleLabel}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="mt-3 w-full flex items-center gap-3 px-3 py-2 min-h-[44px] text-sm text-white/90 hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut size={18} aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* Server actions offline sync (berjalan sekali, global) */}
      <AutoSync />

      {/* Banner mode offline (navigator.onLine false ATAU request gagal) */}
      <OfflineBanner />

      {/* Main content */}
      <div className="lg:pl-72 print:pl-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200 print:hidden">
          <div className="flex items-center gap-3 h-16 px-4 lg:px-6">
            <button
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 touch-target"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
            >
              <Menu size={24} />
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                Halo, {userName || 'Petani'}
              </p>
              <p className="text-xs text-gray-500 truncate">{poktanName || roleLabel}</p>
            </div>

            {showAdminNav && <PendingReportsBadge />}

            {/* Badge Online/Offline */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                online ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
              <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
            </span>

            {/* Avatar dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-full p-0.5 hover:bg-gray-100 transition-colors"
                  aria-label="Menu profil"
                >
                  <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm">
                    {initials}
                  </span>
                  <ChevronDown size={16} className="text-gray-400 hidden sm:block" aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[200px] bg-white rounded-xl border border-gray-200 shadow-lg p-1.5"
                >
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{userName || 'Petani'}</p>
                    <p className="text-xs text-gray-500">{roleLabel}</p>
                  </div>
                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg outline-none cursor-pointer hover:bg-gray-100 focus:bg-gray-100"
                    >
                      <Settings size={16} aria-hidden="true" /> Pengaturan
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/notifikasi"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg outline-none cursor-pointer hover:bg-gray-100 focus:bg-gray-100"
                    >
                      <Bell size={16} aria-hidden="true" /> Notifikasi
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  <DropdownMenu.Item
                    onSelect={handleSignOut}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg outline-none cursor-pointer hover:bg-red-50 focus:bg-red-50"
                  >
                    <LogOut size={16} aria-hidden="true" /> Keluar
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="p-4 lg:p-6 print:p-0">{children}</main>
      </div>
    </div>
  )
}
