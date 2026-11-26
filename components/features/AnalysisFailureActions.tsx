import { Camera, FileWarning, RefreshCw } from 'lucide-react'

export default function AnalysisFailureActions({ retake, manualMode, onRetake, onRetry, onManual }: {
  retake: boolean; manualMode: boolean; onRetake: () => void; onRetry: () => void; onManual: () => void
}) {
  return <div className="space-y-3">
    <button type="button" onClick={retake ? onRetake : onRetry}
      className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
      {retake ? <Camera size={20} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" />}
      {retake ? 'Ambil Ulang Foto' : 'Coba Lagi'}
    </button>
    {!manualMode && <button type="button" onClick={onManual}
      className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 border border-amber-300 text-amber-900 bg-amber-50 rounded-lg hover:bg-amber-100">
      <FileWarning size={20} aria-hidden="true" />Gunakan Pelaporan Manual
    </button>}
    <p className="text-xs text-slate-600">AI yang belum berhasil bukan penolakan laporan. Bukti dan penilaian pelapor tetap perlu ditinjau PPL/Dinas.</p>
  </div>
}
