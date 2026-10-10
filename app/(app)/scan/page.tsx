'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Camera,
  Upload,
  Crosshair,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ArrowRight,
  FileWarning,
  WifiOff,
} from 'lucide-react'
import { compressImage, validateGeofence, type Polygon } from '@/lib/geo'
import {
  AI_STATUS_INFO,
  AI_STATUS_LIST,
  formatConfidence,
  type AiStatus,
} from '@/lib/recommendations'
import { submitReport } from '@/app/(app)/laporan/actions'
import { listMyLahan, type LahanWithPolygon } from '@/app/(app)/lahan/actions'
import { saveReportOffline, type OfflineReport } from '@/lib/offline/db'
import { autoSync } from '@/lib/offline/sync'
import {
  isOfflineNow,
  markOffline,
  markOnline,
  useOfflineStatus,
} from '@/lib/offline/status'
import { useCurrentUserId } from '@/lib/offline/use-current-user'
import type { GeoCoords } from './ScanMap'

const ScanMap = dynamic(() => import('./ScanMap'), {
  ssr: false,
  loading: () => (
    <div className="h-56 flex items-center justify-center bg-gray-100 text-sm text-gray-400">
      Memuat peta...
    </div>
  ),
})

const DEFAULT_CENTER: [number, number] = [-6.312, 107.285]
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const LAHAN_CACHE_KEY = 'agriguard-lahan-cache'

interface AiResult {
  status: AiStatus
  confidence: number
  damage_pct: number
}

interface PhotoState {
  blob: Blob
  previewUrl: string
  name: string
}

export default function ScanPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `key_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  )

  const [photo, setPhoto] = useState<PhotoState | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualStatus, setManualStatus] = useState<AiStatus>('rusak_ringan')

  const [lahan, setLahan] = useState<LahanWithPolygon[]>([])
  const [lahanLoading, setLahanLoading] = useState(true)
  const [lahanError, setLahanError] = useState<string | null>(null)
  const [selectedLahanId, setSelectedLahanId] = useState('')

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState(false)
  const offline = useOfflineStatus()

  const userId = useCurrentUserId()

  const loadLahan = useCallback(async () => {
    setLahanLoading(true)
    setLahanError(null)
    try {
      const res = await listMyLahan()
      if (res.error) throw new Error(res.error)
      setLahan(res.data || [])
      // Cache lahan terakhir agar form tetap bisa dipakai saat offline.
      try {
        window.localStorage.setItem(LAHAN_CACHE_KEY, JSON.stringify(res.data || []))
      } catch {
        // ignore
      }
      markOnline()
      // Keberhasilan request berikutnya = sinyal "kembali online" -> coba sync.
      if (!isOfflineNow()) {
        autoSync()
      }
    } catch (err) {
      markOffline()
      let cached: LahanWithPolygon[] = []
      try {
        const raw = window.localStorage.getItem(LAHAN_CACHE_KEY)
        if (raw) cached = JSON.parse(raw) as LahanWithPolygon[]
      } catch {
        // ignore
      }
      setLahan(cached)
      if (cached.length === 0) {
        setLahanError(
          'Tidak dapat memuat data lahan (koneksi terputus). Form scan tetap berfungsi; data akan tersinkron saat online.'
        )
      }
    } finally {
      setLahanLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLahan()
  }, [loadLahan])

  const handleFile = useCallback(async (file: File) => {
    // Kunci idempotency baru per foto. Ini memastikan tiap laporan (termasuk
    // saat offline, tanpa meninggalkan halaman) dapat identitas unik sehingga
    // entri antrian IndexedDB tidak saling menimpa. Retry laporan yang sama
    // tetap memakai kunci ini.
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `key_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    setSubmitError(null)
    setAiError(null)
    setAiResult(null)
    setManualMode(false)
    setSuccessId(null)
    setSavedOffline(false)

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAiError('Format foto harus JPG atau PNG.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setAiError('Ukuran foto maksimal 5MB.')
      return
    }

    try {
      const blob = await compressImage(file, 1280, 0.8)
      setPhoto({
        blob,
        previewUrl: URL.createObjectURL(blob),
        name: blob.type === 'image/png' ? 'scan.png' : 'scan.jpg',
      })

      setAnalyzing(true)
      const form = new FormData()
      form.append('image', blob, 'scan.jpg')

      const res = await fetch('/api/ai/analyze', { method: 'POST', body: form })
      if (res.ok) {
        const data = await res.json()
        setAiResult({
          status: data.status as AiStatus,
          confidence: data.confidence,
          damage_pct: data.damage_pct,
        })
      } else {
        const data = await res.json().catch(() => null)
        setAiError(data?.error || 'AI gagal menganalisis foto.')
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal memproses foto')
    } finally {
      setAnalyzing(false)
    }
  }, [])

  const handleGetLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSubmitError('GPS tidak didukung perangkat. Klik peta untuk memilih lokasi.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocating(false)
        setSubmitError('Tidak dapat mengambil GPS. Klik peta untuk memilih lokasi manual.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  const selectedLahan = lahan.find((l) => l.id === selectedLahanId)

  const inBounds =
    selectedLahan && coords
      ? validateGeofence(coords.lat, coords.lng, selectedLahan.polygon as Polygon)
      : null

  // FR-03: simpan payload + foto (sudah dikompres) ke IndexedDB. Dipakai saat
  // benar-benar offline ATAU saat pengiriman online gagal karena network error.
  const persistOffline = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      setSubmitError('Sesi tidak tersedia untuk penyimpanan offline. Coba lagi.')
      return false
    }
    if (!selectedLahan) {
      setSubmitError('Pilih lahan tujuan laporan.')
      return false
    }
    const aiStatus = aiResult?.status ?? (manualMode ? manualStatus : null)
    const offlineReport: OfflineReport = {
      id: idempotencyKeyRef.current,
      idempotencyKey: idempotencyKeyRef.current,
      userId,
      lahanId: selectedLahan.id,
      photoPaths: [],
      photoHash: '',
      aiStatus,
      aiConfidence: aiResult ? aiResult.confidence : null,
      aiDamagePct: aiResult ? aiResult.damage_pct : null,
      latitude: coords!.lat,
      longitude: coords!.lng,
      clientCreatedAt: new Date().toISOString(),
      photoBlobs: [photo!.blob],
      synced: false,
      retryCount: 0,
    }
    try {
      await saveReportOffline(offlineReport)
      markOffline()
      setSavedOffline(true)
      return true
    } catch {
      setSubmitError('Gagal menyimpan laporan offline. Coba lagi.')
      return false
    }
  }, [userId, selectedLahan, coords, photo, aiResult, manualMode, manualStatus])

  const handleSubmit = useCallback(async () => {
    setSubmitError(null)

    if (!photo) {
      setSubmitError('Ambil atau unggah foto dulu.')
      return
    }
    if (!selectedLahan) {
      setSubmitError('Pilih lahan tujuan laporan.')
      return
    }
    if (!coords) {
      setSubmitError('Ambil lokasi lewat GPS, atau klik peta.')
      return
    }

    if (!validateGeofence(coords.lat, coords.lng, selectedLahan.polygon as Polygon)) {
      setSubmitError('Lokasi berada di luar batas lahan yang dipilih. Klik ulang di dalam area lahan.')
      return
    }

    // Saat offline (navigator.onLine false ATAU request sebelumnya gagal),
    // kirim langsung ke antrian IndexedDB. AutoSync akan mengirim ke /api/sync
    // begitu koneksi kembali (event online / request sukses).
    if (isOfflineNow()) {
      await persistOffline()
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('lahan_id', selectedLahan.id)
      fd.append('latitude', String(coords.lat))
      fd.append('longitude', String(coords.lng))
      fd.append('idempotency_key', idempotencyKeyRef.current)
      fd.append('client_created_at', new Date().toISOString())
      if (aiResult) {
        fd.append('ai_status', aiResult.status)
        fd.append('ai_confidence', String(aiResult.confidence))
        fd.append('ai_damage_pct', String(aiResult.damage_pct))
      } else if (manualMode) {
        fd.append('ai_status', manualStatus)
      }
      fd.append('photos', photo.blob, photo.name)

      const res = await submitReport(fd)
      if (res.error) {
        setSubmitError(res.error)
        return
      }
      markOnline()
      if (!isOfflineNow()) {
        autoSync()
      }
      setSuccessId(res.data?.id || '')
    } catch {
      // Network error (Supabase/Next.js tidak terjangkau walau navigator online):
      // fallback ke antrian IndexedDB — form offline tetap berfungsi.
      const saved = await persistOffline()
      if (!saved) {
        setSubmitError('Koneksi gagal dan laporan belum tersimpan. Coba lagi.')
      }
    } finally {
      setSubmitting(false)
    }
  }, [photo, selectedLahan, coords, aiResult, manualMode, manualStatus, persistOffline])

  // Arahkan ke halaman laporan saat laporan sukses tersimpan
  useEffect(() => {
    if (successId !== null && successId !== '') {
      router.push('/laporan')
      router.refresh()
    }
  }, [successId, router])

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scan Kerusakan Padi</h1>
        <p className="text-gray-500 mt-1">Foto padi, hasil AI, lalu laporkan dengan lokasi.</p>
      </div>

      {offline && (
        <div
          className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm"
          role="alert"
        >
          <WifiOff className="w-5 h-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Anda sedang offline</p>
            <p className="text-xs mt-0.5">
              Scan & laporan tetap berfungsi. Foto + data disimpan lokal dan akan tersinkron
              otomatis saat koneksi kembali.
            </p>
          </div>
        </div>
      )}

      {/* Bagian foto */}
      {!photo ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <div className="p-3 bg-gray-100 rounded-xl w-fit mx-auto mb-4">
              <Camera className="w-8 h-8 text-gray-500" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Ambil Foto Padi</h3>
            <p className="text-gray-500 mb-6">JPG/PNG, maksimal 5MB. Otomatis dikompres 1280px.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Camera className="w-5 h-5" aria-hidden="true" />
                Ambil Foto
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-5 h-5" aria-hidden="true" />
                Pilih dari Galeri
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt="Pratinjau foto padi"
              className="w-full h-72 object-cover"
            />
            <button
              onClick={() => {
                setPhoto(null)
                setAiResult(null)
                setAiError(null)
                setManualMode(false)
              }}
              className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 text-white text-sm rounded-lg hover:bg-black/80 transition-colors"
            >
              Ganti Foto
            </button>
          </div>

          {analyzing && (
            <div className="p-6 flex items-center gap-3 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span>Menganalisis foto dengan AI...</span>
            </div>
          )}

          {!analyzing && aiResult && (
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <div className={`p-3 rounded-xl ${AI_STATUS_INFO[aiResult.status].badgeClass}`}>
                  <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Hasil Analisis AI</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Status{' '}
                    <span className={`font-medium ${AI_STATUS_INFO[aiResult.status].badgeClass} px-2 py-0.5 rounded-full`}>
                      {AI_STATUS_INFO[aiResult.status].label}
                    </span>{' '}
                    · keyakinan {formatConfidence(aiResult.confidence)} · kerusakan{' '}
                    {Math.round(aiResult.damage_pct)}%
                  </p>
                  <p className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {AI_STATUS_INFO[aiResult.status].recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!analyzing && aiError && !aiResult && (
            <div className="p-5 border-b border-gray-100 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium">AI tidak dapat menganalisis foto</p>
                  <p className="mt-0.5">{aiError}</p>
                </div>
              </div>
              {!manualMode && (
                <button
                  onClick={() => setManualMode(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-amber-300 text-amber-800 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <FileWarning className="w-5 h-5" aria-hidden="true" />
                  Gunakan Pelaporan Manual
                </button>
              )}
            </div>
          )}

          {manualMode && (
            <div className="p-5 border-b border-gray-100 space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-amber-500" aria-hidden="true" />
                Laporan Manual
              </h3>
              <p className="text-sm text-gray-600">
                AI gagal, tetapi Anda tetap bisa melapor. Pilih status kerusakan sendiri:
              </p>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as AiStatus)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
              >
                {AI_STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {AI_STATUS_INFO[s].label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Form lengkapi laporan */}
      {photo && !analyzing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Lengkapi Laporan</h2>

          <div>
            <label htmlFor="lahan" className="block text-sm font-medium text-gray-700 mb-1">
              Lahan Tujuan
            </label>
            {lahanLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Memuat lahan...
              </div>
            ) : lahanError ? (
              <div className="text-sm text-red-600">
                {lahanError}
                <button onClick={loadLahan} className="ml-2 text-green-700 underline">
                  Coba lagi
                </button>
              </div>
            ) : lahan.length === 0 ? (
              <div className="text-sm text-gray-600">
                Belum ada lahan. Tambahkan dulu di halaman{' '}
                <a href="/lahan" className="text-green-700 underline">
                  Lahan Saya
                </a>
                .
              </div>
            ) : (
              <select
                id="lahan"
                value={selectedLahanId}
                onChange={(e) => setSelectedLahanId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
              >
                <option value="">Pilih lahan...</option>
                {lahan.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {Number(l.area_hectares).toFixed(2)} Ha
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi Laporan</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGetLocation}
                disabled={locating}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {locating ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Crosshair className="w-5 h-5" aria-hidden="true" />
                )}
                {locating ? 'Mencari GPS...' : 'Ambil Lokasi (GPS)'}
              </button>
              <button
                onClick={() => setCoords({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-5 h-5" aria-hidden="true" />
                Atur di Peta
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {coords
                ? `Lokasi: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
                : 'Belum ada lokasi. Gunakan GPS atau klik peta di bawah.'}
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-300">
              <ScanMap
                coords={coords}
                onPick={setCoords}
                polygon={selectedLahan ? (selectedLahan.polygon as Polygon) : null}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" /> Area hijau = batas lahan terpilih. Klik di dalamnya untuk memilih lokasi.
            </p>
          </div>

{selectedLahan && coords && (
            <div
              className={`text-sm px-3 py-2 rounded-lg ${
                inBounds ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {inBounds
                ? 'Lokasi berada di dalam batas lahan.'
                : 'Lokasi di luar batas lahan — klik di dalam area hijau pada peta.'}
            </div>
          )}

          {savedOffline && (
            <div
              className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2"
              role="alert"
            >
              <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
              Laporan tersimpan offline. Akan tersinkron otomatis saat koneksi kembali.
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2" role="alert">
              <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || inBounds === false}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Mengirim laporan...
              </>
            ) : inBounds === false ? (
              'Lokasi di luar lahan — pindahkan ke area hijau'
            ) : (
              <>
                Kirim Laporan <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Input tersembunyi */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}