'use client'

import { useActionState } from 'react'
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

  if (state.promoted) {
    return (
      <div className="text-right text-sm">
        <p className="font-semibold text-emerald-600">Promoted</p>
        {state.flags && state.flags.length > 0 ? (
          <p className="text-destructive">{state.flags[0]}</p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="guestEventId" value={guestEventId} />
      <input type="hidden" name="guestId" value={guestId} />
      <input type="hidden" name="guestName" value={guestName} />
      <input type="hidden" name="inviterKey" value={inviterKey} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="guestPax" value={guestPax} />
      <Button type="submit" size="sm">
        Promote
      </Button>
    </form>
  )
}
