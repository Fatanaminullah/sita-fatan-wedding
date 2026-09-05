'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { DRESS_CODE } from './content'
import { PHOTOS } from './photos'

/**
 * The night chapter opens here. The photograph is the dress code: the two
 * of them in black under one line of light. Three swatches bloom as the guest arrives,
 * sized to be screenshotted and sent to a tailor.
 */
export function DressCode() {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          '.inv-dress__photo',
          { yPercent: -10, scale: 1.1 },
          { yPercent: 6, scale: 1, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true } }
        )
        gsap.from('.inv-dress__body > *', {
          y: 28,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: '40% 80%' },
        })
        gsap.to('.inv-swatch__dot', {
          scale: 1,
          duration: 0.8,
          ease: 'back.out(1.6)',
          stagger: 0.12,
          delay: 0.4,
          scrollTrigger: { trigger: ref.current, start: '40% 80%' },
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="dress" className="inv-section inv-dress" aria-label="Dress code">
      <div className="inv-dress__photo">
        <Image src={PHOTOS.barCouple.src} alt="" fill sizes="100vw" quality={85} />
      </div>
      <div className="inv-dress__wash" aria-hidden />
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
