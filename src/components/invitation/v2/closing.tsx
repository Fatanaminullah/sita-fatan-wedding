'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { CLOSING, COUPLE, WEDDING_DATE } from './content'
import { PHOTOS } from './photos'
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

/**
 * The last page. On a desk it is a spread: the words on the left, the two
 * of them on the right, each in their own night portrait, the frames
 * drifting at different speeds. The names are set as one line, as large
 * as the column allows, and the hashtag is set exactly as written: the
 * capitals are the names. On a phone the portraits sit above the words.
 */
export function Closing({ pending, onRsvp }: { pending: boolean; onRsvp: () => void }) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-closing__words > *', {
          y: 30,
          opacity: 0,
          duration: 1.2,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 55%' },
        })
        gsap.from('.inv-closing__frame', {
          y: 80,
          opacity: 0,
          duration: 1.4,
          ease: 'power3.out',
          stagger: 0.15,
          scrollTrigger: { trigger: ref.current, start: 'top 65%' },
        })
        // The two frames climb at different rates, so the pair breathes.
        gsap.fromTo(
          '.inv-closing__frame--a',
          { yPercent: 6 },
          { yPercent: -6, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true } }
        )
        gsap.fromTo(
          '.inv-closing__frame--b',
          { yPercent: 12 },
          { yPercent: -3, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true } }
        )
      })
    },
    { scope: ref }
  )

  return (
    <footer ref={ref} id="closing" className="inv-closing" aria-label="Closing">
      <Dust />
      <div className="inv-closing__grid">
        <div className="inv-closing__portraits" aria-hidden>
          <div className="inv-closing__frame inv-closing__frame--a">
            <Image src={PHOTOS.brideNightWide.src} alt="" fill sizes="(min-width: 900px) 25vw, 50vw" quality={85} />
          </div>
          <div className="inv-closing__frame inv-closing__frame--b">
            <Image src={PHOTOS.groomNight.src} alt="" fill sizes="(min-width: 900px) 25vw, 50vw" quality={85} />
          </div>
        </div>

        <div className="inv-closing__words">
          <Monogram size={72} tone="ivory" loop />
          <p className="inv-closing__thanks inv-display">{CLOSING.thanks}</p>
          <h2 className="inv-closing__names inv-display">
            {COUPLE.bride.short} <span className="amp">and</span> {COUPLE.groom.short}
          </h2>
          <p className="inv-label" style={{ opacity: 0.7 }}>
            {WEDDING_DATE.long}
          </p>
          {pending ? (
            <button type="button" className="inv-btn inv-btn--ghost inv-btn--light" onClick={onRsvp} style={{ justifySelf: 'start' }}>
              Reply to the invitation
            </button>
          ) : null}
          <p className="inv-closing__tag inv-body">
            <span className="inv-closing__tag-line" aria-hidden />
            {COUPLE.hashtag}
          </p>
        </div>
      </div>
      <p className="inv-closing__foot inv-label">
        <span>Jakarta</span>
        <span>MMXXVI</span>
      </p>
    </footer>
  )
}
