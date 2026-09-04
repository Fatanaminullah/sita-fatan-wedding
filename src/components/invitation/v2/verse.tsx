'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { PHOTOS } from './photos'
import { VERSE } from './content'

/**
 * The quiet room after the door. One verse, one photograph gone almost to
 * shadow, and the words arriving one at a time as the guest scrolls.
 */
export function Verse() {
  const ref = useRef<HTMLElement>(null)
  const words = VERSE.text.split(' ')

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          '.word',
          { opacity: 0.08, y: 6 },
          {
            opacity: 1,
            y: 0,
            ease: 'none',
            stagger: 0.08,
            scrollTrigger: { trigger: ref.current, start: 'top 60%', end: 'bottom 70%', scrub: 0.6 },
          }
        )
        gsap.from('.inv-verse__source', {
          opacity: 0,
          scrollTrigger: { trigger: ref.current, start: 'center 55%', end: 'bottom 75%', scrub: true },
        })
        gsap.fromTo(
          '.inv-verse__photo',
          { scale: 1.1, yPercent: -6 },
          {
            scale: 1,
            yPercent: 6,
            ease: 'none',
            scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
          }
        )
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="verse" className="inv-section inv-verse" aria-label="Verse">
      <div className="inv-verse__photo">
        <Image src={PHOTOS.doorway.src} alt="" fill sizes="100vw" quality={65} />
      </div>
      <div className="inv-verse__wash" aria-hidden />
      <div className="inv-column" style={{ position: 'relative', paddingBlock: '20vh' }}>
        <p className="inv-verse__text inv-display" aria-label={VERSE.text}>
          {words.map((w, i) => (
            <span key={i} className="word" aria-hidden>
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
        <p className="inv-label inv-verse__source" style={{ textAlign: 'center', marginTop: '2.5rem', opacity: 0.7 }}>
          {VERSE.source}
        </p>
      </div>
    </section>
  )
}
