'use client'

import { useRef } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { MONOGRAM_BORDERED } from './monogram-paths'

/**
 * The commissioned monogram, drawn: a hairline runs along every path of the
 * mark, the ink fills in behind it, and on `loop` the ink lifts and the
 * line retreats before it all comes again. Same idea as a stroke-draw on an
 * icon, on the designer's own paths (F&S.pdf out of Illustrator).
 *
 * The resting state is fill only, exactly the artwork. The stroke exists
 * for the draw and fades out with it; nothing is thickened.
 *
 * The mark's own box inside the 2000-unit page is 521,361 to 1479,1639,
 * so the viewBox is tightened to that with a small margin.
 */
const BOX = '505 345 990 1310'

export function Monogram({
  size = 160,
  tone = 'oxblood',
  loop = false,
  delay = 0,
  className = '',
  onDrawn,
  onCycle,
}: {
  size?: number
  tone?: 'oxblood' | 'ivory'
  loop?: boolean
  delay?: number
  className?: string
  onDrawn?: () => void
  /** loop only: fired each time a draw-and-undraw completes, with the count. */
  onCycle?: (count: number) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const color = tone === 'ivory' ? '#F7F3EC' : '#5E040E'

  useGSAP(
    () => {
      const paths = gsap.utils.toArray<SVGPathElement>('path', ref.current)
      if (paths.length === 0) return
      let cycles = 0
      const tl = gsap.timeline({
        delay,
        repeat: loop ? -1 : 0,
        onComplete: loop ? undefined : onDrawn,
        onRepeat: () => {
          cycles++
          onCycle?.(cycles)
        },
      })
      // The line runs along every path at once; the frame and the letters
      // arrive together as one hand lifting off the page. One cycle is
      // about three seconds: drawn, filled, held, lifted, undrawn.
      // The hairline traces the outline, then hands over to the fill in one
      // crossfade: as the ink comes in, the line goes out. The held state is
      // fill only, so the mark is never heavier than the artwork.
      tl.fromTo(paths, { drawSVG: '0% 0%', fillOpacity: 0, strokeOpacity: 1 }, { drawSVG: '0% 100%', duration: 1.3, ease: 'power2.inOut' })
        .to(paths, { fillOpacity: 1, duration: 0.55, ease: 'power2.out' }, '-=0.2')
        .to(paths, { strokeOpacity: 0, duration: 0.55, ease: 'power2.out' }, '<')
      if (loop) {
        tl.to({}, { duration: 0.5 })
          .to(paths, { strokeOpacity: 1, duration: 0.4, ease: 'power2.in' })
          .to(paths, { fillOpacity: 0, duration: 0.4, ease: 'power2.in' }, '<')
          .to(paths, { drawSVG: '0% 0%', duration: 1.0, ease: 'power2.inOut' }, '-=0.05')
          .to({}, { duration: 0.2 })
      }
    },
    { scope: ref, dependencies: [loop, onCycle] }
  )

  return (
    <svg
      ref={ref}
      viewBox={BOX}
      width={size}
      height={size * (1310 / 990)}
      className={className}
      role="img"
      aria-label="S and F monogram"
      style={{ color, overflow: 'visible', display: 'block' }}
    >
      {MONOGRAM_BORDERED.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="currentColor"
          fillOpacity={0}
          fillRule="nonzero"
          stroke="currentColor"
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
