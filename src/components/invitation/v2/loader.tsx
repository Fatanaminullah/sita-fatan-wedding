'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { preloadInvitation } from './preload'

/**
 * The monogram draws itself while the invitation loads: fonts, the
 * photographs, the first gallery textures and the three.js chunks, counted
 * as a percentage. Held for at least 1.6s so the draw is seen, never longer
 * than 12s so a slow connection is not held hostage.
 */
export function Loader({
  onExitStart,
  onDone,
}: {
  /** The curtain is starting to lift: begin what is behind it. */
  onExitStart: () => void
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [pct, setPct] = useState(0)

  useEffect(() => {
    let alive = true
    const minimum = new Promise((r) => setTimeout(r, 1600))
    const ceiling = new Promise((r) => setTimeout(r, 12000))
    const assets = preloadInvitation((done, total) => {
      if (alive) setPct(Math.round((done / total) * 100))
    })
    Promise.race([Promise.all([minimum, assets]), ceiling]).then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

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
      <p className="inv-label inv-loader__pct" aria-live="polite">
        {Math.min(ready ? 100 : pct, 100)}%
      </p>
      <div ref={bar} className="inv-loader__bar" style={{ transform: `scaleX(${ready ? 1 : pct / 100})` }} />
    </div>
  )
}
