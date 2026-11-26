'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Clock,
} from 'lucide-react'
import { calculateSha256, validateGeofence, type Polygon } from '@/lib/geo'
import {
  buildWatermarkLines,
  captureSourceLabel,
  createWatermarkedCopy,
  formatWibTimestamp,
  GALLERY_LOCATION_WARNING,
  locationStatusLabel,
  PHOTO_EVIDENCE_DISCLAIMER,
  PHOTO_EVIDENCE_VERSION,
  type CaptureSource,
  type ClientCaptureMetadata,
  type LocationStatus,
} from '@/lib/reports/photo-evidence'
import {
  AI_STATUS_INFO,
  AI_STATUS_LIST,
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
import { fieldCacheKey } from '@/lib/offline/identity'
import type { GeoCoords } from './ScanMap'
import PhotoGuide from './PhotoGuide'
import ScanTerbaru from './ScanTerbaru'
import MapSkeleton from '@/components/map/MapSkeleton'
import DetectionOverlay, { DetectionPanel } from '@/components/features/DetectionOverlay'
import { detectionResponseSchema, type DetectionResponse } from '@/lib/detection'
import AdvisoryAssessment from '@/components/features/AdvisoryAssessment'
import AnalysisFailureActions from '@/components/features/AnalysisFailureActions'
import { advisoryAssessment, submissionEvidence } from '@/lib/reports/advisory'
import { formatHectares, registeredArea } from '@/lib/reports/area'
import { validatePolygon } from '@/lib/land/geometry'

const OfflineMapFallback = () => (
  <div className="h-56 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-4 text-center text-sm text-gray-600">
    Peta tidak tersedia saat offline. Koordinat GPS tetap tersimpan bersama laporan.
  </div>
)

const ScanMap = dynamic(
  () => import('./ScanMap').catch(() => ({ default: OfflineMapFallback })),
  {
    ssr: false,
    loading: () => <MapSkeleton className="h-56" />,
  }
)

const DEFAULT_CENTER: [number, number] = [-6.312, 107.285]
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const SCAN_TIMEOUT_MS = 90_000

interface AiResult {
  status: AiStatus
  confidence: number
  damage_pct: number
  analysis_id: string
}

interface PhotoState {
  blob: Blob
  previewUrl: string
  name: string
  originalSha256: string
  captureSource: CaptureSource
  deviceCapturedAt: string
}

interface GpsSnapshot {
  latitude: number
  longitude: number
  accuracy_m: number | null
  captured_at: string
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
  const [analysisMessage, setAnalysisMessage] = useState('Mengunggah foto…')
  const analysisControllerRef = useRef<AbortController | null>(null)
  const photoVersionRef = useRef(0)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [yoloEnabled, setYoloEnabled] = useState(false)
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null)
  const [detectionLoading, setDetectionLoading] = useState(false)
  const [detectionError, setDetectionError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRetake, setAiRetake] = useState(false)
  const [aiPending, setAiPending] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualStatus, setManualStatus] = useState<AiStatus>('rusak_ringan')

  const [lahan, setLahan] = useState<LahanWithPolygon[]>([])
  const [lahanLoading, setLahanLoading] = useState(true)
  const [lahanError, setLahanError] = useState<string | null>(null)
  const [selectedLahanId, setSelectedLahanId] = useState('')

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsSnapshot, setGpsSnapshot] = useState<GpsSnapshot | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('gps_unavailable_unverified')
  const [watermarked, setWatermarked] = useState<{ blob: Blob; previewUrl: string; sha256: string; lines: string[] } | null>(null)
  const [previewTab, setPreviewTab] = useState<'yolo' | 'watermarked' | 'original'>('watermarked')
  const [mapReady, setMapReady] = useState(false)
  const [locating, setLocating] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState(false)
  const offline = useOfflineStatus()

  useEffect(() => {
    let active = true
    // Preload ScanMap chunk while online so selecting a photo offline never fails.
    import('./ScanMap').catch(() => {})
    fetch('/api/ai/detect', { cache: 'no-store' }).then((res) => res.ok ? res.json() : null)
      .then((config) => { if (active) setYoloEnabled(config?.enabled === true) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    setDetectionResult(null)
    setDetectionError(null)
    setDetectionLoading(false)
    if (!yoloEnabled || !photo || offline) return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
    setDetectionLoading(true)
    const form = new FormData()
    form.append('image', photo.blob, photo.name)
    fetch('/api/ai/detect', { method: 'POST', body: form, signal: controller.signal }).then(async (response) => {
      const body = await response.json()
      if (!active) return
      if (!response.ok) {
        setDetectionError(response.status === 503
          ? 'Detektor YOLO belum tersedia. Klasifikasi foto awal tetap terpisah di bawah.'
          : response.status === 401 || response.status === 403
            ? 'Sesi deteksi perlu diperbarui. Silakan masuk kembali.'
            : response.status === 429
              ? 'Batas deteksi hari ini tercapai. Pelaporan existing tetap tersedia.'
              : 'Deteksi belum berhasil. Foto tetap tersedia; coba lagi saat layanan siap.')
        return
      }
      const parsed = detectionResponseSchema.parse(body)
      setDetectionResult(parsed)
      if (parsed.inference_status !== 'UNSUPPORTED_IMAGE') {
        setPreviewTab('yolo')
      } else {
        setPreviewTab('watermarked')
      }
    }).catch(() => {
      if (active) setDetectionError(controller.signal.aborted
        ? 'Deteksi melewati 90 detik. Foto tetap tersedia; klasifikasi foto diproses terpisah.'
        : 'Koneksi deteksi gagal atau responsnya tidak valid. Klasifikasi foto tetap terpisah.')
    }).finally(() => {
      window.clearTimeout(timer)
      if (active) setDetectionLoading(false)
    })
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [photo, yoloEnabled, offline])

  const userId = useCurrentUserId()
  const currentUserRef = useRef(userId)
  currentUserRef.current = userId
  const lahanLoadVersion = useRef(0)

  const loadLahan = useCallback(async () => {
    const version = ++lahanLoadVersion.current
    setLahan([])
    if (!userId) { setLahanLoading(false); return }
    setLahanLoading(true)
    setLahanError(null)
    try {
      const res = await listMyLahan(userId)
      if (version !== lahanLoadVersion.current || currentUserRef.current !== userId) return
      if (res.error) throw new Error(res.error)
      setLahan(res.data || [])
      // Cache lahan terakhir agar form tetap bisa dipakai saat offline.
      try {
        window.localStorage.setItem(fieldCacheKey(userId), JSON.stringify(res.data || []))
      } catch {
        // ignore
      }
      markOnline()
      // Keberhasilan request berikutnya = sinyal "kembali online" -> coba sync.
      if (!isOfflineNow()) {
        autoSync()
      }
    } catch (err) {
      if (version !== lahanLoadVersion.current || currentUserRef.current !== userId) return
      markOffline()
      let cached: LahanWithPolygon[] = []
      try {
        const raw = window.localStorage.getItem(fieldCacheKey(userId))
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
      if (version === lahanLoadVersion.current) setLahanLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadLahan()
  }, [loadLahan])

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [photo])

  useEffect(() => {
    return () => {
      if (watermarked) URL.revokeObjectURL(watermarked.previewUrl)
    }
  }, [watermarked])

  const cancelAnalysis = useCallback(() => {
    photoVersionRef.current += 1
    const controller = analysisControllerRef.current
    analysisControllerRef.current = null
    controller?.abort()
  }, [])

  useEffect(() => cancelAnalysis, [cancelAnalysis])

  const formUserRef = useRef<string | null>(null)
  useEffect(() => {
    if (formUserRef.current && formUserRef.current !== userId) {
      cancelAnalysis()
      setPhoto(null)
      setAiResult(null)
      setManualMode(false)
      setSelectedLahanId('')
      setCoords(null)
      setSuccessId(null)
      setSavedOffline(false)
    }
    formUserRef.current = userId
  }, [userId, cancelAnalysis])

  const analyzePhoto = useCallback(async (blob: Blob) => {
    cancelAnalysis()
    setAiError(null)
    setAiRetake(false)
    setAiResult(null)
    setManualMode(false)
    setAiPending(false)

    if (isOfflineNow()) {
      setAnalyzing(false)
      setAiPending(true)
      return
    }

    const controller = new AbortController()
    analysisControllerRef.current = controller
    setAnalyzing(true)
    setAnalysisMessage('Mengunggah foto…')
    const timeout = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
    const analyzingStage = window.setTimeout(() => {
      if (analysisControllerRef.current === controller) setAnalysisMessage('Menganalisis dengan AI…')
    }, 2_000)
    const finishingStage = window.setTimeout(() => {
      if (analysisControllerRef.current === controller) setAnalysisMessage('Hampir selesai…')
    }, 45_000)

    try {
      const form = new FormData()
      form.append('image', blob, 'scan.jpg')
      const res = await fetch('/api/ai/analyze', {
        method: 'POST', body: form, signal: controller.signal,
      })
      const data = await res.json()
      if (analysisControllerRef.current !== controller) return

      if (res.ok) {
        if (!AI_STATUS_LIST.includes(data?.status) ||
            !Number.isFinite(data?.confidence) || data.confidence < 0 || data.confidence > 1 ||
            !Number.isFinite(data?.damage_pct) || data.damage_pct < 0 || data.damage_pct > 100 ||
            typeof data?.analysis_id !== 'string') {
          throw new Error('Invalid analysis response')
        }
        setAiResult({ status: data.status, confidence: data.confidence, damage_pct: data.damage_pct, analysis_id: data.analysis_id })
      } else if (res.status === 422 || data?.retake === true) {
        setAiRetake(true)
        setAiError('Foto ini belum dapat dianalisis. Ambil ulang foto padi yang lebih jelas, dekat, dan cukup terang.')
      } else if (res.status === 401 || res.status === 403) {
        setAiError('Sesi Anda perlu diperbarui. Silakan masuk kembali, lalu coba lagi.')
      } else if (res.status === 429) {
        setAiError('Batas analisis hari ini sudah tercapai. Anda tetap dapat menggunakan pelaporan manual.')
      } else {
        setAiError('Layanan AI belum merespons. Tunggu sebentar, lalu tekan Coba Lagi. Foto Anda tetap tersedia.')
      }
    } catch {
      if (analysisControllerRef.current !== controller) return
      setAiError(controller.signal.aborted
        ? 'Analisis melewati 90 detik. Tunggu sebentar, lalu tekan Coba Lagi. Foto Anda tetap tersedia.'
        : 'Analisis belum berhasil. Periksa koneksi Anda, lalu tekan Coba Lagi. Foto Anda tetap tersedia.')
    } finally {
      window.clearTimeout(timeout)
      window.clearTimeout(analyzingStage)
      window.clearTimeout(finishingStage)
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null
        setAnalyzing(false)
      }
    }
  }, [cancelAnalysis])

  const captureGpsOnce = useCallback((): Promise<GpsSnapshot | null> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            captured_at: new Date().toISOString(),
          })
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
      )
    })
  }, [])

  const handleFile = useCallback(async (file: File, source: CaptureSource) => {
    cancelAnalysis()
    const photoVersion = photoVersionRef.current
    const deviceCapturedAt = new Date().toISOString()
    setAnalyzing(false)
    setPhoto(null)
    setWatermarked(null)
    setPreviewTab('watermarked')
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
    setAiRetake(false)
    setAiResult(null)
    setAiPending(false)
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
      // Pertahankan file foto asli byte-identical (tanpa re-encode yang mengubah SHA-256).
      const [originalSha256, snap] = await Promise.all([
        calculateSha256(file),
        captureGpsOnce(),
      ])
      if (photoVersionRef.current !== photoVersion) return
      if (snap) {
        setGpsSnapshot(snap)
        setCoords({ lat: snap.latitude, lng: snap.longitude })
        setLocationStatus('gps_captured')
      } else {
        setGpsSnapshot(null)
        setLocationStatus('gps_unavailable_unverified')
      }
      setPhoto({
        blob: file,
        previewUrl: URL.createObjectURL(file),
        name: file.type === 'image/png' ? 'original.png' : 'original.jpg',
        originalSha256,
        captureSource: source,
        deviceCapturedAt,
      })

      // Foto asli byte-identical dipakai untuk analisis AI, Storage, dan antrean offline.
      await analyzePhoto(file)
    } catch {
      if (photoVersionRef.current !== photoVersion) return
      setAiRetake(true)
      setAiError('Foto belum dapat diproses. Silakan pilih foto JPG/PNG lain atau ambil ulang foto.')
    }
  }, [analyzePhoto, cancelAnalysis, captureGpsOnce])

  const handleGetLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('gps_unavailable_unverified')
      setSubmitError('GPS tidak didukung perangkat. Klik peta untuk memilih lokasi manual (status lokasi belum terverifikasi GPS).')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const snap: GpsSnapshot = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          captured_at: new Date().toISOString(),
        }
        setGpsSnapshot(snap)
        setCoords({ lat: snap.latitude, lng: snap.longitude })
        setLocationStatus('gps_captured')
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocationStatus('gps_unavailable_unverified')
        setSubmitError('GPS ditolak atau tidak tersedia. Pilih titik di dalam batas lahan pada peta (ditandai sebagai lokasi belum terverifikasi GPS).')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  const selectedLahan = lahan.find((l) => l.id === selectedLahanId)
  const selectedGeometry = useMemo(() => selectedLahan ? validatePolygon(selectedLahan.polygon) : null, [selectedLahan])
  const verifiedRegionLabel = useMemo(() => {
    if (!selectedLahan) return null
    const extra = selectedLahan as LahanWithPolygon & { village?: string | null; district?: string | null }
    const parts = [extra.village, extra.district].filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }, [selectedLahan])

  // Tunda mount ScanMap (Leaflet) satu frame setelah foto dipilih agar paint awal & INP tetap responsif.
  useEffect(() => {
    if (!photo) { setMapReady(false); return }
    let rafId = 0
    let timerId = 0
    rafId = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(() => setMapReady(true), 0)
    })
    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timerId)
    }
  }, [photo])

  // Buat salinan watermarked terpisah di luar frame interaksi agar tidak menghambat INP (foto asli tidak pernah dimutasi).
  useEffect(() => {
    if (!photo) { setWatermarked(null); return }
    let cancelled = false
    let rafId = 0
    let timerId = 0
    const lines = buildWatermarkLines({
      gpsSnapshot,
      locationStatus,
      deviceCapturedAt: photo.deviceCapturedAt,
      regionLabel: verifiedRegionLabel,
      lahanId: selectedLahan?.id ?? null,
      lahanName: selectedLahan?.name ?? null,
      captureSource: photo.captureSource,
    })
    rafId = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(() => {
        if (cancelled) return
        void createWatermarkedCopy(photo.blob, lines).then(async (wmBlob) => {
          if (cancelled || !wmBlob) return
          const sha = await calculateSha256(wmBlob)
          if (cancelled) return
          setWatermarked({ blob: wmBlob, previewUrl: URL.createObjectURL(wmBlob), sha256: sha, lines })
        })
      }, 0)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timerId)
    }
  }, [photo, gpsSnapshot, locationStatus, verifiedRegionLabel, selectedLahan?.id, selectedLahan?.name])

  const buildCaptureMetadata = useCallback((submittedOffline: boolean): ClientCaptureMetadata | null => {
    if (!photo) return null
    return {
      version: PHOTO_EVIDENCE_VERSION,
      capture_source: photo.captureSource,
      location_status: locationStatus,
      gps_snapshot: gpsSnapshot,
      device_captured_at: photo.deviceCapturedAt,
      submitted_offline: submittedOffline,
      region_label: verifiedRegionLabel,
      geometry_version_id: null,
      watermark_applied: Boolean(watermarked),
      watermark_lines: watermarked?.lines ?? [],
    }
  }, [photo, locationStatus, gpsSnapshot, verifiedRegionLabel, watermarked])

  const inBounds =
    selectedLahan && coords
      ? validateGeofence(coords.lat, coords.lng, selectedLahan.polygon as Polygon)
      : null

  // FR-03: simpan payload + foto (sudah dikompres) ke IndexedDB. Dipakai saat
  // benar-benar offline ATAU saat pengiriman online gagal karena network error.
  const persistOffline = useCallback(async (connectionLost = false): Promise<boolean> => {
    if (!userId) {
      setSubmitError('Sesi tidak tersedia untuk penyimpanan offline. Coba lagi.')
      return false
    }
    if (!selectedLahan) {
      setSubmitError('Pilih lahan tujuan laporan.')
      return false
    }
    const evidence = submissionEvidence({ manualMode, manualStatus, prediction: aiResult })
    const photoBlobs = watermarked ? [photo!.blob, watermarked.blob] : [photo!.blob]
    const offlineReport: OfflineReport = {
      id: idempotencyKeyRef.current,
      idempotencyKey: idempotencyKeyRef.current,
      userId,
      lahanId: selectedLahan.id,
      photoPaths: [],
      photoHash: photo!.originalSha256,
      aiStatus: evidence.status,
      aiConfidence: evidence.confidence,
      aiDamagePct: evidence.damage_pct,
      evidenceSource: evidence.source,
      analysisId: evidence.analysis_id,
      latitude: coords!.lat,
      longitude: coords!.lng,
      clientCreatedAt: photo!.deviceCapturedAt,
      photoBlobs,
      captureMetadata: buildCaptureMetadata(true),
      synced: false,
      retryCount: 0,
    }
    try {
      await saveReportOffline(offlineReport)
      if (connectionLost) markOffline()
      setSavedOffline(true)
      return true
    } catch {
      setSubmitError('Gagal menyimpan laporan offline. Coba lagi.')
      return false
    }
  }, [userId, selectedLahan, coords, photo, watermarked, buildCaptureMetadata, aiResult, manualMode, manualStatus])

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
    if (selectedGeometry && !selectedGeometry.valid) {
      setSubmitError('Batas lahan belum valid untuk pemeriksaan lokasi. Minta pendaftar/pengelola memeriksa batas; foto tidak diubah dan ini bukan penolakan klaim.')
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
      fd.append('client_created_at', photo.deviceCapturedAt)
      const captureMeta = buildCaptureMetadata(false)
      if (captureMeta) fd.append('capture_metadata', JSON.stringify(captureMeta))
      const evidence = submissionEvidence({ manualMode, manualStatus, prediction: aiResult })
      fd.append('evidence_source', evidence.source)
      if (evidence.source === 'ai') fd.append('analysis_id', evidence.analysis_id)
      if (evidence.source === 'manual') fd.append('manual_status', evidence.status)
      fd.append('photos', photo.blob, photo.name)
      if (watermarked) {
        fd.append('photos', watermarked.blob, watermarked.blob.type === 'image/png' ? 'watermarked.png' : 'watermarked.jpg')
      }

      const res = await submitReport(fd)
      if (res.error) {
        if (res.retryable) await persistOffline()
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
      const saved = await persistOffline(true)
      if (!saved) {
        setSubmitError('Koneksi gagal dan laporan belum tersimpan. Coba lagi.')
      }
    } finally {
      setSubmitting(false)
    }
  }, [photo, watermarked, buildCaptureMetadata, selectedLahan, selectedGeometry, coords, aiResult, manualMode, manualStatus, persistOffline])

  // Arahkan ke halaman laporan saat laporan sukses tersimpan
  useEffect(() => {
    if (successId !== null && successId !== '') {
      router.push('/laporan')
      router.refresh()
    }
  }, [successId, router])

  const isUnsupportedImage = aiRetake || detectionResult?.inference_status === 'UNSUPPORTED_IMAGE'
  const canShowYoloOverlay = Boolean(detectionResult && !isUnsupportedImage)

  return (
    <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="space-y-6 min-w-0">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <div className="p-3 bg-gray-100 rounded-xl w-fit mx-auto mb-4">
              <Camera className="w-8 h-8 text-gray-500" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Ambil Foto Padi</h3>
            <p className="text-gray-500 mb-6">JPG/PNG, maksimal 5MB. Foto asli disimpan tanpa perubahan; salinan watermark dibuat terpisah.</p>
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
          {aiError && <p className="mt-4 text-sm text-red-700" role="alert">{aiError}</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {canShowYoloOverlay && previewTab === 'yolo' ? <DetectionOverlay imageSrc={photo.previewUrl} result={detectionResult!} /> : <img
              src={previewTab === 'watermarked' && watermarked ? watermarked.previewUrl : photo.previewUrl}
              alt={previewTab === 'watermarked' && watermarked ? 'Salinan foto dengan watermark GPS' : 'Foto asli tanpa perubahan'}
              decoding="async"
              className="w-full max-h-[42vh] sm:max-h-72 h-auto object-contain bg-slate-950"
            />}
            {/* Bracket sudut viewport kamera */}
            <span className="pointer-events-none absolute inset-3" aria-hidden="true">
              <span className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-white/90 rounded-tl-md" />
              <span className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-white/90 rounded-tr-md" />
              <span className="absolute left-0 bottom-0 h-6 w-6 border-l-4 border-b-4 border-white/90 rounded-bl-md" />
              <span className="absolute right-0 bottom-0 h-6 w-6 border-r-4 border-b-4 border-white/90 rounded-br-md" />
            </span>
            {/* Chip lokasi GPS */}
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 text-white text-xs backdrop-blur max-w-[72%] truncate">
              <MapPin size={12} className="shrink-0" aria-hidden="true" />
              {coords
                ? (photo.captureSource === 'gallery_upload'
                  ? 'GPS saat unggah (bukan lokasi foto asli)'
                  : 'Lokasi Terdeteksi')
                : 'Lokasi belum terdeteksi'}
            </span>
            <button
              onClick={() => {
                cancelAnalysis()
                setAnalyzing(false)
                setPhoto(null)
                setWatermarked(null)
                setGpsSnapshot(null)
                setLocationStatus('gps_unavailable_unverified')
                setPreviewTab('watermarked')
                setAiResult(null)
                setAiError(null)
                setAiRetake(false)
                setAiPending(false)
                setManualMode(false)
              }}
              className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 text-white text-sm rounded-lg hover:bg-black/80 transition-colors"
            >
              Ganti Foto
            </button>
          </div>

          <div className="px-5 py-3 bg-slate-50 border-b border-gray-100 text-xs text-slate-700 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 font-medium">
                  {captureSourceLabel(photo.captureSource)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">
                  {locationStatusLabel(locationStatus, photo.captureSource)}
                </span>
              </div>
              {(watermarked || canShowYoloOverlay) && (
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                  {canShowYoloOverlay && (
                    <button
                      type="button"
                      onClick={() => startTransition(() => setPreviewTab('yolo'))}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${previewTab === 'yolo' ? 'bg-green-600 text-white' : 'text-slate-600'}`}
                    >
                      Deteksi YOLO
                    </button>
                  )}
                  {watermarked && (
                    <button
                      type="button"
                      onClick={() => startTransition(() => setPreviewTab('watermarked'))}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${previewTab === 'watermarked' ? 'bg-green-600 text-white' : 'text-slate-600'}`}
                    >
                      Salinan Watermark
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startTransition(() => setPreviewTab('original'))}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${previewTab === 'original' ? 'bg-green-600 text-white' : 'text-slate-600'}`}
                  >
                    Foto Asli
                  </button>
                </div>
              )}
            </div>
            {photo.captureSource === 'gallery_upload' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                {GALLERY_LOCATION_WARNING}
              </p>
            )}
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer py-1 font-medium text-slate-700 select-none">
                Detail bukti foto &amp; SHA-256
              </summary>
              <div className="mt-1.5 space-y-1.5 pt-1.5 border-t border-slate-200/80">
                <div className="grid sm:grid-cols-2 gap-1 text-[11px] text-slate-600 font-mono">
                  <p>{photo.captureSource === 'gallery_upload' ? 'Waktu pilih file (perangkat)' : 'Waktu foto (perangkat)'}: {formatWibTimestamp(photo.deviceCapturedAt)}</p>
                  <p>{photo.captureSource === 'gallery_upload' ? 'Akurasi GPS saat unggah' : 'Akurasi GPS'}: {gpsSnapshot?.accuracy_m != null ? `±${Math.round(gpsSnapshot.accuracy_m)} m` : 'Tidak tersedia'}</p>
                  <p>SHA-256 Asli: {photo.originalSha256.slice(0, 16)}…</p>
                  <p>SHA-256 Watermark: {watermarked ? `${watermarked.sha256.slice(0, 16)}…` : 'Menyiapkan…'}</p>
                </div>
                <p className="text-[11px] text-slate-500">{PHOTO_EVIDENCE_DISCLAIMER}</p>
              </div>
            </details>
          </div>

          {yoloEnabled && <DetectionPanel result={detectionResult} loading={detectionLoading}
            suppressedByClassifier={aiRetake}
            error={offline ? 'Sedang offline. Deteksi objek memerlukan koneksi; foto tetap dapat dilaporkan melalui antrean existing.' : detectionError} />}

          {analyzing && (
            <div className="p-6 flex items-center gap-3 text-gray-600" role="status" aria-live="polite">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <div>
                <p>{analysisMessage}</p>
                <p className="mt-1 text-xs text-gray-500">Proses pertama dapat memerlukan waktu hingga 90 detik.</p>
              </div>
            </div>
          )}

          {!analyzing && aiResult && (
            <div className="p-5 border-b border-gray-100 space-y-3">
              <AdvisoryAssessment assessment={advisoryAssessment({ ...aiResult, evidence_source: 'server_ai' })} technical />
              <p className="text-sm text-slate-700">{AI_STATUS_INFO[aiResult.status].recommendation}</p>
              {!manualMode ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
                  <p className="text-xs text-amber-900">
                    Hasil AI belum pasti atau hama/kerusakan di sawah tidak terdeteksi model?
                  </p>
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shrink-0"
                  >
                    <FileWarning size={14} aria-hidden="true" />
                    Gunakan Laporan Manual
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Mode Laporan Manual aktif (penilaian petani, diverifikasi PPL).</span>
                  <button
                    type="button"
                    onClick={() => setManualMode(false)}
                    className="underline text-slate-700 hover:text-slate-900 font-medium"
                  >
                    Kembali ke Hasil AI
                  </button>
                </div>
              )}
            </div>
          )}

          {!analyzing && aiPending && !aiResult && !manualMode && (
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg">
                <Clock className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium">Menunggu Analisis AI</p>
                  <p className="mt-0.5 text-gray-600">
                    Anda sedang offline. Hasil AI akan otomatis terisi setelah laporan
                    tersinkron saat koneksi kembali.
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
                  <p className="font-medium">
                    {aiRetake ? 'Foto tidak dapat dianalisis' : 'AI tidak dapat menganalisis foto'}
                  </p>
                  <p className="mt-0.5">{aiError}</p>
                </div>
              </div>
              <AnalysisFailureActions retake={aiRetake} manualMode={manualMode}
                onRetake={() => fileInputRef.current?.click()} onRetry={() => { if (photo) void analyzePhoto(photo.blob) }}
                onManual={() => { cancelAnalysis(); setAnalyzing(false); setAiResult(null); setAiPending(false); setManualMode(true) }} />
            </div>
          )}

          {manualMode && (
            <div className="p-5 border-b border-gray-100 space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-amber-500" aria-hidden="true" />
                Laporan Manual
              </h3>
              <p className="text-sm text-gray-600">
                Pilih indikasi menurut pengamatan Anda. Ini penilaian pelapor, bukan hasil AI atau pengukuran luas rusak:
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
              <p className="text-xs text-amber-900">Perlu Verifikasi · REVIEW_REQUIRED. PPL/Dinas meninjau laporan; keputusan klaim ada pada penanggung.</p>
            </div>
          )}
        </div>
      )}

      {/* Form lengkapi laporan */}
      {photo && !analyzing && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
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
                    {l.name} — luas terdaftar {formatHectares(registeredArea(l.area_hectares))}
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
              {mapReady ? (
                <ScanMap
                  coords={coords}
                  onPick={(picked) => {
                    setCoords(picked)
                    if (!gpsSnapshot) setLocationStatus('manual_map_pin')
                  }}
                  polygon={selectedLahan ? (selectedLahan.polygon as Polygon) : null}
                />
              ) : (
                <div className="h-56 w-full bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                  Menyiapkan peta lokasi…
                </div>
              )}
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
              {selectedGeometry && !selectedGeometry.valid
                ? 'Batas lahan tersimpan belum valid; minta pendaftar/pengelola memeriksa batas sebelum mengirim.'
                : inBounds
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

          <p className="text-xs text-slate-600">Kirim laporan untuk ditinjau PPL/Dinas. Luas terdampak belum terverifikasi; pengiriman bukan persetujuan klaim AUTP.</p>
          <button
            onClick={handleSubmit}
            disabled={submitting || inBounds === false || selectedGeometry?.valid === false}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Mengirim laporan...
              </>
            ) : selectedGeometry && !selectedGeometry.valid ? (
              'Batas lahan perlu diperiksa'
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
          if (f) handleFile(f, 'camera_capture')
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
          if (f) handleFile(f, 'gallery_upload')
          e.target.value = ''
        }}
      />

      {/* Tabel Scan Terbaru (section F [BARU]) */}
      <ScanTerbaru />
      </div>

      {/* Panel Panduan Foto (desktop: kanan, mobile: card bawah) */}
      <PhotoGuide />
    </div>
  )
}
