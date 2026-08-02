'use client'

import { useActionState } from 'react'
import { promoteGuest } from '@/server/actions/waitlist-actions'

type FormState = { promoted?: boolean; flags?: string[] }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await promoteGuest(formData)
  return { promoted: true, flags: result.flags }
}

export function PromoteButton({
  guestEventId,
  inviterKey,
  event,
  guestPax,
}: {
  guestEventId: string
  inviterKey: string
  event: 'akad' | 'resepsi'
  guestPax: number
}) {
  const [state, formAction] = useActionState(submitAction, {})

  if (state.promoted) {
    return (
      <div className="text-right text-sm">
        <p className="font-semibold text-green-700">Promoted</p>
        {state.flags && state.flags.length > 0 ? (
          <p className="text-red-700">{state.flags[0]}</p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="guestEventId" value={guestEventId} />
      <input type="hidden" name="inviterKey" value={inviterKey} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="guestPax" value={guestPax} />
      <button type="submit" className="rounded bg-black px-3 py-1 text-white">
        Promote
      </button>
    </form>
  )
}
