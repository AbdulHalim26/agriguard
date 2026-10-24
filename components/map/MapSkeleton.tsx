export default function MapSkeleton({
  className,
  label = 'Memuat peta…',
}: {
  className: string
  label?: string
}) {
  return (
    <div
      className={`w-full flex items-center justify-center rounded-xl border border-green-100 bg-gray-100 animate-pulse motion-reduce:animate-none ${className}`}
      role="status"
    >
      <span className="text-sm text-green-700">{label}</span>
    </div>
  )
}
