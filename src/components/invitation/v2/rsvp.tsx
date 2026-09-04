'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { submitGuestRsvp, type RsvpAnswerInput } from '@/server/actions/rsvp-actions'
import { EVENTS, type EventKey } from './content'

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

/**
 * One question at a time, like a conversation. Tap an answer and the next
 * question slides in; the number of guests is a stepper, never a keyboard.
 * A review card before sending, because a wedding reply is exactly the sort
 * of thing a person changes their mind about while reading it back.
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
  const questionCount = steps.length - 2
  const progress = step.kind === 'done' ? 1 : Math.min(1, index / questionCount)

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return
      gsap.fromTo(
        paneRef.current,
        { y: dir * 36, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' }
      )
    },
    { scope: ref, dependencies: [index] }
  )

  function go(next: number, d: 1 | -1 = 1) {
    setDir(d)
    setError(null)
    // A "no" skips that event's pax question.
    setIndex(Math.max(0, Math.min(steps.length - 1, next)))
  }

  function advanceFrom(i: number) {
    const cur = steps[i]
    let next = i + 1
    if (cur.kind === 'ask' && draft[cur.event].answer === 'not_attending' && steps[next]?.kind === 'pax') {
      next += 1
    }
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
    setTimeout(() => advanceFrom(index), 180)
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

  return (
    <section ref={ref} id="rsvp" className="inv-section inv-rsvp" aria-label="RSVP">
      <div className="inv-column">
        <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
          RSVP
        </p>
        <h2 className="inv-display" style={{ fontSize: 'clamp(2.6rem, 11vw, 4.6rem)', marginTop: '0.6rem' }}>
          Will you <i>be there?</i>
        </h2>

        <div className="inv-card inv-rsvp__sheet" style={{ marginTop: '2rem' }}>
          <div className="inv-rsvp__progress" aria-hidden>
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>

          <div ref={paneRef} key={index}>
            {step.kind === 'ask' ? (
              <Ask
                event={step.event}
                n={index + 1}
                current={draft[step.event].answer}
                onChoose={(a) => choose(step.event, a)}
              />
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

          {index > 0 && step.kind !== 'done' ? (
            <button
              type="button"
              onClick={back}
              className="inv-label"
              style={{
                marginTop: '1.5rem',
                background: 'none',
                border: 0,
                padding: '0.5rem 0',
                color: 'var(--oxblood)',
                opacity: 0.7,
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Ask({
  event,
  n,
  current,
  onChoose,
}: {
  event: EventKey
  n: number
  current: Answer
  onChoose: (a: Answer) => void
}) {
  const ev = EVENTS[event]
  return (
    <div>
      <p className="inv-label" style={{ opacity: 0.55 }}>
        {n} · {ev.name}
      </p>
      <p className="inv-rsvp__q inv-display" style={{ marginTop: '0.75rem' }}>
        Will you join us at the <i>{ev.name}</i>?
      </p>
      <p className="inv-body" style={{ marginTop: '0.5rem', opacity: 0.65, fontSize: '0.92rem' }}>
        {ev.timeLine} · {ev.venue}
      </p>
      <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1.5rem' }}>
        <button
          type="button"
          className="inv-choice"
          aria-pressed={current === 'attending'}
          onClick={() => onChoose('attending')}
        >
          <span>Yes, I&rsquo;ll be there</span>
          <span className="inv-choice__key">A</span>
        </button>
        <button
          type="button"
          className="inv-choice"
          aria-pressed={current === 'not_attending'}
          onClick={() => onChoose('not_attending')}
        >
          <span>Sadly, I can&rsquo;t</span>
          <span className="inv-choice__key">B</span>
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
      <p className="inv-label" style={{ opacity: 0.55 }}>
        {EVENTS[event].name}
      </p>
      <p className="inv-rsvp__q inv-display" style={{ marginTop: '0.75rem' }}>
        How many of you?
      </p>
      <p className="inv-body" style={{ marginTop: '0.5rem', opacity: 0.65, fontSize: '0.92rem' }}>
        We kept {max} places for you.
      </p>
      <div className="inv-stepper" style={{ marginTop: '1.25rem' }} role="group" aria-label="Number of guests">
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
      <button type="button" className="inv-btn" style={{ width: '100%', marginTop: '1.25rem' }} onClick={onNext}>
        Next
      </button>
    </div>
  )
}

function summary(draft: Draft, events: RsvpEvent[]) {
  return events.map((e) => {
    const d = draft[e.event]
    const name = EVENTS[e.event].name
    if (d.answer === 'attending') return { name, line: d.pax === 1 ? 'Coming' : `${d.pax} of you` , yes: true }
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
      <p className="inv-label" style={{ opacity: 0.55 }}>
        One last look
      </p>
      <p className="inv-rsvp__q inv-display" style={{ marginTop: '0.75rem' }}>
        Does this look <i>right?</i>
      </p>
      <dl style={{ marginTop: '1.5rem', display: 'grid', gap: '0.75rem' }}>
        {rows.map((r) => (
          <div
            key={r.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid rgba(94,4,14,0.15)',
            }}
          >
            <dt className="inv-body">{r.name}</dt>
            <dd className="inv-body" style={{ color: r.yes ? 'var(--oxblood)' : 'inherit', opacity: r.yes ? 1 : 0.6 }}>
              {r.line}
            </dd>
          </div>
        ))}
      </dl>
      {error ? (
        <p className="inv-body" role="alert" style={{ marginTop: '1rem', color: 'var(--oxblood)', fontSize: '0.92rem' }}>
          {error}
        </p>
      ) : null}
      <button type="button" className="inv-btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={onSend} disabled={saving}>
        {saving ? 'Sending…' : 'Send my reply'}
      </button>
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
    <div style={{ textAlign: 'center' }}>
      <svg ref={checkRef} className="inv-check" viewBox="0 0 72 72" fill="none" style={{ margin: '0 auto' }} aria-hidden>
        <path d="M14 38 L30 53 L60 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="inv-rsvp__q inv-display" style={{ marginTop: '1rem' }}>
        {anyYes ? (
          <>
            See you on <i>10 October.</i>
          </>
        ) : (
          <>
            We&rsquo;ll <i>miss you.</i>
          </>
        )}
      </p>
      <dl style={{ marginTop: '1.25rem', display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => (
          <div key={r.name} className="inv-body" style={{ opacity: 0.75, fontSize: '0.95rem' }}>
            <dt style={{ display: 'inline' }}>{r.name}: </dt>
            <dd style={{ display: 'inline' }}>{r.line}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="inv-btn inv-btn--ghost" style={{ marginTop: '1.5rem' }} onClick={onChange}>
        Change my answer
      </button>
    </div>
  )
}
