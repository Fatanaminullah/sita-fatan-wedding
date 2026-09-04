'use client'

import { useEffect, useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { CLOSING, COUPLE, WEDDING_DATE } from './content'
import { INK } from './theme'

/**
 * Gold dust on charcoal, drifting. Canvas 2D, a few hundred points, no
 * library. Paused when the section is off screen and skipped entirely for
 * guests who asked for less motion.
 */
function Dust() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; t: number }
    let pts: P[] = []
    const seed = () => {
      const count = Math.min(520, Math.floor((w * h) / 2600))
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.05 - Math.random() * 0.18,
        a: 0.2 + Math.random() * 0.6,
        t: Math.random() * Math.PI * 2,
      }))
    }
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let running = false
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.t += 0.01
        p.x += p.vx + Math.sin(p.t) * 0.08
        p.y += p.vy
        if (p.y < -4) {
          p.y = h + 4
          p.x = Math.random() * w
        }
        if (p.x < -4) p.x = w + 4
        if (p.x > w + 4) p.x = -4
        const tw = 0.6 + 0.4 * Math.sin(p.t * 3)
        ctx.globalAlpha = p.a * tw
        ctx.fillStyle = INK.gold
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (running) raf = requestAnimationFrame(draw)
    }
    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting
      if (running) raf = requestAnimationFrame(draw)
      else cancelAnimationFrame(raf)
    })
    io.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="inv-closing__dust" aria-hidden />
}

export function Closing({ pending, onRsvp }: { pending: boolean; onRsvp: () => void }) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-closing__stack > *', {
          y: 30,
          opacity: 0,
          duration: 1.2,
          ease: 'power3.out',
          stagger: 0.12,
          scrollTrigger: { trigger: ref.current, start: 'top 60%' },
        })
      })
    },
    { scope: ref }
  )

  return (
    <footer ref={ref} id="closing" className="inv-section inv-closing" aria-label="Closing">
      <Dust />
      <div className="inv-column inv-closing__stack" style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: '1.5rem' }}>
        <Monogram size={110} tone="ivory" loop />
        <h2 className="inv-closing__names inv-display">
          {COUPLE.bride.short}
          <span className="amp">and</span>
          {COUPLE.groom.short}
        </h2>
        <p className="inv-label" style={{ opacity: 0.75 }}>
          {WEDDING_DATE.long}
        </p>
        <p className="inv-body" style={{ opacity: 0.8, maxWidth: '22rem' }}>
          {CLOSING.thanks}
        </p>
        {pending ? (
          <button type="button" className="inv-btn inv-btn--ghost inv-btn--light" onClick={onRsvp}>
            Reply to the invitation
          </button>
        ) : null}
        <p className="inv-label" style={{ opacity: 0.45, marginTop: '1rem', fontSize: '0.6rem', letterSpacing: '0.2em' }}>
          {COUPLE.hashtag}
        </p>
      </div>
    </footer>
  )
}
