import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { createGuest } from '@/server/actions/guest-actions'

export default async function NewGuestPage() {
  const supabase = await getServerSupabase()
  const inviters = await listInviters(supabase)

  async function action(formData: FormData) {
    'use server'
    const result = await createGuest(formData)
    if ('guestId' in result) {
      redirect('/guests')
    }
    // 'error' case falls through here. Not rendered: this inline action isn't
    // wired to useActionState, so a returned value has no consumer — same
    // type constraint task 11 hit on the login action.
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
        <input name="pax" type="number" min={1} placeholder="Pax" required className="rounded border px-3 py-2" />
        <select name="side" required className="rounded border px-3 py-2">
          <option value="">Side</option>
          <option value="fatan">Fatan</option>
          <option value="sita">Sita</option>
        </select>
        <select name="inviterKey" required className="rounded border px-3 py-2">
          <option value="">Inviter</option>
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
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </main>
  )
}
