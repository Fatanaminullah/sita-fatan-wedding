'use client'

import { useActionState, useState } from 'react'
import { promoteGuest } from '@/server/actions/waitlist-actions'
import { Button } from '@/components/ui/button'

type FormState = { promoted?: boolean; flags?: string[] }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await promoteGuest(formData)
  return { promoted: true, flags: result.flags }
}

export function PromoteButton({
  guestEventId,
  guestId,
  guestName,
  inviterKey,
  event,
  guestPax,
}: {
  guestEventId: string
  guestId: string
  guestName: string
  inviterKey: string
  event: 'akad' | 'resepsi'
  guestPax: number
}) {
  const [state, formAction] = useActionState(submitAction, {})
  // Promotion takes a scarce seat immediately and there is no undo, so it gets
  // the same two-step the guest dialog gives Delete. A parent skimming the
  // cascade on a phone must not be able to reassign a seat with one stray tap.
  const [confirming, setConfirming] = useState(false)

  if (state.promoted) {
    return (
      // aria-live: the row swaps in place with no navigation and no focus
      // move, so without it a screen-reader user gets no confirmation at all.
      <div className="text-right text-sm" role="status" aria-live="polite">
        <p className="font-semibold" style={{ color: 'var(--chart-3)' }}>
          Promoted
        </p>
        {state.flags && state.flags.length > 0 ? (
          <p className="text-destructive">{state.flags[0]}</p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex items-center justify-end gap-2">
      <input type="hidden" name="guestEventId" value={guestEventId} />
      <input type="hidden" name="guestId" value={guestId} />
      <input type="hidden" name="guestName" value={guestName} />
      <input type="hidden" name="inviterKey" value={inviterKey} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="guestPax" value={guestPax} />
      {confirming ? (
        <>
          <Button type="submit" size="sm">
            Take the seat
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Promote
        </Button>
      )}
    </form>
  )
}
