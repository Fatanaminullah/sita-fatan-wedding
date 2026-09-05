'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { gsap, useGSAP, ScrollTrigger } from '@/lib/invitation/gsap'
import { useLenis } from './smooth-scroll'
import { submitGuestRsvp, type RsvpAnswerInput } from '@/server/actions/rsvp-actions'
import { EVENTS, type EventKey } from './content'
import { PHOTOS, type Photo } from './photos'

type Answer = 'attending' | 'not_attending' | 'pending'

export type RsvpEvent = {
  event: EventKey
  answer: Answer
  paxConfirmed: number | null
}

type Step =
  | { kind: 'ask'; event: EventKey }
  | { kind: 'pax'; event: EventKey }
  | { kind: 'review' }
  | { kind: 'done' }

type Draft = Record<EventKey, { answer: Answer; pax: number }>

/** Each screen has its own photograph beside the question. */
function photoFor(step: Step): Photo {
  if (step.kind === 'ask') return step.event === 'akad' ? PHOTOS.archStill : PHOTOS.brideNightSeated
  if (step.kind === 'pax') return step.event === 'akad' ? PHOTOS.oliveTree : PHOTOS.groomNight
  if (step.kind === 'review') return PHOTOS.veil
  return PHOTOS.doorway
}

/**
 * The reply is a form the size of the screen, one question at a time, the
 * way Typeform does it: a photograph on one side, the question on the
 * other, outlined answers with a key hint, an OK, and arrows to move
 * between screens. Wheel, swipe and keyboard all turn the page. Nothing
 * scrolls inside it.
 *
 * The page stops here until there is an answer. When the form reaches the
 * top of the screen the scroll is held (Lenis stopped, overflow on <html>)
 * and released the moment the reply is saved. Guests who already answered
 * are never held.
 *
 * Saves through the same server action as before; nothing about RSVP logic
 * lives here.
 */
export function Rsvp({
  slug,
  pax,
  events,
  onAnswered,
}: {
  slug: string
  pax: number
  events: RsvpEvent[]
  onAnswered: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const alreadyAnswered = events.some((e) => e.answer !== 'pending')

  const initialDraft = useMemo<Draft>(
    () =>
      Object.fromEntries(
        events.map((e) => [e.event, { answer: e.answer, pax: e.paxConfirmed ?? pax }])
      ) as Draft,
    [events, pax]
  )
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [saved, setSaved] = useState<Draft | null>(alreadyAnswered ? initialDraft : null)

  const steps = useMemo<Step[]>(() => {
    const s: Step[] = []
    for (const e of events) {
      s.push({ kind: 'ask', event: e.event })
      if (pax > 1) s.push({ kind: 'pax', event: e.event })
    }
    s.push({ kind: 'review' }, { kind: 'done' })
    return s
  }, [events, pax])

  const [index, setIndex] = useState(() => (alreadyAnswered ? steps.length - 1 : 0))
  const [dir, setDir] = useState<1 | -1>(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()

  const step = steps[index]
  const lenis = useLenis()
  const [locked, setLocked] = useState(false)

  const lockY = useRef<number | null>(null)
  /** Once the reply is saved the hold is over for good, even if they change it. */
  const released = useRef(alreadyAnswered)

  // Hold the page here. Watches Lenis's own scroll stream (it also reports
  // native touch scroll), so it fires however the guest arrived. Once held,
  // any scroll that still gets through is put straight back.
  useEffect(() => {
    if (alreadyAnswered) return
    const l = lenis.current
    const el = ref.current
    if (!l || !el) return
    const onScroll = ({ scroll }: { scroll: number }) => {
      if (released.current) return
      if (lockY.current !== null) {
        if (Math.abs(scroll - lockY.current) > 1) {
          l.scrollTo(lockY.current, { immediate: true, force: true })
          window.scrollTo(0, lockY.current)
        }
        return
      }
      const top = el.getBoundingClientRect().top + scroll
      if (scroll >= top - window.innerHeight * 0.25) {
        lockY.current = top
        setLocked(true)
        l.scrollTo(top, { immediate: true, force: true })
        window.scrollTo(0, top)
        l.stop()
        document.documentElement.classList.add('inv-locked')
      }
    }
    l.on('scroll', onScroll)
    return () => {
      l.off('scroll', onScroll)
    }
  }, [alreadyAnswered, lenis])

  useEffect(() => {
    if (!locked || step.kind !== 'done') return
    released.current = true
    lockY.current = null
    document.documentElement.classList.remove('inv-locked')
    lenis.current?.start()
    const id = requestAnimationFrame(() => {
      setLocked(false)
      ScrollTrigger.refresh()
    })
    return () => cancelAnimationFrame(id)
  }, [locked, step.kind, lenis])

  const questionCount = steps.length - 2
  const progress = step.kind === 'done' ? 1 : Math.min(1, index / questionCount)

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return
      // The next screen comes up from below (or down from above, going
      // back), the way a page turns.
      gsap.fromTo(
        paneRef.current,
        { y: dir * 64, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }
      )
      gsap.fromTo(
        paneRef.current?.querySelectorAll('[data-rise]') ?? [],
        { y: dir * 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.06, delay: 0.08 }
      )
    },
    { scope: ref, dependencies: [index] }
  )

  function go(next: number, d: 1 | -1 = 1) {
    setDir(d)
    setError(null)
    setIndex(Math.max(0, Math.min(steps.length - 1, next)))
  }

  function advanceFrom(i: number, justAnswered?: Answer) {
    const cur = steps[i]
    let next = i + 1
    const answer = cur.kind === 'ask' ? (justAnswered ?? draft[cur.event].answer) : null
    // A "no" skips that event's pax question.
    if (answer === 'not_attending' && steps[next]?.kind === 'pax') next += 1
    go(next, 1)
  }

  function back() {
    let prev = index - 1
    const p = steps[prev]
    if (p?.kind === 'pax' && draft[p.event].answer === 'not_attending') prev -= 1
    go(prev, -1)
  }

  function choose(event: EventKey, answer: Answer) {
    setDraft((d) => ({ ...d, [event]: { ...d[event], answer } }))
    // Let the pressed state paint before moving on.
    setTimeout(() => advanceFrom(index, answer), 220)
  }

  function submit() {
    const answers: RsvpAnswerInput[] = events.map((e) => ({
      event: e.event,
      attending: draft[e.event].answer === 'attending',
      pax: draft[e.event].answer === 'attending' ? draft[e.event].pax : null,
    }))
    startTransition(async () => {
      const res = await submitGuestRsvp({ slug, answers })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSaved(draft)
      onAnswered()
      go(steps.length - 1, 1)
    })
  }

  function change() {
    setDraft(saved ?? initialDraft)
    go(0, -1)
  }

  /** Can the guest move on from this screen without doing anything else? */
  const canForward =
    step.kind === 'pax' || (step.kind === 'ask' && draft[step.event].answer !== 'pending')
  const canBack = index > 0 && step.kind !== 'done'

  // Wheel, swipe and keys turn the page while the form owns the screen.
  // Refs, so the listeners never go stale between renders.
  const nav = useRef({ index, canForward, canBack, kind: step.kind, event: step.kind === 'ask' ? step.event : null })
  const advanceRef = useRef(advanceFrom)
  const backRef = useRef(back)
  const chooseRef = useRef(choose)
  useEffect(() => {
    nav.current = { index, canForward, canBack, kind: step.kind, event: step.kind === 'ask' ? step.event : null }
    advanceRef.current = advanceFrom
    backRef.current = back
    chooseRef.current = choose
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let busyUntil = 0
    const turn = (d: 1 | -1) => {
      const now = performance.now()
      if (now < busyUntil) return
      const n = nav.current
      if (d === 1 && n.canForward) {
        busyUntil = now + 800
        advanceRef.current(n.index)
      } else if (d === -1 && n.canBack) {
        busyUntil = now + 800
        backRef.current()
      }
    }
    let wheelAcc = 0
    const onWheel = (e: WheelEvent) => {
      if (!lockY.current && released.current) return
      wheelAcc += e.deltaY
      if (Math.abs(wheelAcc) > 60) {
        turn(wheelAcc > 0 ? 1 : -1)
        wheelAcc = 0
      }
    }
    let touchY: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY === null) return
      if (!lockY.current && released.current) return
      const dy = touchY - (e.changedTouches[0]?.clientY ?? touchY)
      touchY = null
      if (Math.abs(dy) > 56) turn(dy > 0 ? 1 : -1)
    }
    const onKey = (e: KeyboardEvent) => {
      if (!lockY.current && released.current) return
      const n = nav.current
      if (e.key === 'ArrowDown') turn(1)
      else if (e.key === 'ArrowUp') turn(-1)
      else if (e.key === 'Enter' && n.kind === 'pax') turn(1)
      else if (n.kind === 'ask' && n.event && (e.key === 'a' || e.key === 'A')) chooseRef.current(n.event, 'attending')
      else if (n.kind === 'ask' && n.event && (e.key === 'b' || e.key === 'B')) chooseRef.current(n.event, 'not_attending')
      else return
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const photos = useMemo(() => {
    const seen = new Map<string, Photo>()
    for (const s of steps) {
      const p = photoFor(s)
      seen.set(p.src, p)
    }
    return [...seen.values()]
  }, [steps])
  const current = photoFor(step)

  return (
    <section ref={ref} id="rsvp" className={`inv-rsvp${locked ? ' inv-rsvp--locked' : ''}`} aria-label="RSVP">
      <div className="inv-rsvp__photo" aria-hidden>
        {photos.map((p) => (
          <div key={p.src} className={`inv-rsvp__shot${p.src === current.src ? ' is-on' : ''}`}>
            <Image src={p.src} alt="" fill sizes="(min-width: 900px) 50vw, 100vw" quality={85} />
          </div>
        ))}
        <div className="inv-rsvp__photo-wash" />
      </div>

      <div className="inv-rsvp__stage">
        <div className="inv-rsvp__progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p className="inv-label inv-rsvp__crumb">
          RSVP
          {step.kind !== 'done' ? (
            <span style={{ opacity: 0.6 }}>
              {' '}
              · {Math.min(index + 1, questionCount)} of {questionCount}
            </span>
          ) : null}
        </p>

        <div ref={paneRef} key={index} className="inv-rsvp__pane">
          {step.kind === 'ask' ? (
            <Ask event={step.event} current={draft[step.event].answer} onChoose={(a) => choose(step.event, a)} />
          ) : step.kind === 'pax' ? (
            <Pax
              event={step.event}
              max={pax}
              value={draft[step.event].pax}
              onChange={(v) => setDraft((d) => ({ ...d, [step.event]: { ...d[step.event], pax: v } }))}
              onNext={() => advanceFrom(index)}
            />
          ) : step.kind === 'review' ? (
            <Review draft={draft} events={events} saving={saving} error={error} onSend={submit} />
          ) : (
            <Done draft={saved ?? draft} events={events} onChange={change} />
          )}
        </div>

        <div className="inv-rsvp__nav" aria-label="Move between questions">
          <button type="button" onClick={back} disabled={!canBack} aria-label="Previous question">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M6 14l6-6 6 6" />
            </svg>
          </button>
          <button type="button" onClick={() => advanceFrom(index)} disabled={!canForward} aria-label="Next question">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M6 10l6 6 6-6" />
            </svg>
          </button>
        </div>
        {locked ? (
          <p className="inv-label inv-rsvp__lock" aria-live="polite">
            Answer to continue
          </p>
        ) : null}
      </div>
    </section>
  )
}

function Ok({ label, hint, onClick, disabled }: { label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="inv-rsvp__okrow" data-rise>
      <button type="button" className="inv-ok" onClick={onClick} disabled={disabled}>
        {label}
      </button>
      {hint ? <span className="inv-rsvp__hint inv-body">{hint}</span> : null}
    </div>
  )
}

function Ask({ event, current, onChoose }: { event: EventKey; current: Answer; onChoose: (a: Answer) => void }) {
  const ev = EVENTS[event]
  return (
    <div>
      <p className="inv-label inv-rsvp__eyebrow" data-rise>
        {ev.name} · {ev.timeLine}
      </p>
      <h2 className="inv-rsvp__q inv-display" data-rise>
        Will you join us at the <i>{ev.name}</i>?
      </h2>
      <p className="inv-body inv-rsvp__sub" data-rise>
        {ev.venue}, {ev.address}
      </p>
      <div className="inv-rsvp__choices" data-rise>
        <button type="button" className="inv-choice" aria-pressed={current === 'attending'} onClick={() => onChoose('attending')}>
          <span className="inv-choice__key">A</span>
          <span>Yes, I&rsquo;ll be there</span>
        </button>
        <button
          type="button"
          className="inv-choice"
          aria-pressed={current === 'not_attending'}
          onClick={() => onChoose('not_attending')}
        >
          <span className="inv-choice__key">B</span>
          <span>Sadly, I can&rsquo;t</span>
        </button>
      </div>
    </div>
  )
}

function Pax({
  event,
  max,
  value,
  onChange,
  onNext,
}: {
  event: EventKey
  max: number
  value: number
  onChange: (v: number) => void
  onNext: () => void
}) {
  return (
    <div>
      <p className="inv-label inv-rsvp__eyebrow" data-rise>
        {EVENTS[event].name}
      </p>
      <h2 className="inv-rsvp__q inv-display" data-rise>
        How many of you <i>are coming?</i>
      </h2>
      <p className="inv-body inv-rsvp__sub" data-rise>
        We kept {max} places for you.
      </p>
      <div className="inv-stepper" data-rise role="group" aria-label="Number of guests">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Fewer">
          −
        </button>
        <span className="inv-stepper__num inv-display" aria-live="polite">
          {value}
        </span>
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="More">
          +
        </button>
      </div>
      <Ok label="OK" hint="press Enter ↵" onClick={onNext} />
    </div>
  )
}

function summary(draft: Draft, events: RsvpEvent[]) {
  return events.map((e) => {
    const d = draft[e.event]
    const name = EVENTS[e.event].name
    if (d.answer === 'attending') return { name, line: d.pax === 1 ? 'Coming' : `${d.pax} of you`, yes: true }
    return { name, line: 'Not able to make it', yes: false }
  })
}

function Review({
  draft,
  events,
  saving,
  error,
  onSend,
}: {
  draft: Draft
  events: RsvpEvent[]
  saving: boolean
  error: string | null
  onSend: () => void
}) {
  const rows = summary(draft, events)
  return (
    <div>
      <p className="inv-label inv-rsvp__eyebrow" data-rise>
        One last look
      </p>
      <h2 className="inv-rsvp__q inv-display" data-rise>
        Does this look <i>right?</i>
      </h2>
      <dl className="inv-rsvp__rows" data-rise>
        {rows.map((r) => (
          <div key={r.name}>
            <dt className="inv-body">{r.name}</dt>
            <dd className="inv-body" style={{ opacity: r.yes ? 1 : 0.6 }}>
              {r.line}
            </dd>
          </div>
        ))}
      </dl>
      {error ? (
        <p className="inv-body" role="alert" style={{ marginTop: '1rem', fontSize: '0.92rem' }}>
          {error}
        </p>
      ) : null}
      <Ok label={saving ? 'Sending…' : 'Send my reply'} onClick={onSend} disabled={saving} />
    </div>
  )
}

function Done({ draft, events, onChange }: { draft: Draft; events: RsvpEvent[]; onChange: () => void }) {
  const rows = summary(draft, events)
  const anyYes = rows.some((r) => r.yes)
  const checkRef = useRef<SVGSVGElement>(null)

  useGSAP(
    () => {
      gsap.fromTo(
        checkRef.current?.querySelector('path') ?? null,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 1, ease: 'power2.inOut', delay: 0.2 }
      )
    },
    { scope: checkRef }
  )

  return (
    <div>
      <svg ref={checkRef} className="inv-check" viewBox="0 0 72 72" fill="none" aria-hidden data-rise>
        <path d="M14 38 L30 53 L60 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="inv-rsvp__q inv-display" data-rise>
        {anyYes ? (
          <>
            See you on <i>10 October.</i>
          </>
        ) : (
          <>
            We&rsquo;ll <i>miss you.</i>
          </>
        )}
      </h2>
      <dl className="inv-rsvp__rows" data-rise>
        {rows.map((r) => (
          <div key={r.name}>
            <dt className="inv-body">{r.name}</dt>
            <dd className="inv-body" style={{ opacity: r.yes ? 1 : 0.6 }}>
              {r.line}
            </dd>
          </div>
        ))}
      </dl>
      <div className="inv-rsvp__okrow" data-rise>
        <button type="button" className="inv-ok inv-ok--ghost" onClick={onChange}>
          Change my answer
        </button>
      </div>
    </div>
  )
}
