'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { EVENTS, WEDDING_DATE, type EventKey } from './content'
import { VENUES } from './photos'

const EVENT_PHOTO = { akad: VENUES.istiqlal, resepsi: VENUES.luxus } as const

/**
 * One card per event the guest is invited to, and only those. A guest with
 * one card never learns there was a second. Each card sits on its own venue:
 * Istiqlal at dusk, the Luxus chandelier.
 */
export function Events({ invited, pax }: { invited: EventKey[]; pax: number }) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-events__head > *', {
          y: 24,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 75%' },
        })
        gsap.utils.toArray<HTMLElement>('.inv-event').forEach((card) => {
          gsap.from(card, {
            y: 60,
            opacity: 0,
            duration: 1.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: card, start: 'top 82%' },
          })
          gsap.fromTo(
            card.querySelector('.inv-event__photo'),
            { yPercent: -8 },
            { yPercent: 8, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } }
          )
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="events" className="inv-section inv-events" aria-label="Events">
      <div className="inv-column">
        <div className="inv-events__head">
          <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
            {WEDDING_DATE.long}
          </p>
          <h2 className="inv-display" style={{ fontSize: 'clamp(2.6rem, 11vw, 4.6rem)', marginTop: '0.6rem' }}>
            {invited.length === 2 ? (
              <>
                Two moments, <i>one day.</i>
              </>
            ) : (
              <>
                We would be <i>honoured.</i>
              </>
            )}
          </h2>
          <p className="inv-body" style={{ marginTop: '1rem', opacity: 0.8, maxWidth: '26rem' }}>
            {pax === 1
              ? 'We have kept a place in your name.'
              : `We have kept ${pax} places in your name.`}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '2.25rem', marginTop: '2.75rem' }}>
          {invited.map((key) => {
            const ev = EVENTS[key]
            const photo = EVENT_PHOTO[key]
            return (
              <article key={key} className="inv-event" aria-label={ev.name}>
                <div className="inv-event__photo">
                  <Image src={photo.src} alt="" fill sizes="(min-width: 768px) 44rem, 100vw" quality={85} />
                </div>
                <div className="inv-event__wash" aria-hidden />
                <div className="inv-event__body">
                  <p className="inv-label" style={{ opacity: 0.8 }}>
                    {ev.name}
                  </p>
                  <p className="inv-event__time inv-display">{ev.time}</p>
                  <p className="inv-label" style={{ opacity: 0.6, marginTop: '0.35rem' }}>
                    {ev.timeLine}
                  </p>
                  <p className="inv-event__venue inv-display">{ev.venue}</p>
                  <p className="inv-body" style={{ opacity: 0.75, marginTop: '0.25rem' }}>
                    {ev.address}
                  </p>
                  <a
                    className="inv-btn inv-btn--ghost inv-btn--light"
                    href={ev.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginTop: '1.25rem', alignSelf: 'flex-start' }}
                  >
                    Open in Maps
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
