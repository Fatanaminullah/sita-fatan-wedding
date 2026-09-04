'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { VOW_LINES } from './content'

const RingScene = dynamic(() => import('./ring-scene'), { ssr: false })

/**
 * Four lines set enormous, sliding at their own rates behind a turning ring.
 * Pinned for three screens of scroll.
 *
 * The ring is mounted only while the section is near, and only on devices
 * that can carry it. Everyone else gets a drawn ring in SVG that still turns,
 * which is the same idea at a hundredth of the cost.
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
  const ringRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: '120% 0px 120% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: ref.current,
            start: 'top top',
            end: '+=300%',
            pin: true,
            scrub: 0.8,
            onUpdate: (self) => {
              progress.current = self.progress
            },
          },
        })
        const lines = gsap.utils.toArray<HTMLElement>('.inv-vow__line')
        lines.forEach((line, i) => {
          const dir = i % 2 === 0 ? 1 : -1
          tl.fromTo(
            line,
            { xPercent: dir * 28, opacity: 0.15 },
            { xPercent: dir * -28, opacity: 1, ease: 'none' },
            0
          )
        })
        tl.fromTo(ringRef.current, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, ease: 'power2.out', duration: 0.25 }, 0)
          .to(ringRef.current, { scale: 1.08, ease: 'none', duration: 0.75 }, 0.25)
        // The SVG fallback turns too.
        tl.to('.inv-vow__svgring', { rotateY: 720, ease: 'none', duration: 1 }, 0)
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set('.inv-vow__line', { opacity: 1, xPercent: 0 })
        gsap.set(ringRef.current, { opacity: 1, scale: 1 })
        progress.current = 0.35
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="vow" className="inv-vow" aria-label="Vow">
      <div className="inv-vow__lines" aria-hidden>
        {VOW_LINES.map((l, i) => (
          <div key={i} className="inv-vow__line inv-display">
            {l}
          </div>
        ))}
      </div>
      <p className="sr-only">{VOW_LINES.join(' ')}</p>

      <div ref={ringRef} className="inv-vow__ring">
        {webgl && near ? (
          <RingScene progress={progress} />
        ) : !webgl ? (
          <svg className="inv-vow__svgring" viewBox="0 0 200 200" width="100%" height="100%" aria-hidden style={{ transformStyle: 'preserve-3d' }}>
            <defs>
              <linearGradient id="goldgrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f0d78a" />
                <stop offset="0.5" stopColor="#c9a24b" />
                <stop offset="1" stopColor="#7d5f1e" />
              </linearGradient>
            </defs>
            <ellipse cx="100" cy="100" rx="78" ry="78" fill="none" stroke="url(#goldgrad)" strokeWidth="26" />
            <ellipse cx="100" cy="100" rx="78" ry="78" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
          </svg>
        ) : null}
      </div>
    </section>
  )
}
