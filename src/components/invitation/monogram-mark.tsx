import Image from 'next/image'

/**
 * The monogram.
 *
 * Back to the bitmap. The traced-vector version drew and filled on a loop as
 * asked, but potrace could not hold the artwork's hairlines: at 128px the
 * frame doubled up and the letterforms went thick and smeared. A bad mark that
 * animates is worse than a crisp one that does not.
 *
 * `public/monogram-mark.png` is `monogram-bordered.png` with the blush field
 * keyed out and the ink re-tinted to oxblood, so it sits on the paper ground
 * with no visible tile. The key uses a dead zone below a distance of 55 to
 * discard the paper texture in the source scan, then ramps, so antialiased
 * edges stay soft rather than turning into a jagged cutout.
 *
 * A real line-draw needs real paths. If the designer can supply a genuine
 * vector export, not a bitmap in an <svg> wrapper, the looping draw becomes
 * possible again and only this file changes.
 */
export function MonogramMark({
  size = 128,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <span className={`monogram-mark ${className}`} style={{ width: size, height: size }}>
      <Image
        src="/monogram-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="h-full w-full object-contain"
      />
    </span>
  )
}
