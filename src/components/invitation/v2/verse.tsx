'use client'

import { Fragment, useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { VERSE } from './content'

/**
 * The quiet room after the door: one verse, alone in the dark, set large,
 * the words arriving one at a time as the guest scrolls. Charcoal on
 * purpose: the vow that slides up over it is stone, and the sheet only
 * reads as a sheet against a different ground.
 */
export function Verse() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const words = VERSE.text.split(' ')

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        // Held in place while the words fill in; the page moves on only once
        // the last word is lit.
        gsap
          .timeline({ scrollTrigger: { trigger: wrapRef.current, start: 'top top', end: '+=160%', scrub: 0.5 } })
          .fromTo('.word', { opacity: 0.12, y: 6 }, { opacity: 1, y: 0, ease: 'none', stagger: 0.08, duration: 0.6 })
          .from('.inv-verse__source', { opacity: 0, duration: 0.4 }, '-=0.1')
      })
    },
    { scope: wrapRef }
  )

  // Sticky inside a taller wrapper: the words fill over the first 160vh,
  // then the vow slides up over the held verse for the last 100vh.
  return (
    <div ref={wrapRef} className="inv-verse-wrap">
      <section id="verse" className="inv-section inv-verse" aria-label="Verse">
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
          <p className="inv-label inv-verse__source" style={{ textAlign: 'center', marginTop: '2.5rem', opacity: 0.6 }}>
            {VERSE.source}
          </p>
        </div>
      </section>
    </div>
  )
}
