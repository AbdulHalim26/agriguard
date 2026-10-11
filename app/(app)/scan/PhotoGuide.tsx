import { Lightbulb, Sun, ScanLine, Ruler } from 'lucide-react'

const TIPS = [
  {
    icon: Sun,
    title: 'Cahaya Alami',
    desc: 'Ambil foto di bawah sinar matahari, hindari bayangan gelap.',
  },
  {
    icon: ScanLine,
    title: 'Kamera Tegak Lurus',
    desc: 'Posisikan kamera tegak lurus di atas daun yang difoto.',
  },
  {
    icon: Ruler,
    title: 'Jarak 1–3 m',
    desc: 'Jaga jarak 1–3 meter agar daun tampak jelas dan penuh.',
  },
]

export default function PhotoGuide() {
  return (
    <aside className="bg-white rounded-2xl border border-gray-200 p-5 lg:sticky lg:top-20 h-fit">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Lightbulb size={18} className="text-[#ED6C02]" aria-hidden="true" /> Panduan Foto
      </h2>
      <ul className="space-y-4">
        {TIPS.map((t) => (
          <li key={t.title} className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <t.icon size={18} className="text-[#2E7D32]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{t.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
