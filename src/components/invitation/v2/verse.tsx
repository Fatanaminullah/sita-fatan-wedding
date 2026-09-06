'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { Fragment, useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { VENUES } from './photos'
import { VERSE } from './content'

const loadChandelier = () => import('./chandelier-scene')
const ChandelierScene = dynamic(loadChandelier, { ssr: false })

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
 * The quiet room after the door. The crystal chandelier from the gate
 * prototype hangs over one verse, its lights coming up as the words arrive
 * one at a time with the scroll. Devices that cannot carry the chandelier
 * get the Luxus chandelier as a photograph, far out of focus.
 */
export function Verse() {
  const ref = useRef<HTMLElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const [near, setNear] = useState(false)
  const [webgl] = useState<boolean>(() => typeof window !== 'undefined' && canRunWebGL())
  const words = VERSE.text.split(' ')

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    if (webgl) void loadChandelier()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '150% 0px 150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        // Held in place while the words fill in; the page moves on only once
        // the last word is lit.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: wrapRef.current,
            start: 'top top',
            end: '+=160%',
            scrub: 0.5,
            onUpdate: (self) => {
              progress.current = self.progress
            },
          },
        })
        tl.fromTo('.word', { opacity: 0.12, y: 6 }, { opacity: 1, y: 0, ease: 'none', stagger: 0.08, duration: 0.6 })
          .from('.inv-verse__source', { opacity: 0, duration: 0.4 }, '-=0.1')
        if (!webgl) {
          gsap.fromTo(
            '.inv-verse__photo',
            { scale: 1.1, yPercent: -6 },
            {
              scale: 1,
              yPercent: 6,
              ease: 'none',
              scrollTrigger: { trigger: wrapRef.current, start: 'top bottom', end: '+=200%', scrub: true },
            }
          )
        }
      })
    },
    { scope: wrapRef, dependencies: [webgl] }
  )

  // Sticky inside a taller wrapper: the words fill over the first 160vh,
  // then the vow slides up over the held verse for the last 100vh.
  return (
    <div ref={wrapRef} className="inv-verse-wrap">
      <section ref={ref} id="verse" className={`inv-section inv-verse${webgl ? ' inv-verse--lit' : ''}`} aria-label="Verse">
        {webgl ? (
          <div className="inv-verse__stage" aria-hidden>
            {near ? <ChandelierScene progress={progress} /> : null}
          </div>
        ) : (
          <div className="inv-verse__photo">
            <Image src={VENUES.luxus.src} alt="" fill sizes="100vw" quality={70} />
          </div>
        )}
        <div className="inv-verse__wash" aria-hidden />
        <div className="inv-column inv-verse__body">
          <p className="inv-verse__text inv-display" aria-label={VERSE.text}>
            {words.map((w, i) => (
              <Fragment key={i}>
                <span className="word" aria-hidden>
                  {i === 0 ? '“' : ''}
                  {w}
                  {i === words.length - 1 ? '”' : ''}
                </span>
                {i < words.length - 1 ? ' ' : ''}
              </Fragment>
            ))}
          </p>
          <p className="inv-label inv-verse__source" style={{ textAlign: 'center', marginTop: '2.5rem', opacity: 0.7 }}>
            {VERSE.source}
          </p>
        </div>
      </section>
    </div>
  )
}
