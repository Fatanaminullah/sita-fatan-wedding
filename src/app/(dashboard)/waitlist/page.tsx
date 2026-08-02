import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listWaitlisted } from '@/server/repositories/guest-events-repository'
import { PromoteButton } from './promote-button'

const EVENTS = ['akad', 'resepsi'] as const

export default async function WaitlistPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await getServerSupabase()
  const pools = await Promise.all(EVENTS.map((event) => listWaitlisted(supabase, event)))

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Waitlist</h1>
        <a href="/waitlist" className="text-sm text-blue-600 underline">
          Refresh
        </a>
      </div>
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
                  <PromoteButton
                    guestEventId={entry.guestEventId}
                    inviterKey={entry.inviterKey}
                    event={event}
                    guestPax={entry.pax}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
