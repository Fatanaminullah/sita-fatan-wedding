'use client'

import { useActionState } from 'react'
import { createGuest } from '@/server/actions/guest-actions'

type Inviter = { key: string }

type FormState = { error?: string; guestId?: string; flags?: string[] }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createGuest(formData)
  if ('error' in result) return result
  if (result.flags.length === 0) {
    window.location.href = '/guests'
    return {}
  }
  return { guestId: result.guestId, flags: result.flags }
}

export function GuestForm({ inviters }: { inviters: Inviter[] }) {
  const [state, formAction, isPending] = useActionState(submitAction, {})
  // An inviter-role caller gets exactly one option (see NewGuestPage); there's
  // nothing to choose, so pre-select it instead of showing an empty placeholder.
  const onlyInviter = inviters.length === 1 ? inviters[0] : null

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
      <input name="pax" type="number" min={1} placeholder="Pax" required className="rounded border px-3 py-2" />
      <select name="side" required className="rounded border px-3 py-2">
        <option value="">Side</option>
        <option value="fatan">Fatan</option>
        <option value="sita">Sita</option>
      </select>
      <select
        name="inviterKey"
        required
        defaultValue={onlyInviter ? onlyInviter.key : ''}
        className="rounded border px-3 py-2"
      >
        {onlyInviter ? null : <option value="">Inviter</option>}
        {inviters.map((inviter) => (
          <option key={inviter.key} value={inviter.key}>
            {inviter.key}
          </option>
        ))}
      </select>
      <select name="type" required className="rounded border px-3 py-2">
        <option value="">Type</option>
        <option value="family">Family</option>
        <option value="friend">Friend</option>
      </select>
      <input name="phone" placeholder="Phone (optional)" className="rounded border px-3 py-2" />
      <label className="flex items-center gap-2">
        <input name="isVip" type="checkbox" /> VIP
      </label>
      <fieldset className="flex gap-4">
        <label className="flex items-center gap-2">
          <input name="events" type="checkbox" value="akad" /> Akad
        </label>
        <label className="flex items-center gap-2">
          <input name="events" type="checkbox" value="resepsi" /> Resepsi
        </label>
      </fieldset>
      {/* On the over-cap path the form stays mounted with its fields still
          filled in, so an un-disabled button is a duplicate-guest generator. */}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Saving...' : 'Save'}
      </button>
      {state.error ? <p className="text-red-600">{state.error}</p> : null}
      {state.flags && state.flags.length > 0 ? (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Saved, but over cap:</p>
          <ul className="list-disc pl-5">
            {state.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  )
}
