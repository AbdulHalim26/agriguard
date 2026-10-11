'use client'

import { useEffect, useState } from 'react'
import {
  User,
  Mail,
  Phone,
  Sprout,
  MapPin,
  Ruler,
  Bell,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
  LogOut,
  Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listMyLahan } from '@/app/(app)/lahan/actions'
import { getReportCount, subscribeQueue } from '@/lib/offline/db'
import { syncReports, isOnline } from '@/lib/offline/sync'
import { updateFullName } from './actions'

interface ProfileData {
  full_name: string
  phone: string
  role: string
  poktan_id: string | null
}

const NOTIF_KEY = 'agriguard-notif-prefs'
interface NotifPrefs {
  flood: boolean
  verification: boolean
  sync: boolean
}
const DEFAULT_PREFS: NotifPrefs = { flood: true, verification: true, sync: true }

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[#2E7D32]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [email, setEmail] = useState('')
  const [district, setDistrict] = useState('')
  const [poktanName, setPoktanName] = useState('')
  const [totalHa, setTotalHa] = useState(0)
  const [lahanCount, setLahanCount] = useState(0)

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)

  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Load profil + info lahan
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (!cancelled) {
        setUserId(user.id)
        setEmail(user.email || '')
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, phone, role, poktan_id')
        .eq('id', user.id)
        .single()
      if (prof && !cancelled) {
        setProfile(prof as ProfileData)
        setName(prof.full_name || '')
        if (prof.poktan_id) {
          const { data: poktan } = await supabase
            .from('poktan')
            .select('name, district')
            .eq('id', prof.poktan_id)
            .single()
          if (poktan && !cancelled) {
            setDistrict(poktan.district || '')
            setPoktanName(poktan.name || '')
          }
        }
      }

      try {
        const res = await listMyLahan()
        if (!cancelled && res.data) {
          setLahanCount(res.data.length)
          setTotalHa(res.data.reduce((s, l) => s + (Number(l.area_hectares) || 0), 0))
        }
      } catch {
        // offline -> biarkan 0
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Preferensi notifikasi (cosmetic, localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY)
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) })
    } catch {
      // ignore
    }
  }, [])

  const updatePref = (key: keyof NotifPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  // Status koneksi + antrian sync
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

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const c = await getReportCount(userId)
        if (!cancelled) setPending(c)
      } catch {
        if (!cancelled) setPending(0)
      }
    }
    refresh()
    const unsub = subscribeQueue(refresh)
    return () => {
      cancelled = true
      unsub()
    }
  }, [userId])

  const handleSaveName = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await updateFullName(name)
      if (res.error) setSaveMsg({ type: 'err', text: res.error })
      else setSaveMsg({ type: 'ok', text: 'Nama berhasil disimpan.' })
    } catch {
      setSaveMsg({ type: 'err', text: 'Gagal menyimpan. Periksa koneksi.' })
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    setSyncMsg(null)
    if (!isOnline()) {
      setSyncMsg('Sedang offline — laporan tetap tersimpan di perangkat ini.')
    } else {
      const result = await syncReports()
      if (result.syncedCount > 0) setSyncMsg(`Berhasil menyinkronkan ${result.syncedCount} laporan.`)
      else if (result.failedCount > 0) setSyncMsg(result.errors[0] || 'Beberapa laporan gagal disinkronkan.')
      else setSyncMsg('Tidak ada laporan yang perlu disinkronkan.')
    }
    try {
      if (userId) setPending(await getReportCount(userId))
    } catch {
      // ignore
    }
    setSyncing(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const roleLabel = profile?.role === 'ppl' ? 'Petugas PPL' : profile?.role === 'dinas' ? 'Dinas Pertanian' : 'Petani'
  const initials = (profile?.full_name || 'P').trim().charAt(0).toUpperCase()

  const toggles: { key: keyof NotifPrefs; label: string; desc: string }[] = [
    { key: 'flood', label: 'Peringatan Banjir', desc: 'Beri tahu saat status wilayah berubah' },
    { key: 'verification', label: 'Status Verifikasi Laporan', desc: 'Hasil verifikasi PPL atas laporan Anda' },
    { key: 'sync', label: 'Pengingat Sinkronisasi', desc: 'Ingatkan saat ada laporan menunggu terkirim' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan</h1>
        <p className="text-gray-500 mt-1">Kelola profil dan preferensi aplikasi</p>
      </div>

      {/* Kartu Profil */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-lg">
            {initials}
          </span>
          <div>
            <p className="font-semibold text-gray-900">{profile?.full_name || 'Petani'}</p>
            <p className="text-xs text-gray-500">{roleLabel}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Nama Lengkap
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                <input
                  id="full_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none min-h-[44px]"
                  placeholder="Nama lengkap"
                />
              </div>
              <button
                onClick={handleSaveName}
                disabled={saving || name.trim() === (profile?.full_name || '')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                Simpan
              </button>
            </div>
            {saveMsg && (
              <p className={`mt-2 text-sm ${saveMsg.type === 'ok' ? 'text-[#2E7D32]' : 'text-red-600'}`}>
                {saveMsg.text}
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                <input
                  value={email}
                  readOnly
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nomor WhatsApp</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                <input
                  value={profile?.phone || ''}
                  readOnly
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 min-h-[44px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informasi Lahan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Informasi Lahan</h2>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-gray-600">
              <Sprout size={16} className="text-[#2E7D32]" aria-hidden="true" /> Jenis Tanaman
            </dt>
            <dd className="text-sm font-medium text-gray-900">Padi</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-gray-600">
              <Ruler size={16} className="text-[#2E7D32]" aria-hidden="true" /> Total Luas
            </dt>
            <dd className="text-sm font-medium text-gray-900">
              {totalHa.toFixed(1)} Ha ({lahanCount} lahan)
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-[#2E7D32]" aria-hidden="true" /> Lokasi Utama
            </dt>
            <dd className="text-sm font-medium text-gray-900 text-right">
              {district || '—'}
              {poktanName && <span className="block text-xs text-gray-400 font-normal">{poktanName}</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* Notifikasi */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Bell size={18} className="text-[#2E7D32]" aria-hidden="true" /> Notifikasi
        </h2>
        <p className="text-xs text-gray-400 mb-4">Preferensi disimpan di perangkat ini.</p>
        <ul className="space-y-4">
          {toggles.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">{t.label}</p>
                <p className="text-xs text-gray-500">{t.desc}</p>
              </div>
              <Switch
                checked={prefs[t.key]}
                onChange={(v) => updatePref(t.key, v)}
                label={t.label}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Sinkronisasi Offline */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <RefreshCw size={18} className="text-[#2E7D32]" aria-hidden="true" /> Sinkronisasi Offline
        </h2>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600">Status Koneksi</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              online ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600">Menunggu Sinkron</span>
          <span className="text-sm font-medium text-gray-900">{pending} laporan</span>
        </div>
        {syncMsg && <p className="text-xs text-gray-500 mb-3">{syncMsg}</p>}
        <button
          onClick={handleSync}
          disabled={syncing || pending === 0}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {syncing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          Sinkron Sekarang
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 font-medium rounded-2xl hover:bg-red-50 transition-colors min-h-[48px]"
      >
        <LogOut size={18} aria-hidden="true" /> Keluar
      </button>
    </div>
  )
}
