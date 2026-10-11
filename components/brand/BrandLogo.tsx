import Image from 'next/image'

type Variant = 'color' | 'white'
type Size = 'sm' | 'md' | 'lg'

const LOGO_HEIGHT: Record<Size, number> = { sm: 32, md: 40, lg: 72 }

// Catatan: file logo (logo.png / logo-white.png) SUDAH memuat daun + teks
// "AgriGuard", jadi komponen ini TIDAK boleh menambahkan teks lagi (agar tidak
// tampil dobel). Untuk kebutuhan logo tanpa teks (ikon saja), pakai iconOnly
// -> icons/icon-512.png.
export default function BrandLogo({
  variant = 'color',
  size = 'md',
  iconOnly = false,
  className = '',
}: {
  variant?: Variant
  size?: Size
  iconOnly?: boolean
  className?: string
}) {
  const height = LOGO_HEIGHT[size]
  const src = iconOnly
    ? '/icons/icon-512.png'
    : variant === 'white'
      ? '/logo-white.png'
      : '/logo.png'

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={src}
        alt="AgriGuard"
        width={height}
        height={height}
        className="object-contain"
        style={{ height, width: 'auto' }}
        priority
      />
    </span>
  )
}
