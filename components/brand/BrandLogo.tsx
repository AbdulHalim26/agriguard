import Image from 'next/image'

type Variant = 'color' | 'white'
type Size = 'sm' | 'md' | 'lg'

const LOGO_HEIGHT: Record<Size, number> = { sm: 32, md: 40, lg: 72 }
const TEXT_CLASS: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
}

export default function BrandLogo({
  variant = 'color',
  size = 'md',
  showText = true,
  className = '',
}: {
  variant?: Variant
  size?: Size
  showText?: boolean
  className?: string
}) {
  const height = LOGO_HEIGHT[size]
  const src = variant === 'white' ? '/logo-white.png' : '/logo.png'
  const textColor = variant === 'white' ? 'text-white' : 'text-[#2E7D32]'

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src={src}
        alt="AgriGuard"
        width={height}
        height={height}
        className="object-contain"
        style={{ height, width: 'auto' }}
        priority
      />
      {showText && (
        <span className={`font-bold ${TEXT_CLASS[size]} ${textColor}`}>AgriGuard</span>
      )}
    </span>
  )
}
