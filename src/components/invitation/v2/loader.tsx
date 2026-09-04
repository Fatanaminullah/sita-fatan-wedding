'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'

/**
 * The monogram draws itself while the cover photograph and the fonts load.
 * Held for at least 1.6s so the draw is seen, never longer than 6s so a slow
 * connection is not held hostage by an image.
 */
export function Loader({
  coverSrc,
  onExitStart,
  onDone,
}: {
  coverSrc: string
  /** The curtain is starting to lift: begin what is behind it. */
  onExitStart: () => void
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const minimum = new Promise((r) => setTimeout(r, 1600))
    const ceiling = new Promise((r) => setTimeout(r, 6000))
    const img = new Image()
    img.src = coverSrc
    const photo = img.decode().catch(() => undefined)
    const fonts = document.fonts?.ready ?? Promise.resolve()
    Promise.race([Promise.all([minimum, photo, fonts]), ceiling]).then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [coverSrc])

  useGSAP(
    () => {
      gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 0.85, duration: 5, ease: 'power1.out' })
    },
    { scope: ref }
  )

  useGSAP(
    () => {
      if (!ready) return
      gsap
        .timeline({ onComplete: onDone })
        .to(bar.current, { scaleX: 1, duration: 0.3, ease: 'power2.out' })
        .call(onExitStart)
        .to(ref.current, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '+=0.1')
    },
    { scope: ref, dependencies: [ready, onExitStart, onDone] }
  )

  return (
    <div ref={ref} className="inv-loader" aria-busy={!ready} aria-label="Loading your invitation">
      <Monogram size={120} tone="oxblood" loop />
      <div ref={bar} className="inv-loader__bar" />
    </div>
  )
}
