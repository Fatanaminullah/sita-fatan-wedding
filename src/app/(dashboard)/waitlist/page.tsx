import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listWaitlisted } from '@/server/repositories/guest-events-repository'
import { promoteGuest } from '@/server/actions/waitlist-actions'

const EVENTS = ['akad', 'resepsi'] as const

export default async function WaitlistPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await getServerSupabase()
  const pools = await Promise.all(EVENTS.map((event) => listWaitlisted(supabase, event)))

  async function action(formData: FormData) {
    'use server'
    await promoteGuest(formData)
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Waitlist</h1>
      {EVENTS.map((event, i) => (
        <section key={event} className="mb-8">
          <h2 className="mb-2 font-semibold capitalize">{event}</h2>
          {pools[i].length === 0 ? (
            <p className="text-sm text-gray-500">Nobody waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pools[i].map((entry) => (
                <li key={entry.guestEventId} className="flex items-center justify-between border-b py-2 text-sm">
                  <span>
                    {entry.inviterKey}, {entry.side}, {entry.pax} pax
                  </span>
                  <form action={action}>
                    <input type="hidden" name="guestEventId" value={entry.guestEventId} />
                    <input type="hidden" name="inviterKey" value={entry.inviterKey} />
                    <input type="hidden" name="event" value={event} />
                    <input type="hidden" name="guestPax" value={entry.pax} />
                    <button type="submit" className="rounded bg-black px-3 py-1 text-white">
                      Promote
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
