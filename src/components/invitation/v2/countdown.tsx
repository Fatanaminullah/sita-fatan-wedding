'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { EVENTS, WEDDING_DATE, type EventKey } from './content'

function remaining(target: number, now: number) {
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return { days, hours, minutes, over: diff === 0 }
}

/** An .ics for the events this guest holds, as a data URL. No server, no library. */
function icsHref(invited: EventKey[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sita & Fatan//Wedding//EN',
    ...invited.flatMap((k) => {
      const ev = EVENTS[k]
      return [
        'BEGIN:VEVENT',
        `UID:${k}-20261010@sitafatan.wedding`,
        `DTSTART:${ev.icsStart}`,
        `DTEND:${ev.icsEnd}`,
        `SUMMARY:${ev.name} · Sita & Fatan`,
        `LOCATION:${ev.venue}, ${ev.address}`,
        'END:VEVENT',
      ]
    }),
    'END:VCALENDAR',
  ]
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'))
}

/**
 * The date as a graphic object, three numerals stacked, each digit sliding
 * up out of its own slot. Beneath it the live count, ticking each minute.
 */
export function Countdown({ invited }: { invited: EventKey[] }) {
  const ref = useRef<HTMLElement>(null)
  const target = useMemo(() => new Date(WEDDING_DATE.startsAt).getTime(), [])
  // null on the server and the first client paint, so the numbers never
  // hydrate against a different clock than they rendered with.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    const first = requestAnimationFrame(() => setNow(Date.now()))
    return () => {
      clearInterval(id)
      cancelAnimationFrame(first)
    }
  }, [])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('.inv-countdown__date span > span', {
          yPercent: 105,
          duration: 1.1,
          ease: 'power4.out',
          stagger: 0.07,
          scrollTrigger: { trigger: ref.current, start: 'top 70%' },
        })
        gsap.from('.inv-countdown__below > *', {
          y: 20,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.08,
          delay: 0.4,
          scrollTrigger: { trigger: ref.current, start: 'top 70%' },
        })
      })
    },
    { scope: ref }
  )

  const r = now === null ? null : remaining(target, now)

  return (
    <section ref={ref} id="countdown" className="inv-section inv-countdown" aria-label="Countdown">
      <div className="inv-column">
        <div className="inv-countdown__date inv-display" role="img" aria-label="10 October 2026">
          {WEDDING_DATE.stacked.map((n, i) => (
            <span key={i}>
              {n.split('').map((d, j) => (
                <span key={j}>{d}</span>
              ))}
            </span>
          ))}
        </div>

        <div className="inv-countdown__below">
          {r === null ? (
            <div className="inv-countdown__units" aria-hidden style={{ minHeight: '5rem' }} />
          ) : r.over ? (
            <p className="inv-display" style={{ fontSize: 'clamp(1.8rem, 7vw, 2.6rem)', marginTop: '2.5rem' }}>
              Thank you for <i>being there.</i>
            </p>
          ) : (
            <div className="inv-countdown__units" aria-live="polite">
              {[
                [r.days, 'days'],
                [r.hours, 'hours'],
                [r.minutes, 'minutes'],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="inv-countdown__num inv-display">{String(v).padStart(2, '0')}</p>
                  <p className="inv-label" style={{ marginTop: '0.5rem', opacity: 0.6 }}>
                    {l}
                  </p>
                </div>
              ))}
            </div>
          )}
          {r?.over ? null : (
            <a
              className="inv-btn inv-btn--ghost"
              href={icsHref(invited)}
              download="sita-fatan-wedding.ics"
              style={{ marginTop: '2.25rem' }}
            >
              Add to calendar
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
