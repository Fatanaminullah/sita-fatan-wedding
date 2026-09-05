'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'

/**
 * The commissioned monogram: the interlocked serif S and F.
 *
 * It exists only as a bitmap (`public/monogram-mark.png`, keyed to
 * transparent, oxblood ink; `-ivory` is the same alpha in ivory), so a true
 * stroke draw is not available. What moves is a conic mask: the ink appears
 * around the mark from twelve o'clock, holds, and on `loop` retreats the same
 * way and comes again, like a line being drawn and undrawn. The image itself
 * is never scaled, blurred or thickened.
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
      const state = { a: 0 }
      const apply = () => el.style.setProperty('--a', `${state.a}deg`)
      apply()
      const tl = gsap.timeline({
        delay,
        repeat: loop ? -1 : 0,
        onComplete: loop ? undefined : onDrawn,
      })
      tl.to(state, { a: 360, duration: 1.6, ease: 'power2.inOut', onUpdate: apply })
      if (loop) {
        tl.to({}, { duration: 0.5 }).to(state, { a: 0, duration: 1.4, ease: 'power2.inOut', onUpdate: apply }).to({}, { duration: 0.35 })
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
