'use client'

import { useMemo, useState, useTransition } from 'react'
import { submitGuestRsvp } from '@/server/actions/rsvp-actions'
import { Label, Reveal, SUITE } from './invitation-shell'

/**
 * The guest's own answer.
 *
 * Built to the suite the greeting already uses, not to the Paper Theatre
 * brief: that design is still unapproved, and this exists so the flow can be
 * tested end to end. It will be restyled when the invitation's visual world is
 * settled. Nothing here assumes it survives.
 *
 * English throughout, per the owner's decision of 2026-08-09, which overrides
 * the Indonesian guest-copy rule still written in CLAUDE.md.
 *
 * One block per event they are actually invited to. A guest invited to one is
 * never shown the other, not even greyed: absence is silent, because a visibly
 * withheld event reads as exclusion.
 *
 * Choices are held locally and sent by one button. The first version wrote on
 * every tap, which was fewer steps and quietly wrong: a guest deciding between
 * two events was committing each half-thought as they went, with no moment to
 * look at their whole answer before it counted. The owner's reasoning was
 * simply "guests need to be sure of their answer first", and a wedding reply
 * is exactly the kind of thing somebody changes their mind about twice while
 * reading it.
 */

type EventKey = 'akad' | 'resepsi'
type Answer = 'attending' | 'not_attending' | 'pending'

const EVENT_NAME: Record<EventKey, string> = { akad: 'the Akad', resepsi: 'the Resepsi' }

type Draft = { answer: Answer; pax: number }

export type RsvpFormProps = {
  slug: string
  /** How many people the invitation was for. The ceiling on any answer. */
  pax: number
  events: Array<{
    event: EventKey
    /** What is already on file, so a returning guest sees their own answer. */
    answer: Answer
    paxConfirmed: number | null
  }>
}

export function RsvpForm({ slug, pax, events }: RsvpFormProps) {
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      events.map((e) => [e.event, { answer: e.answer, pax: e.paxConfirmed ?? pax }])
    )
  )
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [saving, startTransition] = useTransition()

  /** What is on file right now, as opposed to what is being chosen. */
  const onFile = useMemo(
    () => Object.fromEntries(events.map((e) => [e.event, e.answer])),
    [events]
  )

  const answeredAll = events.every((e) => draft[e.event]?.answer !== 'pending')
  const changed = events.some((e) => {
    const d = draft[e.event]
    const original = e
    if (!d) return false
    if (d.answer !== original.answer) return true
    return d.answer === 'attending' && d.pax !== (original.paxConfirmed ?? pax)
  })

  const alreadyAnswered = events.some((e) => onFile[e.event] !== 'pending')

  if (events.length === 0) return null

  function submit() {
    setError(null)
    setSent(false)
    startTransition(async () => {
      const result = await submitGuestRsvp({
        slug,
        answers: events.map((e) => {
          const d = draft[e.event]
          return {
            event: e.event,
            attending: d.answer === 'attending',
            pax: d.answer === 'attending' ? d.pax : null,
          }
        }),
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSent(true)
    })
  }

  return (
    <div className="mt-14 w-full">
      <Reveal order={7}>
        <Label style={{ color: SUITE.oxblood, opacity: 0.55 }}>Will you join us</Label>
      </Reveal>

      <div className="mt-6 flex w-full flex-col gap-5">
        {events.map((entry, i) => (
          <EventAnswer
            key={entry.event}
            pax={pax}
            event={entry.event}
            draft={draft[entry.event]}
            disabled={saving}
            order={8 + i}
            showName={events.length > 1}
            onChange={(next) => {
              setSent(false)
              setDraft((current) => ({ ...current, [entry.event]: next }))
            }}
          />
        ))}
      </div>

      <Reveal order={8 + events.length} className="mt-6 w-full">
        <button
          type="button"
          onClick={submit}
          // Nothing to send until every invited event has an answer, and
          // nothing to re-send when the reply already on file is unchanged.
          disabled={saving || !answeredAll || (alreadyAnswered && !changed)}
          className="min-h-12 w-full px-4 text-[0.95rem] transition-opacity"
          style={{
            fontFamily: 'var(--font-text)',
            borderRadius: '2px',
            border: `1px solid ${SUITE.oxblood}`,
            backgroundColor: SUITE.oxblood,
            color: SUITE.paper,
            opacity: saving || !answeredAll || (alreadyAnswered && !changed) ? 0.45 : 1,
          }}
        >
          {saving
            ? 'Sending your reply…'
            : alreadyAnswered && !changed
              ? 'Your reply is with us'
              : alreadyAnswered
                ? 'Update my reply'
                : 'Send my reply'}
        </button>

        {/* Says what will be sent, before it is sent, so a guest can check
            their whole answer rather than trusting that two separate taps
            landed the way they meant. */}
        {answeredAll && (!alreadyAnswered || changed) && !saving ? (
          <p
            className="pt-3 text-[0.85rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.6 }}
          >
            {events
              .map((e) => {
                const d = draft[e.event]
                if (d.answer === 'attending') {
                  return `${d.pax === 1 ? 'You' : `${d.pax} of you`} at ${EVENT_NAME[e.event]}`
                }
                return `Not able to make ${EVENT_NAME[e.event]}`
              })
              .join('. ') + '.'}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="pt-3 text-[0.9rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood }}
          >
            {error}
          </p>
        ) : null}

        {sent && !error ? (
          <p
            aria-live="polite"
            className="pt-3 text-[0.9rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood }}
          >
            Thank you. We have your reply, and we cannot wait to see you.
          </p>
        ) : null}

        {alreadyAnswered && !changed && !sent ? (
          <p
            className="pt-3 text-[0.85rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.55 }}
          >
            If your plans change, adjust your answer above and send it again.
          </p>
        ) : null}
      </Reveal>
    </div>
  )
}

function EventAnswer({
  pax,
  event,
  draft,
  disabled,
  order,
  showName,
  onChange,
}: {
  pax: number
  event: EventKey
  draft: Draft
  disabled: boolean
  order: number
  showName: boolean
  onChange: (next: Draft) => void
}) {
  return (
    <div className="w-full px-5 py-5" style={{ backgroundColor: SUITE.blush, borderRadius: '2px' }}>
      <Reveal order={order}>
        {showName ? (
          <p
            className="pb-3 text-[0.95rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.7 }}
          >
            For {EVENT_NAME[event]}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Choice
            label="Joyfully accept"
            on={draft.answer === 'attending'}
            disabled={disabled}
            onClick={() => onChange({ ...draft, answer: 'attending' })}
          />
          <Choice
            label="Regretfully decline"
            on={draft.answer === 'not_attending'}
            disabled={disabled}
            onClick={() => onChange({ ...draft, answer: 'not_attending' })}
          />
        </div>

        {/* Only once somebody is actually coming. A headcount beside a decline
            asks a question with no meaning. */}
        {draft.answer === 'attending' ? (
          <div className="pt-4">
            <p
              className="pb-2 text-[0.9rem]"
              style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.7 }}
            >
              {pax === 1 ? 'We have reserved a place for you.' : 'How many of you will come?'}
            </p>
            {pax > 1 ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: pax }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    aria-pressed={n === draft.pax}
                    onClick={() => onChange({ ...draft, pax: n })}
                    className="min-h-11 min-w-11 px-3 text-[0.95rem] transition-opacity"
                    style={{
                      fontFamily: 'var(--font-text)',
                      borderRadius: '2px',
                      border: `1px solid ${SUITE.oxblood}`,
                      backgroundColor: n === draft.pax ? SUITE.oxblood : 'transparent',
                      color: n === draft.pax ? SUITE.paper : SUITE.oxblood,
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
            {pax > 1 ? (
              <p
                className="pt-3 text-[0.85rem]"
                style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.55 }}
              >
                Your invitation is for {pax}.
              </p>
            ) : null}
          </div>
        ) : null}

        {draft.answer === 'not_attending' ? (
          <p
            className="pt-4 text-[0.9rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.7 }}
          >
            You will be missed.
          </p>
        ) : null}
      </Reveal>
    </div>
  )
}

function Choice({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="min-h-11 flex-1 px-3 text-[0.95rem] transition-opacity"
      style={{
        fontFamily: 'var(--font-text)',
        borderRadius: '2px',
        border: `1px solid ${SUITE.oxblood}`,
        backgroundColor: on ? SUITE.oxblood : 'transparent',
        color: on ? SUITE.paper : SUITE.oxblood,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}
