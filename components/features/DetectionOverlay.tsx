'use client'

import { useState } from 'react'
import { boxPercentages, imageDimensionsMatch, interpretDetectionClass, type DetectionResponse, type ObjectDetection } from '@/lib/detection'

const COLORS = ['#b45309', '#c2410c', '#7e22ce', '#15803d', '#0e7490', '#b91c1c', '#1d4ed8', '#be185d', '#a16207']

export function DetectionBoxLayer({ detections, width, height }: { detections: ObjectDetection[]; width: number; height: number }) {
  return <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
    {detections.map((detection, index) => {
      const box = boxPercentages(detection.bbox_xyxy, width, height)
      const color = COLORS[detection.class_id % COLORS.length]
      return <div key={index} className="absolute border-2" style={{
        left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, borderColor: color,
      }}>
        <span className="absolute left-0 top-0 text-white text-[10px] sm:text-xs px-1 max-w-full truncate" style={{ backgroundColor: color }}>
          {detection.class_name.replaceAll('_', ' ')} · {Math.round(detection.confidence * 100)}%
        </span>
      </div>
    })}
  </div>
}

export default function DetectionOverlay({ imageSrc, result }: { imageSrc: string; result: DetectionResponse }) {
  const [loaded, setLoaded] = useState<{ src: string; width: number; height: number } | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const sameSource = loaded?.src === imageSrc
  const matches = sameSource && imageDimensionsMatch(loaded.width, loaded.height, result.image_width, result.image_height)
  const showBoxes = result.inference_status !== 'UNSUPPORTED_IMAGE' && matches && failedSrc !== imageSrc
  return <div>
    <div className="w-full bg-slate-950 flex items-center justify-center">
      <div
        className="relative overflow-hidden bg-slate-950"
        style={{
          aspectRatio: `${result.image_width} / ${result.image_height}`,
          width: `min(100%, calc(min(42vh, 280px) * ${result.image_width} / ${result.image_height}))`,
        }}
      >
        {/* Same EXIF-normalized compressed Blob is displayed, detected and reported. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="Foto padi dengan lokasi objek hasil deteksi YOLO" decoding="async" className="absolute inset-0 w-full h-full object-contain"
          onLoad={(event) => setLoaded({ src: imageSrc, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailedSrc(imageSrc)} />
        {showBoxes && <DetectionBoxLayer detections={result.detections} width={result.image_width} height={result.image_height} />}
      </div>
    </div>
    {(failedSrc === imageSrc || (sameSource && !matches)) && <p role="alert" className="p-3 text-sm text-red-700">
      Dimensi foto tidak cocok atau foto gagal dimuat. Kotak deteksi tidak ditampilkan untuk mencegah posisi yang salah.
    </p>}
  </div>
}

export function DetectionPanel({
  result,
  loading,
  error,
  suppressedByClassifier = false,
}: {
  result: DetectionResponse | null
  loading: boolean
  error: string | null
  suppressedByClassifier?: boolean
}) {
  const unsupported = result?.inference_status === 'UNSUPPORTED_IMAGE' || suppressedByClassifier
  return <section aria-label="Deteksi objek YOLO" className="p-4 sm:p-5 border-b border-gray-100 space-y-2">
    <h3 className="font-semibold text-gray-900">Deteksi penyakit & kerusakan (YOLO)</h3>
    {loading && <p role="status" className="text-sm text-gray-600">Menganalisis lokasi objek…</p>}
    {error && !unsupported && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {unsupported ? (
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-1.5 text-sm text-amber-950">
        <span className="inline-block rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-semibold text-amber-950">
          UNSUPPORTED_IMAGE — foto di luar domain padi
        </span>
        <p>
          Foto tidak tampak sebagai tanaman padi yang layak dianalisis. Kotak deteksi penyakit tidak ditampilkan untuk mencegah hasil yang menyesatkan.
        </p>
        <p className="text-xs text-amber-900">
          Silakan ambil ulang foto daun/tanaman padi yang jelas, atau gunakan Pelaporan Manual jika memang terjadi kerusakan di sawah.
        </p>
      </div>
    ) : result && <>
      <p className="text-xs text-gray-500">{result.model_family} · {result.model_version} · {result.image_width} × {result.image_height}</p>
      <span className="inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">REVIEW_REQUIRED — perlu tinjauan PPL</span>
      {result.detections.length === 0 ? <p className="text-sm text-gray-700">Tidak ada objek terdeteksi. Kondisi sehat belum dapat disimpulkan — ini <strong>bukan bukti tanaman sehat</strong> atau bebas hama/penyakit di luar kelas model; gunakan Laporan Manual bila terlihat gejala di lapangan.</p> :
        <ul className="space-y-1 text-sm text-gray-700">{result.detections.map((item, index) => {
          const info = interpretDetectionClass(item.class_name)
          return <li key={index} className="flex flex-wrap items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[item.class_id % COLORS.length] }} aria-hidden="true" />
            <span className="font-medium">{item.class_name.replaceAll('_', ' ')}</span>
            <span>· {Math.round(item.confidence * 100)}% keyakinan · {item.annotation_level === 'lesion' ? 'lesi' : 'daun'}</span>
            {info.kind === 'healthy_indicator' && (
              <span className="text-xs text-green-700">(bukan bukti kerusakan)</span>
            )}
          </li>
        })}</ul>}
      <p className="text-xs text-gray-500">Persentase kerusakan belum dihitung. Luas kotak bukan luas jaringan yang benar-benar rusak.</p>
    </>}
    <p className="text-xs text-gray-500">Pratinjau deteksi tidak menggantikan receipt laporan. Severity legacy (EfficientNet) dan penilaian manual tetap diproses terpisah.</p>
  </section>
}
