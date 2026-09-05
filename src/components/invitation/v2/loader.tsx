'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { preloadInvitation } from './preload'

/**
 * The monogram draws and undraws itself while the invitation loads: fonts,
 * the photographs, the first gallery textures and the three.js chunks. The
 * splash leaves only at the end of a cycle, and never before the second one
 * has completed, so the draw is always seen whole, twice. A 12s ceiling
 * still lets a slow connection through.
 *
 * The percentage is honest about the assets but paced to the cycles: it
 * climbs steadily over the two cycles and only ever waits on the assets.
 */
const CYCLES = 2
const PACE_MS = 6400

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
  const assets = useRef(0)
  const assetsDone = useRef(false)
  const cycles = useRef(0)
  const started = useRef(0)

  useEffect(() => {
    let alive = true
    started.current = performance.now()
    preloadInvitation((done, total) => {
      assets.current = done / total
    }).finally(() => {
      assetsDone.current = true
    })
    const tick = () => {
      if (!alive) return
      const paced = Math.min(1, (performance.now() - started.current) / PACE_MS)
      // Never ahead of the assets by more than the pace allows; never behind
      // them once they are in.
      const shown = assetsDone.current ? Math.max(paced, assets.current) : Math.min(paced, Math.max(assets.current, paced * 0.92))
      setPct(Math.round(shown * 100))
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    const ceiling = window.setTimeout(() => {
      if (alive) setReady(true)
    }, 12000)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(ceiling)
    }
  }, [])

  // Leave on a cycle boundary, once the assets are in and two cycles have run.
  const onCycle = useCallback((n: number) => {
    cycles.current = n
    if (n >= CYCLES && assetsDone.current) setReady(true)
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
      <Monogram size={120} tone="oxblood" loop onCycle={onCycle} />
      <p className="inv-label inv-loader__pct" aria-live="polite">
        {ready ? 100 : Math.min(pct, 99)}%
      </p>
      <div ref={bar} className="inv-loader__bar" style={{ transform: `scaleX(${ready ? 1 : pct / 100})` }} />
    </div>
  )
}
