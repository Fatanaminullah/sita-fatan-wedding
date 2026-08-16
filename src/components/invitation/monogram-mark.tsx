import Image from 'next/image'

/**
 * The animated monogram, for the public surfaces.
 *
 * Today this reveals the PNG: a raster cannot be line-drawn, so the gesture is
 * a soft wipe upward with a slow settle, which is the most a bitmap can do
 * without looking cheap.
 *
 * **This is the one file to change when the SVG export arrives.** Replace the
 * <Image> with the inline <svg>, give the frame and flourish paths
 * `stroke-dasharray`/`stroke-dashoffset`, and animate the offset to zero so the
 * line draws itself. The filled letterforms cannot draw; reveal those with the
 * same wipe already defined here, started slightly after the stroke so the two
 * read as one gesture. Everything else on the page can stay as it is.
 *
 * Motion respects `prefers-reduced-motion`: the brief requires every section to
 * render its end state and the site to be fully usable static.
 */
export function MonogramMark({
  size = 132,
  className = '',
  priority = false,
}: {
  size?: number
  className?: string
  priority?: boolean
}) {
  return (
    <div
      className={`monogram-mark ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src="/monogram.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </div>
  )
}
