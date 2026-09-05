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
  const wrapRef = useRef<HTMLDivElement>(null)
  const words = VERSE.text.split(' ')

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        // Held in place while the words fill in; the page moves on only once
        // the last word is lit.
        const tl = gsap.timeline({
          scrollTrigger: { trigger: wrapRef.current, start: 'top top', end: '+=160%', scrub: 0.5 },
        })
        tl.fromTo('.word', { opacity: 0.12, y: 6 }, { opacity: 1, y: 0, ease: 'none', stagger: 0.08, duration: 0.6 })
          .from('.inv-verse__source', { opacity: 0, duration: 0.4 }, '-=0.1')
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
      })
    },
    { scope: wrapRef }
  )

  // Sticky inside a taller wrapper: the words fill over the first 160vh,
  // then the vow slides up over the held verse for the last 100vh.
  return (
    <div ref={wrapRef} className="inv-verse-wrap">
    <section ref={ref} id="verse" className="inv-section inv-verse" aria-label="Verse">
      <div className="inv-verse__photo">
        <Image src={PHOTOS.facade.src} alt="" fill sizes="100vw" quality={70} />
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
    </div>
  )
}
