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

/** Two options, both always visible, the chosen one filled. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inv-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="inv-seg__opt" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Previous / next through a figure's looks, saying where you are. */
function Looks({ who, index, count, onChange }: { who: string; index: number; count: number; onChange: (i: number) => void }) {
  return (
    <div className="inv-step" role="group" aria-label={`${who} outfit`}>
      <button type="button" className="inv-step__btn" aria-label={`Previous outfit for ${who}`} onClick={() => onChange((index + count - 1) % count)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <span className="inv-step__label inv-body" aria-live="polite">
        Look {index + 1} <span style={{ opacity: 0.55 }}>of {count}</span>
      </span>
      <button type="button" className="inv-step__btn" aria-label={`Next outfit for ${who}`} onClick={() => onChange((index + 1) % count)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  )
}

/**
 * The night chapter opens here. Guests dressed for the evening turn on a
 * floor under a spot: one for a guest coming alone, two for a party. Under
 * each figure sit its own controls: for her, a switch between hijab and no
 * hijab; for both, previous and next through three looks. A guest coming
 * alone chooses whether they see her or him.
 */
export function DressCode({ pax }: { pax: number }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [him, setHim] = useState(1)
  const [her, setHer] = useState(2)
  const [herKind, setHerKind] = useState<Her>('hijab')
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
    : [{ url: showHer ? LOOKS[herKind][her] : LOOKS.man[him], x: 0, yaw: 0 }]

  return (
    <section ref={ref} id="dress" className={`inv-section inv-dress${webgl ? ' inv-dress--3d' : ''}`} aria-label="Dress code">
      {webgl ? (
        <div className="inv-dress__stage">
          <div className="inv-dress__canvas" aria-hidden>
            {near ? <DressScene figures={figures} /> : null}
          </div>
          <div className={`inv-dress__controls${pair ? ' inv-dress__controls--pair' : ''}`}>
            {pair ? null : (
              <div className="inv-dress__who">
                <Segmented
                  label="Who to show"
                  value={solo}
                  options={[
                    { value: 'her', label: 'Her' },
                    { value: 'him', label: 'Him' },
                  ]}
                  onChange={setSolo}
                />
              </div>
            )}
            {showHer ? (
              <div className="inv-dress__col">
                {pair ? <p className="inv-label inv-dress__who-label">Her</p> : null}
                <Segmented
                  label="Her hijab"
                  value={herKind}
                  options={[
                    { value: 'hijab', label: 'Hijab' },
                    { value: 'woman', label: 'No hijab' },
                  ]}
                  onChange={setHerKind}
                />
                <Looks who="her" index={her} count={LOOKS[herKind].length} onChange={setHer} />
              </div>
            ) : null}
            {showHim ? (
              <div className="inv-dress__col">
                {pair ? <p className="inv-label inv-dress__who-label">Him</p> : null}
                <Looks who="him" index={him} count={LOOKS.man.length} onChange={setHim} />
              </div>
            ) : null}
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
