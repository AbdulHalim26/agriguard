import { AREA_METHOD, type assessLandGeometry } from '@/lib/land/geometry'

const decimal = (value: number | null, digits = 4) => value === null || !Number.isFinite(value)
  ? 'Belum tersedia' : new Intl.NumberFormat('id-ID', value !== 0 && Math.abs(value) < 10 ** -digits
    ? { maximumSignificantDigits: 6 } : { maximumFractionDigits: digits }).format(value)

export default function LandGeometrySummary({ assessment }: { assessment: ReturnType<typeof assessLandGeometry> }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1" data-geometry-verification="UNVERIFIED">
    <p className="font-semibold">{assessment.geometry.valid ? 'Struktur geometri valid — belum diverifikasi' : 'Batas perlu diperbaiki / diperiksa'}</p>
    {!assessment.geometry.valid && <p role="status">{assessment.geometry.errors[0]?.message} ({assessment.geometry.errors[0]?.code})</p>}
    <p>Luas deklarasi: {decimal(assessment.declared_area_hectares)} ha.</p>
    <p>Luas hitung geografis: {decimal(assessment.computed_area_hectares)} ha ({decimal(assessment.computed_area_square_meters, 2)} m²).</p>
    <p>Selisih hitung − deklarasi: {decimal(assessment.area_difference_hectares)} ha. Selisih bukan bukti pelanggaran.</p>
    <p>Model WGS84 ellipsoid / GeographicLib. Nilai deklarasi tidak diganti otomatis.</p>
    <p>UNVERIFIED — bukan hasil survei, verifikasi hak lahan, atau pengukuran luas terdampak.</p>
    <details><summary className="cursor-pointer py-1">Metode hitung</summary><p className="break-all">{AREA_METHOD}</p></details>
  </div>
}
