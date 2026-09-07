'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { DRESS_CODE } from './content'
import { LOOKS, type Figure } from './dress-scene'

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

type Her = 'hijab' | 'woman'

/**
 * The night chapter opens here. Guests dressed for the evening turn on a
 * floor under a spot: one for a guest coming alone, two for a party. Each
 * figure has three looks to flick through, and she can be shown with or
 * without a hijab. The words and the three colours stay beneath.
 */
export function DressCode({ pax }: { pax: number }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [him, setHim] = useState(1)
  const [her, setHer] = useState(2)
  const [herKind, setHerKind] = useState<Her>('hijab')
  const pair = pax > 1

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (webgl) void loadScene()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '120% 0px 120% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  // Once the first look is up, warm the rest so a tap is instant.
  useEffect(() => {
    if (!near || !webgl) return
    loadScene().then((m) => m.preloadLooks([...LOOKS.man, ...LOOKS.hijab, ...LOOKS.woman]))
  }, [near, webgl])

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

  const figures: Figure[] = pair
    ? [
        { url: LOOKS[herKind][her], x: -0.62, yaw: 0.25 },
        { url: LOOKS.man[him], x: 0.62, yaw: -0.25 },
      ]
    : [{ url: LOOKS.man[him], x: 0, yaw: 0 }]

  return (
    <section ref={ref} id="dress" className={`inv-section inv-dress${webgl ? ' inv-dress--3d' : ''}`} aria-label="Dress code">
      {webgl ? (
        <div className="inv-dress__stage">
          <div className="inv-dress__canvas" aria-hidden>
            {near ? <DressScene figures={figures} /> : null}
          </div>
          <div className="inv-dress__looks">
            {pair ? (
              <div className="inv-looks" role="group" aria-label="Her look">
                <button
                  type="button"
                  className="inv-looks__kind inv-label"
                  aria-pressed={herKind === 'hijab'}
                  onClick={() => setHerKind((k) => (k === 'hijab' ? 'woman' : 'hijab'))}
                >
                  {herKind === 'hijab' ? 'Hijab' : 'No hijab'}
                </button>
                {LOOKS[herKind].map((_, i) => (
                  <button key={i} type="button" className="inv-looks__pick" aria-pressed={i === her} aria-label={`Her look ${i + 1}`} onClick={() => setHer(i)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="inv-looks" role="group" aria-label={pair ? 'His look' : 'Your look'}>
              <span className="inv-looks__kind inv-label" aria-hidden>
                {pair ? 'Him' : 'You'}
              </span>
              {LOOKS.man.map((_, i) => (
                <button key={i} type="button" className="inv-looks__pick" aria-pressed={i === him} aria-label={`His look ${i + 1}`} onClick={() => setHim(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="inv-column inv-dress__body">
        <p className="inv-label" style={{ opacity: 0.7 }}>
          Dress code
        </p>
        <h2 className="inv-dress__title inv-display" style={{ marginTop: '0.75rem' }}>
          {DRESS_CODE.title}
        </h2>
        <div className="inv-swatches" aria-label="Colours to wear">
          {DRESS_CODE.swatches.map((s) => (
            <div key={s.name} className="inv-swatch">
              <span className="inv-swatch__dot" style={{ background: s.hex }} aria-hidden />
              <span className="inv-label" style={{ fontSize: '0.6rem', opacity: 0.75 }}>
                {s.name}
              </span>
            </div>
          ))}
        </div>
        <p className="inv-body" style={{ marginTop: '1.5rem', opacity: 0.85, maxWidth: '24rem' }}>
          {DRESS_CODE.lines[0]}
          <br />
          <i style={{ fontFamily: 'var(--font-display)', fontSize: '1.25em' }}>{DRESS_CODE.lines[1]}</i>
        </p>
      </div>
    </section>
  )
}
