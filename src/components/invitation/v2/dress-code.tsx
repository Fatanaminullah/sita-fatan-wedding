'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
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

/** Every look, hers then his; thumbnails are renders of the same models. */
const HER = [...LOOKS.hijab, ...LOOKS.woman]
const OPTIONS = [...HER.map((url, i) => ({ who: 'her' as const, i, url })), ...LOOKS.man.map((url, i) => ({ who: 'him' as const, i, url }))]
const thumb = (url: string) => url.replace('/guests/', '/guests/thumbs/').replace('.glb', '.jpg')

/**
 * The night chapter opens here. Guests dressed for the evening turn on a
 * floor under a spot (drag to turn them); beneath, one strip of every
 * look, hers then his; tap one and it is worn. A party sees her and him,
 * a guest coming alone sees whichever they tapped last.
 */
export function DressCode({ pax }: { pax: number }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [him, setHim] = useState(1)
  const [her, setHer] = useState(2)
  const [solo, setSolo] = useState<'her' | 'him'>('her')
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
    loadScene().then((m) => m.preloadLooks([...LOOKS.man, ...HER]))
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
      })
    },
    { scope: ref }
  )

  const figures: Figure[] = pair
    ? [
        { url: HER[her], x: -0.62, yaw: 0.25 },
        { url: LOOKS.man[him], x: 0.62, yaw: -0.25 },
      ]
    : [{ url: solo === 'her' ? HER[her] : LOOKS.man[him], x: 0, yaw: 0 }]

  const worn = (o: (typeof OPTIONS)[number]) => (o.who === 'her' ? o.i === her : o.i === him) && (pair || solo === o.who)
  const wear = (o: (typeof OPTIONS)[number]) => {
    if (o.who === 'her') setHer(o.i)
    else setHim(o.i)
    setSolo(o.who)
  }

  return (
    <section ref={ref} id="dress" className={`inv-section inv-dress${webgl ? ' inv-dress--3d' : ''}`} aria-label="Dress code">
      {webgl ? (
        <div className="inv-dress__stage">
          <div className="inv-dress__canvas">{near ? <DressScene figures={figures} /> : null}</div>
          <p className="inv-label inv-dress__drag" aria-hidden>
            Drag to turn
          </p>
        </div>
      ) : null}
      <div className="inv-column inv-dress__body">
        {webgl ? (
          <div className="inv-options__row" role="radiogroup" aria-label="Looks">
            {OPTIONS.map((o) => (
              <button
                key={o.url}
                type="button"
                role="radio"
                aria-checked={worn(o)}
                className="inv-option"
                onClick={() => wear(o)}
                aria-label={`${o.who === 'her' ? 'Her' : 'His'} look ${o.i + 1}`}
              >
                <Image src={thumb(o.url)} alt="" width={240} height={320} unoptimized />
              </button>
            ))}
          </div>
        ) : null}
        <h2 className="inv-dress__title inv-display">{DRESS_CODE.title}</h2>
        <p className="inv-body" style={{ marginTop: '1rem', opacity: 0.85, maxWidth: '26rem' }}>
          {DRESS_CODE.lines[0]} {DRESS_CODE.lines[1]}
        </p>
        {webgl ? (
          <p className="inv-body inv-dress__example">{DRESS_CODE.example}</p>
        ) : null}
      </div>
    </section>
  )
}
