'use client'

import { useRef } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { MONOGRAM_PATH, MONOGRAM_VIEWBOX } from './monogram-path'

/**
 * The commissioned monogram as a real vector: the outline draws itself along
 * the path, then the ink fills. `loop` keeps redrawing (the loader and the
 * closing), otherwise it draws once and rests.
 *
 * The artwork is a single compound path with thirteen subpaths, so DrawSVG
 * advances every subpath in step: rings, S and F all arrive together, which
 * reads as one hand lifting off the page rather than a queue of parts.
 */
export function Monogram({
  size = 160,
  color = 'currentColor',
  loop = false,
  delay = 0,
  className = '',
  onDrawn,
}: {
  size?: number
  color?: string
  loop?: boolean
  delay?: number
  className?: string
  onDrawn?: () => void
}) {
  const ref = useRef<SVGSVGElement>(null)

  useGSAP(
    () => {
      const path = ref.current?.querySelector('path')
      if (!path) return
      const tl = gsap.timeline({
        delay,
        repeat: loop ? -1 : 0,
        repeatDelay: loop ? 1.6 : 0,
        onComplete: loop ? undefined : onDrawn,
      })
      tl.fromTo(
        path,
        { drawSVG: '0%', fillOpacity: 0 },
        { drawSVG: '100%', duration: 2.2, ease: 'power2.inOut' }
      )
        .to(path, { fillOpacity: 1, duration: 0.9, ease: 'power2.out' }, '-=0.5')
      if (loop) {
        tl.to(path, { fillOpacity: 0, duration: 0.6, ease: 'power2.in' }, '+=0.8').to(
          path,
          { drawSVG: '100% 100%', duration: 1.2, ease: 'power2.inOut' },
          '-=0.3'
        )
      }
    },
    { scope: ref, dependencies: [loop] }
  )

  return (
    <svg
      ref={ref}
      viewBox={MONOGRAM_VIEWBOX}
      width={size}
      height={size * 1.414}
      className={className}
      aria-label="S and F monogram"
      role="img"
      style={{ color, overflow: 'visible' }}
    >
      <path
        d={MONOGRAM_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
