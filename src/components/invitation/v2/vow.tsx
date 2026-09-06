'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED, ScrollTrigger } from '@/lib/invitation/gsap'
import { VOW_ROWS } from './content'
import { ringY, type RingAnchor } from './ring-scene'

const loadRing = () => import('./ring-scene')
const RingScene = dynamic(loadRing, { ssr: false })

/**
 * The section holds the screen. The words rise into place as it sticks;
 * then the ring falls from above the top edge, through the rows, out past
 * the bottom, turning as it goes, and the hold ends the moment it is gone.
 * The row it is in parts to let it through and closes again behind it.
 *
 * The ring is mounted only while the section is near, and only on devices
 * that can carry it. Everyone else gets a drawn ring in SVG that still turns.
 */
function canRunWebGL() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number }
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return false
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function Vow() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const anchor = useRef<RingAnchor>({ size: 0 })
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // The chunk starts downloading now, while the guest is still on the
    // verse, so the ring is there on the first scroll and not a second
    // later. The canvas itself mounts screens ahead.
    if (webgl) void loadRing()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '200% 0px 250% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  useGSAP(
    () => {
      const wrap = wrapRef.current
      const section = ref.current
      const ringEl = ringRef.current
      if (!wrap || !section || !ringEl) return
      const rows = gsap.utils.toArray<HTMLElement>('.inv-vow__row')
      if (rows.length === 0) return

      /**
       * The ring's centre on screen for a given progress; the row it is in
       * opens a gap for it (--push, 0 to 1), the others close up again once
       * it has passed. Everything is measured on screen, since the section
       * is stuck to it.
       */
      const place = (p: number) => {
        const ring = ringEl.offsetWidth
        const wh = window.innerHeight
        // The band itself is narrower than its box; rows open for the band.
        const ringR = ring * 0.46
        const y = ringY(p, ring, wh)
        anchor.current = { size: ring }
        // The DOM box only carries the SVG fallback now; the WebGL ring reads
        // the anchor and stays in its own unmoving canvas.
        ringEl.style.transform = `translate(-50%, -50%) translateY(${y}px)`
        for (const row of rows) {
          const r = row.getBoundingClientRect()
          const rc = r.top + r.height / 2
          const d = Math.abs(rc - y)
          // Fully open while the band overlaps the row, closing over the
          // next half row beyond it.
          const push = Math.max(0, Math.min(1, 1 - (d - (ringR + r.height * 0.3)) / (r.height * 0.6)))
          row.style.setProperty('--push', push.toFixed(3))
        }
      }

      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        // The words rise out of their rows, each row a clipped slot, as the
        // section takes the screen; they sink back if the guest returns.
        gsap.from(section.querySelectorAll('.inv-vow__half'), {
          yPercent: 115,
          duration: 1.1,
          ease: 'power4.out',
          stagger: { each: 0.06, from: 'start' },
          scrollTrigger: { trigger: wrap, start: 'top 40%', toggleActions: 'play none none reverse' },
        })
        ScrollTrigger.create({
          trigger: wrap,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => {
            progress.current = self.progress
            place(self.progress)
          },
          onRefresh: (self) => place(self.progress),
        })
        gsap.to('.inv-vow__svgring', {
          rotateY: 720,
          ease: 'none',
          scrollTrigger: { trigger: wrap, start: 'top top', end: 'bottom bottom', scrub: true },
        })
      })
      mm.add(MOTION_REDUCED, () => {
        progress.current = 0.5
        place(0.5)
      })
    },
    { scope: wrapRef }
  )

  return (
    <div ref={wrapRef} className="inv-vow-wrap">
      <section ref={ref} id="vow" className="inv-vow" aria-label="Vow">
        {webgl ? (
          <div className="inv-vow__stage" aria-hidden>
            {near ? <RingScene progress={progress} anchor={anchor} wrap={wrapRef} /> : null}
          </div>
        ) : null}
        <div ref={ringRef} className="inv-vow__ring" aria-hidden>
          <div className="inv-vow__ring-inner">
            {webgl ? null : (
              <svg className="inv-vow__svgring" viewBox="0 0 200 200" width="100%" height="100%" style={{ transformStyle: 'preserve-3d' }}>
                <defs>
                  <linearGradient id="silvergrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.5" stopColor="#d9d9de" />
                    <stop offset="1" stopColor="#8e8e96" />
                  </linearGradient>
                </defs>
                <ellipse cx="100" cy="100" rx="70" ry="70" fill="none" stroke="url(#silvergrad)" strokeWidth="16" />
                <rect x="86" y="18" width="28" height="34" rx="3" fill="#fff" stroke="#c9c9cf" strokeWidth="2" />
              </svg>
            )}
          </div>
        </div>

        {/* Each row can part in the middle for the ring, so the words read as
            pushed aside by it and closing behind it. */}
        <div className="inv-vow__lines" aria-hidden>
          {VOW_ROWS.map(([l, r], i) => (
            <div key={i} className="inv-vow__row">
              <span className="inv-vow__half inv-vow__half--l inv-display">{l}</span>
              <span className="inv-vow__gutter" />
              <span className="inv-vow__half inv-vow__half--r inv-display">{r}</span>
            </div>
          ))}
        </div>
        <p className="sr-only">{VOW_ROWS.map((r) => r.join(' ')).join(' ')}</p>
      </section>
    </div>
  )
}
