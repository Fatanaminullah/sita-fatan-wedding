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
        // Codrops' on-scroll typography #21: every digit flies in from deep
        // in the page, tumbling, the outer ones from further, and settles
        // as the section takes the screen; all of it scrubbed to the scroll.
        const date = ref.current!.querySelector<HTMLElement>('.inv-countdown__date')
        const rows = gsap.utils.toArray<HTMLElement>('.inv-countdown__date > span')
        gsap.set(rows, { perspective: 1400 })
        rows.forEach((row, r) => {
          const chars = row.querySelectorAll<HTMLElement>('span')
          gsap.fromTo(
            chars,
            {
              opacity: 0,
              y: (i, _t, all) => -40 * Math.abs(i - all.length / 2),
              z: () => gsap.utils.random(-900, -400),
              rotationX: () => gsap.utils.random(-420, -180),
            },
            {
              opacity: 1,
              y: 0,
              z: 0,
              rotationX: 0,
              ease: 'power1.inOut',
              stagger: { each: 0.08, from: 'center' },
              // Each row lands a little after the one above it.
              scrollTrigger: { trigger: date, start: `top bottom-=${r * 6}%`, end: `top ${34 - r * 4}%`, scrub: true },
            }
          )
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
