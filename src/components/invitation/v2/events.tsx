'use client'

import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { EVENTS, type EventKey } from './content'
import { useCopy } from './lang'
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
 * The non-hijab invitation is the exception (owner, 2026-09-19): the couple's
 * own friends see the whole day, both doors, whichever they hold. The Akad
 * then carries a note saying whose it is, and the kept-places line is
 * dropped, because with a door on screen that is not theirs, "we have kept
 * two places" would be read against the wrong one. Everyone else keeps the
 * old behaviour, where a door they cannot see needs no explaining.
 *
 * The opener is the date and the personal line, nothing more: the venue
 * names are the section's display type now, and the old headline was
 * competing with them. Then the doors, the Akad in morning stone and the
 * Resepsi in night charcoal, so a two-event guest travels the page's own arc
 * inside one section.
 */
const BOTH: EventKey[] = ['akad', 'resepsi']

export function Events({ invited, pax, candid }: { invited: EventKey[]; pax: number; candid: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const c = useCopy()

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
      {/* The date came off the opener (owner, 2026-09-22): the doors below
          carry the hours, and the date itself is the countdown's whole
          subject a section later. That leaves only the kept-places line, and
          the non-hijab invitation does not show that either, so on that
          version the section opens straight onto the first door. */}
      {candid ? null : (
        <div className="inv-section">
          <div className="inv-column inv-events__open">
            <p className="inv-body" style={{ opacity: 0.85, maxWidth: '26rem' }}>
              {c.places(pax)}
            </p>
          </div>
        </div>
      )}

      {(candid ? BOTH : invited).map((key) => (
        <EventDoor
          key={key}
          event={EVENTS[key]}
          photo={EVENT_PHOTO[key].photo}
          focus={EVENT_PHOTO[key].focus}
          night={key === 'resepsi'}
          note={candid ? c.events[key].note : undefined}
        />
      ))}
    </section>
  )
}
