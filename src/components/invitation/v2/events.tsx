'use client'

import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { EVENTS, EVENTS_COPY, WEDDING_DATE, type EventKey } from './content'
import { EventDoor } from './event-door'
import { VENUES } from './photos'
import { EASE_OUT } from './theme'

/** Each event's venue photograph and where to hold it while it opens. */
const EVENT_PHOTO = {
  akad: { photo: VENUES.istiqlal, focus: '50% 42%' },
  resepsi: { photo: VENUES.luxus, focus: '50% 28%' },
} as const

/**
 * One door per event the guest is invited to, and only those. A guest with
 * one door never learns there was a second.
 *
 * The opener is the date and the personal line, nothing more: the venue
 * names are the section's display type now, and the old headline was
 * competing with them. Then the doors, the Akad in morning stone and the
 * Resepsi in night charcoal, so a two-event guest travels the page's own arc
 * inside one section.
 */
export function Events({ invited, pax }: { invited: EventKey[]; pax: number }) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-events__open > *', {
          y: 24,
          opacity: 0,
          duration: 1,
          ease: EASE_OUT,
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 75%' },
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="events" className="inv-events" aria-label="Events">
      <div className="inv-section">
        <div className="inv-column inv-events__open">
          <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.75 }}>
            {WEDDING_DATE.long}
          </p>
          <p className="inv-body" style={{ opacity: 0.85, maxWidth: '26rem' }}>
            {EVENTS_COPY.places(pax)}
          </p>
        </div>
      </div>

      {invited.map((key) => (
        <EventDoor key={key} event={EVENTS[key]} photo={EVENT_PHOTO[key].photo} focus={EVENT_PHOTO[key].focus} night={key === 'resepsi'} />
      ))}
    </section>
  )
}
