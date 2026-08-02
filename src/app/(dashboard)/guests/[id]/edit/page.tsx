import { getServerSupabase } from '@/server/supabase/server-client'
import { getGuest } from '@/server/repositories/guests-repository'
import { EditGuestForm } from './edit-guest-form'

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabase()
  const guest = await getGuest(supabase, id)

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Edit {guest.name}</h1>
      <EditGuestForm guestId={id} phone={guest.phone} />
    </main>
  )
}
