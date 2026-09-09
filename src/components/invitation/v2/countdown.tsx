'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { EVENTS, WEDDING_DATE, type EventKey } from './content'

function remaining(target: number, now: number) {
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)
  return { days, hours, minutes, seconds, over: diff === 0 }
}

/** A two-digit number, each digit a strip of ten that rolls to the value. */
function Roll({ value }: { value: number }) {
  const digits = String(value).padStart(2, '0').split('')
  return (
    <span className="inv-countdown__num inv-display">
      {digits.map((d, i) => (
        <span key={i} className="inv-roll">
          <span className="inv-roll__strip" style={{ transform: `translateY(-${Number(d) * 10}%)` }}>
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
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
 * The date as a graphic object, three numerals stacked, every digit
 * tumbling in from deep in the page as the guest scrolls. Beneath it the
 * live count, its digits rolling every second.
 */
export function Countdown({ invited }: { invited: EventKey[] }) {
  const ref = useRef<HTMLElement>(null)
  const target = useMemo(() => new Date(WEDDING_DATE.startsAt).getTime(), [])
  // null on the server and the first client paint, so the numbers never
  // hydrate against a different clock than they rendered with.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
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
        // Codrops' on-scroll typography #11: each numeral rises out from
        // behind its own mask, like ink meeting paper. It plays on its own
        // clock the moment the date enters, and is never scrubbed.
        //
        // Scrubbing this was the bug. A scrubbed tween's resting state is
        // its "from" state, so a date whose trigger had been measured
        // against a stale page height simply stayed at opacity 0 while the
        // guest scrolled past it. Nothing errored; the date was never there.
        // Self-playing tweens cannot fail that way: the worst a stale
        // measurement costs now is an early or late start.
        const date = ref.current!.querySelector<HTMLElement>('.inv-countdown__date')
        const rows = gsap.utils.toArray<HTMLElement>('.inv-countdown__date > span')
        rows.forEach((row, r) => {
          const chars = row.querySelectorAll<HTMLElement>('.inv-countdown__char')
          gsap.fromTo(
            chars,
            { yPercent: 108 },
            {
              yPercent: 0,
              duration: 1,
              ease: 'expo',
              stagger: 0.042,
              // Each row follows the one above it.
              delay: r * 0.12,
              scrollTrigger: { trigger: date, start: 'top bottom-=8%', toggleActions: 'play none none reset' },
            }
          )
        })
        // The count and the button follow the date, the same way.
        const below = ref.current!.querySelector<HTMLElement>('.inv-countdown__below')
        gsap.fromTo(
          '.inv-countdown__units > div, .inv-countdown__cal',
          { opacity: 0, y: 22 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: { trigger: below, start: 'top bottom-=5%', toggleActions: 'play none none reset' },
          }
        )
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
                // The mask is what the numeral rises out of; it must clip,
                // so the two cannot be one element.
                <span key={j} className="inv-countdown__mask">
                  <span className="inv-countdown__char">{d}</span>
                </span>
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
                [r.seconds, 'seconds'],
              ].map(([v, l]) => (
                <div key={l}>
                  <Roll value={Number(v)} />
                  <p className="inv-label" style={{ marginTop: '0.5rem', opacity: 0.6 }}>
                    {l}
                  </p>
                </div>
              ))}
            </div>
          )}
          {r?.over ? null : (
            <a
              className="inv-btn inv-btn--ghost inv-countdown__cal"
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
