import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/server/supabase/server-client'
import { getGuest } from '@/server/repositories/guests-repository'
import { updateGuestPhone } from '@/server/actions/guest-actions'

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabase()
  const guest = await getGuest(supabase, id)

  async function action(formData: FormData) {
    'use server'
    formData.set('guestId', id)
    const result = await updateGuestPhone(formData)
    if (result && 'ok' in result) {
      redirect('/guests')
    }
    // 'error' case falls through here. Not rendered: this inline action isn't
    // wired to useActionState, so a returned value has no consumer — same
    // type constraint task 11 hit on the login action.
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Edit {guest.name}</h1>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="phone"
          defaultValue={guest.phone ?? ''}
          placeholder="Phone"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save phone
        </button>
      </form>
    </main>
  )
}
