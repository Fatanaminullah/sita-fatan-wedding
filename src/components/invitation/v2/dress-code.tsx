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

/** Her six looks, hijab first; his three. Thumbnails are renders of the same models. */
const HER = [...LOOKS.hijab, ...LOOKS.woman]
const thumb = (url: string) => url.replace('/guests/', '/guests/thumbs/').replace('.glb', '.jpg')

/** Every option in a row, the worn one marked; tap one to wear it. */
function Options({ label, urls, value, onChange }: { label: string; urls: readonly string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="inv-options" role="radiogroup" aria-label={`${label} options`}>
      <p className="inv-label inv-options__label">{label}</p>
      <div className="inv-options__row">
        {urls.map((u, i) => (
          <button key={u} type="button" role="radio" aria-checked={i === value} className="inv-option" onClick={() => onChange(i)} aria-label={`${label}, look ${i + 1}`}>
            <Image src={thumb(u)} alt="" width={240} height={320} unoptimized />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The night chapter opens here, laid out like a product page: the guests
 * dressed for the evening turn on a floor under a spot (drag to turn
 * them), and beside them every look they could wear, as tiles; tap one and
 * they wear it. One figure for a guest coming alone, two for a party. The
 * figures are examples, and say so.
 */
export function DressCode({ pax }: { pax: number }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [him, setHim] = useState(1)
  const [her, setHer] = useState(2)
  const [solo, setSolo] = useState<'her' | 'him'>('her')
  const pair = pax > 1
  const showHer = pair || solo === 'her'
  const showHim = pair || solo === 'him'

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
        { url: HER[her], x: -0.62, yaw: 0.25 },
        { url: LOOKS.man[him], x: 0.62, yaw: -0.25 },
      ]
    : [{ url: showHer ? HER[her] : LOOKS.man[him], x: 0, yaw: 0 }]

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
        <p className="inv-label" style={{ opacity: 0.7 }}>
          Dress code
        </p>
        <h2 className="inv-dress__title inv-display" style={{ marginTop: '0.75rem' }}>
          {DRESS_CODE.title}
        </h2>
        {webgl ? (
          <div className="inv-dress__options">
            {pair ? null : (
              <div className="inv-seg" role="radiogroup" aria-label="Who to show">
                {(['her', 'him'] as const).map((w) => (
                  <button key={w} type="button" role="radio" aria-checked={solo === w} className="inv-seg__opt" onClick={() => setSolo(w)}>
                    {w === 'her' ? 'Her' : 'Him'}
                  </button>
                ))}
              </div>
            )}
            {showHer ? <Options label="Her" urls={HER} value={her} onChange={setHer} /> : null}
            {showHim ? <Options label="Him" urls={LOOKS.man} value={him} onChange={setHim} /> : null}
            <p className="inv-dress__example inv-body">{DRESS_CODE.example}</p>
          </div>
        ) : null}
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
