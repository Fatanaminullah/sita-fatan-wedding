import Image from 'next/image'

/**
 * The couple's monogram, the same artwork as the browser icon and the link
 * preview. The bone field is baked into the PNG rather than being a CSS
 * background, so the tile reads as a stamp on the card surface instead of a
 * cropped logo. Decorative wherever a text label sits beside it, hence the
 * empty alt in that case.
 */
export function Monogram({
  size = 32,
  className = '',
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <Image
      src="/monogram.png"
      alt={alt}
      width={size}
      height={size}
      priority
      className={`shrink-0 rounded-md ${className}`}
    />
  )
}
