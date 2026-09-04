'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED, ScrollTrigger } from '@/lib/invitation/gsap'
import { VOW_ROWS } from './content'

const RingScene = dynamic(() => import('./ring-scene'), { ssr: false })

/**
 * The lines scroll past as any text would, set enormous, each row split
 * either side of a gutter the ring occupies. The ring holds in the middle
 * of the screen while they pass, turning once, and leaves with the last
 * row. Nothing is pinned: the ring is sticky, the text is text.
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
  const ref = useRef<HTMLElement>(null)
  const progress = useRef(0)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '80% 0px 80% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        ScrollTrigger.create({
          trigger: ref.current,
          start: 'top 70%',
          end: 'bottom 30%',
          scrub: 0.6,
          onUpdate: (self) => {
            progress.current = self.progress
          },
        })
        gsap.to('.inv-vow__svgring', { rotateY: 360, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top 70%', end: 'bottom 30%', scrub: true } })
      })
      mm.add(MOTION_REDUCED, () => {
        progress.current = 0.3
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="vow" className="inv-vow" aria-label="Vow">
      <div className="inv-vow__sticky" aria-hidden>
        <div className="inv-vow__ring">
          {webgl ? (
            near ? <RingScene progress={progress} /> : null
          ) : (
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

      {/* Each row leaves a gutter in the middle for the ring, so the words
          read as pushed aside by it. */}
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
  )
}
