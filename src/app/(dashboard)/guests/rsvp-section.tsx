'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordGuestRsvp } from '@/server/actions/guest-actions'
import { Label } from '@/components/ui/label'
import type { GuestListRow } from './guest-table'

/**
 * Answering on a guest's behalf, one event at a time.
 *
 * One control per event, and it is the answer rather than a set of buttons
 * beside it. The first version separated the two: a badge stated the current
 * answer while two buttons offered the actions, and because a filled button
 * means "selected" everywhere else on this screen, a filled "Coming" next to a
 * "Not coming" badge read as a direct contradiction. Now the selected segment
 * IS the recorded answer, so the two cannot disagree.
 *
 * Selecting writes immediately. There is no separate save: the guest form's
 * own submit is about who the guest is, and folding an answer into it would
 * mean re-answering every time someone corrects a phone number.
 *
 * Per event, because a guest can attend the Akad and decline the Resepsi.
 *
 * Admin and above only. `guard_guest_events_rsvp_columns` enforces that at the
 * database; this is about not showing an inviter a control that could only
 * fail.
 */

type EventKey = 'akad' | 'resepsi'
type Answer = 'pending' | 'attending' | 'not_attending'

const EVENT_LABEL: Record<EventKey, string> = { akad: 'Akad', resepsi: 'Resepsi' }

const CHOICES: { value: Answer; label: string }[] = [
  { value: 'pending', label: 'No answer' },
  { value: 'attending', label: 'Coming' },
  { value: 'not_attending', label: 'Not coming' },
]

export function RsvpSection({ guest }: { guest: GuestListRow }) {
  const invited: EventKey[] = (['akad', 'resepsi'] as const).filter(
    (event) => guest[event] !== 'none'
  )

  if (invited.length === 0) {
    return (
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium">Their answer</h3>
        <p className="pt-1 text-sm text-muted-foreground">
          Not invited to either event, so there is nothing to answer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">Their answer</h3>
        <p className="text-sm text-muted-foreground">
          Saved as you choose. Only a guest recorded as coming can be checked in.
        </p>
      </div>
      {invited.map((event) => (
        <EventAnswer key={event} guest={guest} event={event} />
      ))}
    </div>
  )
}

function EventAnswer({ guest, event }: { guest: GuestListRow; event: EventKey }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const saved: Answer = (event === 'akad' ? guest.akadRsvp : guest.resepsiRsvp) ?? 'pending'
  const savedPax = event === 'akad' ? guest.akadPaxConfirmed : guest.resepsiPaxConfirmed
  const waitlisted = guest[event] === 'waitlisted'

  // Optimistic, so a tap does not sit inert while the round trip happens. The
  // server's re-read is what finally decides; a refusal puts this back.
  const [answer, setAnswer] = useState<Answer>(saved)
  const [pax, setPax] = useState<number>(savedPax ?? guest.pax)

  function save(next: Answer, nextPax: number) {
    setError(null)
    setNote(null)
    const previous = answer
    setAnswer(next)

    const formData = new FormData()
    formData.set('guestId', guest.id)
    formData.set('event', event)
    formData.set('answer', next)
    if (next === 'attending') formData.set('paxConfirmed', String(nextPax))

    startTransition(async () => {
      const result = await recordGuestRsvp(formData)
      if ('error' in result) {
        setAnswer(previous)
        setError(result.error)
        return
      }
      if (result.flags.length > 0) setNote(flagText(result.flags, guest.pax))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm">{EVENT_LABEL[event]}</Label>
        {waitlisted ? (
          <span className="text-xs text-muted-foreground">on the waiting list</span>
        ) : null}
      </div>

      {/* Not pill geometry: DESIGN.md reserves pills for status badges, and
          this is a control. Selection is a fill change plus weight, never a
          border alone. */}
      <div
        role="group"
        aria-label={`${EVENT_LABEL[event]} answer`}
        className="flex w-full overflow-hidden rounded-lg border"
      >
        {CHOICES.map((choice, i) => {
          const on = choice.value === answer
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => save(choice.value, pax)}
              className={`h-10 flex-1 text-sm transition-[background-color] duration-150 disabled:opacity-60 ${
                i > 0 ? 'border-l' : ''
              } ${on ? 'bg-secondary font-medium' : 'bg-background text-muted-foreground'}`}
            >
              {choice.label}
            </button>
          )
        })}
      </div>

      {/* Only when someone is actually coming. A headcount beside a decline
          asks a question that has no meaning, and showing it before any answer
          implies one is needed to say no. */}
      {answer === 'attending' ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-sm text-muted-foreground">How many</span>
          {Array.from({ length: guest.pax }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === pax}
              disabled={pending}
              onClick={() => {
                setPax(n)
                save('attending', n)
              }}
              className={`h-9 min-w-9 rounded-lg border px-2 font-mono text-sm transition-[background-color,border-color] duration-150 disabled:opacity-60 ${
                n === pax ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {n}
            </button>
          ))}
          <span className="text-sm text-muted-foreground">of {guest.pax} invited</span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function flagText(flags: string[], invitedPax: number): string | null {
  if (flags.includes('attending_while_waitlisted')) {
    return 'Saved, but they are still on the waiting list. Move them up or they will be refused at the door.'
  }
  if (flags.includes('declined_while_waitlisted')) {
    return 'Saved. They were on the waiting list, so this frees nothing that was promised.'
  }
  if (flags.includes('coming_with_fewer')) {
    return `Saved. Fewer than the ${invitedPax} invited, so the rest goes back to the pool.`
  }
  return null
}
