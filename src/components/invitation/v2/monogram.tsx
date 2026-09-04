'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'

/**
 * The commissioned monogram: the interlocked serif S and F.
 *
 * It exists only as a bitmap (`public/monogram-mark.png`, keyed to
 * transparent, oxblood ink; `-ivory` is the same alpha in ivory). The
 * supplied SVG is a PNG in a wrapper with no paths, and tracing it lost the
 * hairlines, so a true line-draw is off the table until a real vector
 * arrives. What animates here is the ink: a soft edge sweeps down the mark
 * and fills it in, then, if `loop`, lifts away and comes back.
 */
export function Monogram({
  size = 160,
  tone = 'oxblood',
  loop = false,
  delay = 0,
  className = '',
  onDrawn,
}: {
  size?: number
  tone?: 'oxblood' | 'ivory'
  loop?: boolean
  delay?: number
  className?: string
  onDrawn?: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const state = { p: -18 }
      const apply = () => el.style.setProperty('--p', `${state.p}%`)
      apply()
      const tl = gsap.timeline({
        delay,
        repeat: loop ? -1 : 0,
        repeatDelay: loop ? 1.4 : 0,
        onComplete: loop ? undefined : onDrawn,
      })
      tl.to(state, { p: 118, duration: 2.0, ease: 'power2.inOut', onUpdate: apply })
      if (loop) {
        tl.to(el, { opacity: 0, duration: 0.7, ease: 'power2.in' }, '+=0.9').set(state, { p: -18, onUpdate: apply }).set(el, { opacity: 1 })
      }
    },
    { scope: ref, dependencies: [loop] }
  )

  return (
    <span
      ref={ref}
      className={`inv-monogram ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="S and F monogram"
    >
      <Image src={tone === 'ivory' ? '/monogram-mark-ivory.png' : '/monogram-mark.png'} alt="" width={size} height={size} priority />
    </span>
  )
}
