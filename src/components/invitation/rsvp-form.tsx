'use client'

import { useState, useTransition } from 'react'
import { submitGuestRsvp } from '@/server/actions/rsvp-actions'
import { Label, Reveal, SUITE } from './invitation-shell'

/**
 * The guest's own answer.
 *
 * Built to the suite the greeting already uses, not to the Paper Theatre
 * brief: that design is still unapproved, and this exists so the flow can be
 * tested end to end. It is deliberately plain, and it will be restyled when
 * the invitation's visual world is settled. Nothing here assumes it survives.
 *
 * English throughout, per the owner's decision of 2026-08-09, which overrides
 * the Indonesian guest-copy rule still written in CLAUDE.md.
 *
 * One block per event they are actually invited to. A guest invited to one is
 * never shown the other, not even greyed: absence is silent, because a visibly
 * withheld event reads as exclusion.
 */

type EventKey = 'akad' | 'resepsi'
type Answer = 'attending' | 'not_attending' | 'pending'

const EVENT_NAME: Record<EventKey, string> = { akad: 'the Akad', resepsi: 'the Resepsi' }

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
  if (events.length === 0) return null

  return (
    <div className="mt-14 w-full">
      <Reveal order={7}>
        <Label style={{ color: SUITE.oxblood, opacity: 0.55 }}>Will you join us</Label>
      </Reveal>

      <div className="mt-6 flex w-full flex-col gap-5">
        {events.map((entry, i) => (
          <EventAnswer
            key={entry.event}
            slug={slug}
            pax={pax}
            event={entry.event}
            saved={entry.answer}
            savedPax={entry.paxConfirmed}
            order={8 + i}
            showName={events.length > 1}
          />
        ))}
      </div>
    </div>
  )
}

function EventAnswer({
  slug,
  pax,
  event,
  saved,
  savedPax,
  order,
  showName,
}: {
  slug: string
  pax: number
  event: EventKey
  saved: Answer
  savedPax: number | null
  order: number
  showName: boolean
}) {
  const [answer, setAnswer] = useState<Answer>(saved)
  const [chosenPax, setChosenPax] = useState<number>(savedPax ?? pax)
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  // There is no submit button: every tap writes. That is the right shape for a
  // guest invited to two events, who would otherwise have to answer twice and
  // then remember to press a third thing, and it cannot be left half-finished
  // by someone who closes the tab. But it only works if the page says so, and
  // the first version said nothing at all: the owner tapped through the whole
  // form and had no idea it had saved.
  const [justSaved, setJustSaved] = useState(false)

  function save(next: 'attending' | 'not_attending', nextPax: number) {
    setError(null)
    const previous = answer
    setAnswer(next)

    setJustSaved(false)

    startTransition(async () => {
      const result = await submitGuestRsvp({
        slug,
        event,
        attending: next === 'attending',
        pax: next === 'attending' ? nextPax : null,
      })
      if ('error' in result) {
        setAnswer(previous)
        setError(result.error)
        return
      }
      setJustSaved(true)
    })
  }

  return (
    <div
      className="w-full px-5 py-5"
      style={{ backgroundColor: SUITE.blush, borderRadius: '2px' }}
    >
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
            on={answer === 'attending'}
            disabled={saving}
            onClick={() => save('attending', chosenPax)}
          />
          <Choice
            label="Regretfully decline"
            on={answer === 'not_attending'}
            disabled={saving}
            onClick={() => save('not_attending', chosenPax)}
          />
        </div>

        {/* Only once somebody is actually coming. A headcount beside a decline
            asks a question with no meaning. */}
        {answer === 'attending' ? (
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
                    disabled={saving}
                    aria-pressed={n === chosenPax}
                    onClick={() => {
                      setChosenPax(n)
                      save('attending', n)
                    }}
                    className="min-h-11 min-w-11 px-3 text-[0.95rem] transition-opacity"
                    style={{
                      fontFamily: 'var(--font-text)',
                      borderRadius: '2px',
                      border: `1px solid ${SUITE.oxblood}`,
                      backgroundColor: n === chosenPax ? SUITE.oxblood : 'transparent',
                      color: n === chosenPax ? SUITE.paper : SUITE.oxblood,
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
            <p
              className="pt-3 text-[0.85rem]"
              style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.55 }}
            >
              {pax > 1
                ? `Your invitation is for ${pax}. If your plans change, simply come back to this page.`
                : 'If your plans change, simply come back to this page.'}
            </p>
          </div>
        ) : null}

        {answer === 'not_attending' ? (
          <p
            className="pt-4 text-[0.9rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.7 }}
          >
            Thank you for letting us know. You will be missed.
          </p>
        ) : null}

        {/* Says what was recorded, in the words a person would use, so nobody
            has to wonder whether it went through. Present on arrival too, for a
            guest returning to a page they already answered. */}
        {answer !== 'pending' && !error ? (
          <p
            aria-live="polite"
            className="mt-4 flex items-center gap-2 border-t pt-3 text-[0.85rem]"
            style={{
              fontFamily: 'var(--font-text)',
              color: SUITE.oxblood,
              borderColor: 'rgba(94,4,14,0.18)',
            }}
          >
            <span aria-hidden="true">{saving ? '·' : '✓'}</span>
            <span>
              {saving
                ? 'Saving your answer…'
                : answer === 'attending'
                  ? justSaved
                    ? `Saved. We have ${chosenPax === 1 ? 'you' : `${chosenPax} of you`} at ${EVENT_NAME[event]}.`
                    : `Your answer is saved: ${chosenPax === 1 ? 'you are' : `${chosenPax} of you are`} coming to ${EVENT_NAME[event]}.`
                  : justSaved
                    ? 'Saved. We have your reply.'
                    : `Your answer is saved: you cannot make ${EVENT_NAME[event]}.`}
            </span>
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
