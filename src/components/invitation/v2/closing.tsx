'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { Monogram } from './monogram'
import { CLOSING, COUPLE, WEDDING_DATE } from './content'
import { SIGNATURE_BOX, SIGNATURE_GLYPHS, SIGNATURE_INK, SIGNATURE_STROKES, SIGNATURE_VIEWBOX } from './signature-paths'
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
 * The names, signed. The fill is the letterform; the mask over it holds the
 * pen strokes, and drawing those is what writes it. See signature-paths.ts.
 */
function Signature() {
  const id = useId()
  const [x, y, w, h] = SIGNATURE_VIEWBOX
  return (
    <svg className="inv-sig" viewBox={SIGNATURE_BOX} role="img" aria-label={`${COUPLE.bride.short} and ${COUPLE.groom.short}, signed`}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
          {SIGNATURE_STROKES.map((s, i) => (
            <path
              key={i}
              className="inv-sig__ink"
              d={s.d}
              fill="none"
              stroke="#fff"
              strokeWidth={SIGNATURE_INK}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </mask>
      </defs>
      <path d={SIGNATURE_GLYPHS} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

/** Seconds the signature takes to write. Pen pace, not a wipe. */
const WRITE = 2.8
/** The pen lifts between words, at the end of these glyphs. */
const LIFT_AFTER = new Set(['a&', '&F'])

/**
 * The last page, and the letter's sign-off. The invitation opened as a
 * letter addressed to the guest; it closes with its final lines: a thank
 * you with their name in it, and the two names signed by hand in front of
 * them. The monogram follows as the seal, then the date and the hashtag.
 * No photographs: the three sections before this one are all pictures,
 * and the ending wanted one thing the page had not yet done.
 *
 * The whole sequence plays once, on its own clock, the moment the section
 * is in view. It is started by an IntersectionObserver rather than a scroll
 * position: a measured trigger can go stale and leave an unwritten page,
 * which for this section would mean a blank ending.
 */
export function Closing({ guestName, pending, onRsvp }: { guestName: string; pending: boolean; onRsvp: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const [sealed, setSealed] = useState(false)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const ink = gsap.utils.toArray<SVGPathElement>('.inv-sig__ink', ref.current)
        const total = SIGNATURE_STROKES.reduce((a, s) => a + s.len, 0)
        // Hidden until each stroke's turn: a round cap at zero length is a
        // dot, and thirty-five dots would give the whole word away.
        gsap.set(ink, { drawSVG: '0%', autoAlpha: 0 })

        const tl = gsap.timeline({ paused: true })
        tl.from('.inv-closing__thanks', { y: 20, opacity: 0, duration: 1, ease: 'power3.out' })
          .from('.inv-closing__signoff', { opacity: 0, duration: 0.7 }, '-=0.5')
          .addLabel('write', '-=0.2')

        let at = 0
        SIGNATURE_STROKES.forEach((s, i) => {
          const d = (s.len / total) * WRITE
          tl.set(ink[i], { autoAlpha: 1 }, `write+=${at}`).to(ink[i], { drawSVG: '100%', duration: d, ease: 'none' }, `write+=${at}`)
          at += d
          const next = SIGNATURE_STROKES[i + 1]
          if (next && LIFT_AFTER.has(s.ch + next.ch)) at += 0.22
        })

        tl.call(() => setSealed(true), undefined, `write+=${at + 0.3}`).from(
          '.inv-closing__after > *',
          { y: 14, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out' },
          `write+=${at + 1.5}`
        )

        const io = new IntersectionObserver(
          ([e]) => {
            if (!e.isIntersecting) return
            tl.play()
            io.disconnect()
          },
          { threshold: 0.4 }
        )
        io.observe(ref.current!)
        return () => io.disconnect()
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set('.inv-sig__ink', { drawSVG: '100%', autoAlpha: 1 })
        setSealed(true)
      })
    },
    { scope: ref }
  )

  return (
    <footer ref={ref} id="closing" className="inv-closing" aria-label="Closing">
      <Dust />
      <div className="inv-closing__letter">
        <p className="inv-closing__thanks inv-display">
          {guestName}, {CLOSING.thanks}
        </p>
        <p className="inv-closing__signoff inv-display">{CLOSING.signOff}</p>
        <Signature />
        <div className="inv-closing__seal" aria-hidden>
          <Monogram size={64} tone="ivory" frozen={!sealed} />
        </div>
        <div className="inv-closing__after">
          <p className="inv-label" style={{ opacity: 0.7 }}>
            {WEDDING_DATE.long}
          </p>
          <p className="inv-closing__tag inv-body">{COUPLE.hashtag}</p>
          {pending ? (
            <button type="button" className="inv-btn inv-btn--ghost inv-btn--light" onClick={onRsvp}>
              Reply to the invitation
            </button>
          ) : null}
        </div>
      </div>
      <p className="inv-closing__foot inv-label">
        <span>Jakarta</span>
        <span>MMXXVI</span>
      </p>
    </footer>
  )
}
