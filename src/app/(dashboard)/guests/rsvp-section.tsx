'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { recordGuestRsvp } from '@/server/actions/guest-actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { GuestListRow } from './guest-table'

/**
 * Answering on a guest's behalf, one event at a time.
 *
 * Separate from the main guest form, and saved separately, because the two do
 * different jobs. Editing a guest changes who they are and what they were
 * invited to; this records what they said back. Folding the answer into the
 * same submit would mean re-answering every time someone fixes a phone number.
 *
 * Per event, because a guest can attend the Akad and decline the Resepsi.
 *
 * Admin and above only. The `guard_guest_events_rsvp_columns` trigger enforces
 * that at the database, so this is about not showing an inviter a control that
 * could only fail.
 */

type EventKey = 'akad' | 'resepsi'

const EVENT_LABEL: Record<EventKey, string> = { akad: 'Akad', resepsi: 'Resepsi' }

export function RsvpSection({ guest }: { guest: GuestListRow }) {
  const invited: EventKey[] = (['akad', 'resepsi'] as const).filter(
    (event) => guest[event] !== 'none'
  )

  if (invited.length === 0) {
    return (
      <div className="border-t pt-4">
        <p className="text-sm text-muted-foreground">
          Not invited to either event, so there is nothing to answer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">Their answer</h3>
        <p className="text-sm text-muted-foreground">
          Only a guest recorded as coming can be checked in on the day.
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

  const current = event === 'akad' ? guest.akadRsvp : guest.resepsiRsvp
  const currentPax = event === 'akad' ? guest.akadPaxConfirmed : guest.resepsiPaxConfirmed
  const waitlisted = guest[event] === 'waitlisted'

  // Defaults to the full party, which is the common answer, and is also the
  // ceiling: pax can only ever be revised down from what they were invited for.
  const [pax, setPax] = useState<number>(currentPax ?? guest.pax)

  function save(answer: 'attending' | 'not_attending') {
    setError(null)
    setNote(null)
    const formData = new FormData()
    formData.set('guestId', guest.id)
    formData.set('event', event)
    formData.set('answer', answer)
    if (answer === 'attending') formData.set('paxConfirmed', String(pax))

    startTransition(async () => {
      const result = await recordGuestRsvp(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (result.flags.length > 0) setNote(flagText(result.flags, guest.pax))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{EVENT_LABEL[event]}</Label>
        <AnswerBadge status={current} waitlisted={waitlisted} />
      </div>

      {/* Shown whatever the current answer is: changing a "coming" from four to
          two is as ordinary as answering for the first time. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">How many</span>
        {Array.from({ length: guest.pax }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPax(n)}
            aria-pressed={n === pax}
            disabled={pending}
            className={`h-9 min-w-9 rounded-lg border px-2 font-mono text-sm transition-[background-color,border-color] duration-150 ${
              n === pax ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'
            }`}
          >
            {n}
          </button>
        ))}
        <span className="text-sm text-muted-foreground">of {guest.pax} invited</span>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={() => save('attending')}
        >
          <Check className="size-4" aria-hidden="true" />
          Coming
        </Button>
        {/* Not destructive-styled. Recording a decline is an ordinary answer,
            not a deletion, even though it is the one that blocks the door. */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={pending}
          onClick={() => save('not_attending')}
        >
          <X className="size-4" aria-hidden="true" />
          Not coming
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function AnswerBadge({
  status,
  waitlisted,
}: {
  status: GuestListRow['akadRsvp']
  waitlisted: boolean
}) {
  // Never colour alone (DESIGN.md): every state is a word first.
  if (status === 'attending') {
    return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">Coming</span>
  }
  if (status === 'not_attending') {
    return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">Not coming</span>
  }
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {waitlisted ? 'Waiting list, no answer' : 'No answer yet'}
    </span>
  )
}

function flagText(flags: string[], invitedPax: number): string | null {
  if (flags.includes('attending_while_waitlisted')) {
    return 'Recorded, but they are still on the waiting list. Move them up or they will be refused at the door.'
  }
  if (flags.includes('declined_while_waitlisted')) {
    return 'Recorded. They were on the waiting list, so this frees nothing that was promised.'
  }
  if (flags.includes('coming_with_fewer')) {
    return `Recorded. Fewer than the ${invitedPax} invited, so the rest goes back to the pool.`
  }
  return null
}
