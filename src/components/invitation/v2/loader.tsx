'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { preloadInvitation } from './preload'
import { useCopy } from './lang'

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
const PACE_MS = 5600

export function Loader({
  candid,
  hideHandHolding,
  onExitStart,
  onDone,
}: {
  /** Which couple frame to fetch ahead: the home one or the bar one. */
  candid: boolean
  /** Warms the same four the tunnel will ask for, which is not the same four
      for a guest whose gallery is shorter. */
  hideHandHolding: boolean
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
  const c = useCopy()

  useEffect(() => {
    let alive = true
    started.current = performance.now()

    const tick = () => {
      if (!alive) return
      const paced = Math.min(1, (performance.now() - started.current) / PACE_MS)
      // Climbs with the cycles; if the assets are slower than the pace, it
      // waits on them instead of lying.
      const shown = assetsDone.current ? paced : Math.min(paced, assets.current)
      setPct(Math.round(shown * 100))
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    const ceiling = window.setTimeout(() => {
      if (alive) setReady(true)
    }, 12000)

    /*
     * Started only once the frame loop and the ceiling above are running.
     *
     * preloadInvitation can throw where it stands rather than reject: it
     * reaches for browser APIs an old Android WebView may not have, and one
     * missing method takes the whole call down synchronously. When that
     * happened here first, the throw left the effect before either safety net
     * was armed, so the bar sat at its initial 0 with nothing left running to
     * move it or to give up. A guest on 23 September saw exactly that.
     *
     * The preload is an optimisation. Nothing on the page needs it to have
     * succeeded, so a failure is treated as finished: the walk opens on the
     * pace, with its images arriving a moment late instead of ahead.
     */
    try {
      preloadInvitation(candid, hideHandHolding, (done, total) => {
        assets.current = done / total
      })
        .catch(() => undefined)
        .finally(() => {
          assetsDone.current = true
        })
    } catch {
      assetsDone.current = true
    }
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(ceiling)
    }
  }, [candid, hideHandHolding])

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
    <div ref={ref} className="inv-loader" aria-busy={!ready} aria-label={c.chrome.loading}>
      <Monogram size={120} tone="oxblood" loop frozen={ready} onCycle={onCycle} />
      <p className="inv-label inv-loader__pct" aria-live="polite">
        {ready ? 100 : Math.min(pct, 99)}%
      </p>
      <div ref={bar} className="inv-loader__bar" style={{ transform: `scaleX(${ready ? 1 : pct / 100})` }} />
    </div>
  )
}
