import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { GuestForm } from './guest-form'

export default async function NewGuestPage() {
  const supabase = await getServerSupabase()
  const inviters = await listInviters(supabase)

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <GuestForm inviters={inviters} />
    </main>
  )
}
