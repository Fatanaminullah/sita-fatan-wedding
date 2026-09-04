'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, SplitText, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS } from './photos'
import { RSVP_DEADLINE, WEDDING_DATE } from './content'

/**
 * The front of the invitation. A full-bleed photograph drifting slowly, the
 * names set enormous, and the guest's own name on an ivory card at the
 * bottom, the one thing here that is theirs.
 *
 * Open: the card folds back on a top hinge like a flap and the page lets go
 * of the scroll. That tap is also the one gesture allowed to start music.
 */
export function Cover({
  guestName,
  answered,
  started,
  onOpen,
}: {
  guestName: string
  answered: boolean
  /** True once the loader has left, so the title reveal waits for the curtain. */
  started: boolean
  onOpen: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const openedRef = useRef(false)

  useGSAP(
    () => {
      if (!started) return
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          '.inv-cover__photo',
          { scale: 1.14 },
          { scale: 1, duration: 7, ease: 'power2.out' }
        )
        const split = SplitText.create('.inv-cover__title .line', { type: 'chars', mask: 'chars' })
        gsap.from(split.chars, {
          yPercent: 110,
          duration: 1.2,
          ease: 'power4.out',
          stagger: { each: 0.045, from: 'center' },
          delay: 0.2,
        })
        gsap.from('.inv-cover__title .amp', { opacity: 0, duration: 1, delay: 0.9 })
        gsap.from(cardRef.current, {
          y: 40,
          opacity: 0,
          duration: 1.1,
          ease: 'power3.out',
          delay: 0.9,
        })
        gsap.from('.inv-cover__top', { opacity: 0, y: -10, duration: 1, delay: 0.6 })

        // Parallax on the way out.
        gsap.to('.inv-cover__photo', {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true },
        })
        gsap.to('.inv-cover__title', {
          yPercent: -30,
          opacity: 0,
          ease: 'none',
          scrollTrigger: { trigger: ref.current, start: 'top top', end: '60% top', scrub: true },
        })
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set(['.inv-cover__photo', '.inv-cover__title', cardRef.current], { clearProps: 'all' })
      })
    },
    { scope: ref, dependencies: [started] }
  )

  // The handler is built inside the GSAP context so its tweens are reverted
  // with the component, and stored on a ref so render never touches refs.
  const openRef = useRef<() => void>(() => {})
  useGSAP(
    (_ctx, contextSafe) => {
      openRef.current = contextSafe!(() => {
        if (openedRef.current) return
        openedRef.current = true
        onOpen()
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced) {
          gsap.set(cardRef.current, { autoAlpha: 0 })
          return
        }
        gsap
          .timeline()
          .to('.inv-cover__card-inner', { rotateX: -95, duration: 0.9, ease: 'power3.in' })
          .to(cardRef.current, { autoAlpha: 0, duration: 0.2 }, '-=0.15')
          .to('.inv-cover__scrollhint', { opacity: 1, duration: 0.8 }, '-=0.1')
          .fromTo(
            '.inv-cover__scrollhint',
            { scaleY: 0, transformOrigin: '50% 0%' },
            { scaleY: 1, duration: 1.1, ease: 'power2.inOut', repeat: -1, repeatDelay: 0.4 }
          )
      })
    },
    { scope: ref, dependencies: [onOpen] }
  )

  return (
    <section ref={ref} className="inv-cover" aria-label="Cover">
      <div className="inv-cover__photo">
        <Image
          src={PHOTOS.coverArch.src}
          alt={PHOTOS.coverArch.alt}
          fill
          priority
          sizes="100vw"
          quality={78}
        />
      </div>
      <div className="inv-cover__wash" aria-hidden />

      <div className="inv-cover__inner">
        <div className="inv-cover__top inv-label" style={{ textAlign: 'center', opacity: 0.85 }}>
          The wedding of
        </div>

        <h1 className="inv-cover__title inv-display">
          <span className="line">Sita</span>
          <span className="amp">and</span>
          <span className="line">Fatan</span>
        </h1>

        <div ref={cardRef} className="inv-cover__card">
          <div className="inv-cover__card-inner">
            <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
              Dear
            </p>
            <p className="inv-cover__name inv-display" style={{ marginTop: '0.4rem' }}>
              {guestName}
            </p>
            <p className="inv-body" style={{ marginTop: '0.75rem', opacity: 0.8 }}>
              {WEDDING_DATE.long}
              {answered ? null : (
                <>
                  <br />
                  <span style={{ fontSize: '0.9em' }}>Please reply by {RSVP_DEADLINE.long}.</span>
                </>
              )}
            </p>
            <button type="button" className="inv-btn" style={{ width: '100%', marginTop: '1.1rem' }} onClick={() => openRef.current()}>
              Open the invitation
            </button>
          </div>
        </div>
      </div>

      <div className="inv-cover__scrollhint" aria-hidden />
    </section>
  )
}
