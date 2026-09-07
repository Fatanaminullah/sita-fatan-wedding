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

/**
 * The dress code is three tones, so the section has three buttons and
 * nothing else. Each tone names one look per figure; picking a tone dresses
 * her and him together, because a guest is choosing a colour, not an outfit.
 */
const TONES = [
  { ...DRESS_CODE.swatches[0], man: LOOKS.man[0], woman: LOOKS.woman[1], hijab: LOOKS.hijab[0] },
  { ...DRESS_CODE.swatches[1], man: LOOKS.man[2], woman: LOOKS.woman[2], hijab: LOOKS.hijab[2] },
  { ...DRESS_CODE.swatches[2], man: LOOKS.man[1], woman: LOOKS.woman[0], hijab: LOOKS.hijab[1] },
] as const

/**
 * The night chapter opens here. Two guests dressed for the evening turn on a
 * floor under a spot (drag to turn them), and three swatches say the tones.
 *
 * `candid` decides whether her look wears a hijab. It is the same gate the
 * gallery uses: a guest who is not shown Sita unveiled is a guest whose own
 * example should be covered. It is a proxy, not a fact, which is why the
 * copy underneath says these are examples.
 */
export function DressCode({ candid }: { candid: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const [tone, setTone] = useState(0)

  const hers = (t: (typeof TONES)[number]) => (candid ? t.woman : t.hijab)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (webgl) void loadScene()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '120% 0px 120% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  // Once the first tone is up, warm the other two so a tap is instant.
  useEffect(() => {
    if (!near || !webgl) return
    loadScene().then((m) => m.preloadLooks(TONES.flatMap((t) => [t.man, hers(t)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, webgl, candid])

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

  const figures: Figure[] = [
    { url: hers(TONES[tone]), x: -0.62, yaw: 0.25 },
    { url: TONES[tone].man, x: 0.62, yaw: -0.25 },
  ]

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
        <h2 className="inv-dress__title inv-display">{DRESS_CODE.title}</h2>
        <p className="inv-body" style={{ marginTop: '1rem', opacity: 0.85, maxWidth: '26rem' }}>
          {DRESS_CODE.lines[0]} {DRESS_CODE.lines[1]}
        </p>
        {webgl ? (
          <div className="inv-tones" role="radiogroup" aria-label="Tone">
            {TONES.map((t, i) => (
              <button
                key={t.name}
                type="button"
                role="radio"
                aria-checked={i === tone}
                className="inv-tone"
                onClick={() => setTone(i)}
              >
                <span className="inv-tone__dot" style={{ background: t.hex }} aria-hidden />
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
        {webgl ? <p className="inv-body inv-dress__example">{DRESS_CODE.example}</p> : null}
      </div>
    </section>
  )
}
