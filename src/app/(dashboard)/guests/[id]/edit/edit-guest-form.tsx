'use client'

import { useActionState } from 'react'
import { updateGuestPhone } from '@/server/actions/guest-actions'

type FormState = { error?: string }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await updateGuestPhone(formData)
  if (result && 'error' in result) return result
  window.location.href = '/guests'
  return {}
}

export function EditGuestForm({ guestId, phone }: { guestId: string; phone: string | null }) {
  const [state, formAction, isPending] = useActionState(submitAction, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="guestId" value={guestId} />
      <input
        name="phone"
        defaultValue={phone ?? ''}
        placeholder="Phone"
        required
        className="rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Saving...' : 'Save phone'}
      </button>
      {/* This is the screen used to backfill ~293 missing phone numbers. A
          silent failure mid-backfill is the worst failure mode it has. */}
      {state.error ? <p className="text-red-600">{state.error}</p> : null}
    </form>
  )
}
