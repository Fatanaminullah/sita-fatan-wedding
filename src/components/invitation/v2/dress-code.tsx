'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { DRESS_CODE } from './content'
import type { Outfit } from './dress-scene'

const loadScene = () => import('./dress-scene')
const DressScene = dynamic(loadScene, { ssr: false })

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

/**
 * The night chapter opens here. Tailor's forms turn on a stone floor,
 * dressed for the evening: one for a guest coming alone, a gown and a suit
 * for a party. The three swatches are the code, and tapping one re-dyes
 * the outfits so the guest can see it worn before choosing.
 */
export function DressCode({ pax }: { pax: number }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [pick, setPick] = useState(0)
  const outfits: Outfit[] = pax > 1 ? ['gown', 'suit'] : ['suit']

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (webgl) void loadScene()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '120% 0px 120% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-dress__body > *', {
          y: 28,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 60%' },
        })
        gsap.to('.inv-swatch__dot', {
          scale: 1,
          duration: 0.8,
          ease: 'back.out(1.6)',
          stagger: 0.12,
          delay: 0.4,
          scrollTrigger: { trigger: ref.current, start: 'top 60%' },
        })
      })
    },
    { scope: ref }
  )

  const swatch = DRESS_CODE.swatches[pick]

  return (
    <section ref={ref} id="dress" className={`inv-section inv-dress${webgl ? ' inv-dress--3d' : ''}`} aria-label="Dress code">
      {webgl ? (
        <div className="inv-dress__stage" aria-hidden>
          {near ? <DressScene outfits={outfits} color={swatch.hex} /> : null}
        </div>
      ) : null}
      <div className="inv-column inv-dress__body">
        <p className="inv-label" style={{ opacity: 0.7 }}>
          Dress code
        </p>
        <h2 className="inv-dress__title inv-display" style={{ marginTop: '0.75rem' }}>
          {DRESS_CODE.title}
        </h2>
        <div className="inv-swatches" role="radiogroup" aria-label="Colours to wear">
          {DRESS_CODE.swatches.map((s, i) => (
            <button
              key={s.name}
              type="button"
              className="inv-swatch"
              role="radio"
              aria-checked={i === pick}
              onClick={() => setPick(i)}
            >
              <span className="inv-swatch__dot" style={{ background: s.hex }} aria-hidden />
              <span className="inv-label" style={{ fontSize: '0.6rem', opacity: i === pick ? 1 : 0.6 }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
        <p className="inv-body" style={{ marginTop: '1.5rem', opacity: 0.85, maxWidth: '24rem' }}>
          {DRESS_CODE.lines[0]}
          <br />
          <i style={{ fontFamily: 'var(--font-display)', fontSize: '1.25em' }}>{DRESS_CODE.lines[1]}</i>
        </p>
        {webgl ? (
          <p className="inv-label inv-dress__hint" aria-live="polite">
            Tap a colour to see it worn
          </p>
        ) : null}
      </div>
    </section>
  )
}
