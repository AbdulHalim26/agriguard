export default function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="max-w-5xl mx-auto space-y-6" role="status" aria-live="polite">
      <p className="sr-only">Memuat {label}…</p>
      <div className="space-y-6 animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div className="space-y-3">
          <div className="h-7 w-48 rounded-lg bg-gray-200" />
          <div className="h-4 w-2/3 max-w-sm rounded bg-gray-100" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((card) => (
            <div key={card} className="rounded-2xl border border-green-100 bg-white p-5 space-y-4">
              <div className="h-10 w-10 rounded-xl bg-green-50" />
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-48 rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  )
}
