import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listEnvelopes } from '@/server/repositories/envelopes-repository'
import { loadArrivals } from '@/server/repositories/checkin-repository'
import { GiftsView } from './gifts-view'

export const metadata: Metadata = { title: 'Gifts' }

export default async function GiftsPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [envelopes, guests, arrivals, inviters] = await Promise.all([
    listEnvelopes(supabase),
    supabase.from('guests').select('id, name, inviter_key').order('name'),
    loadArrivals(supabase),
    supabase.from('inviters').select('key').order('side').order('key'),
  ])
  if (inviters.error) throw new Error(`Failed to list inviters: ${inviters.error.message}`)
  if (guests.error) throw new Error(`Failed to list guests: ${guests.error.message}`)

  return (
    <main className="p-4 md:p-6">
      <GiftsView
        envelopes={envelopes}
        arrived={[...new Set(arrivals.rows.map((r) => r.guestId))]}
        inviterKeys={(inviters.data ?? []).map((i) => i.key as string)}
        withSouvenir={arrivals.claims.map((c) => c.guestId)}
        guests={(guests.data ?? []).map((g) => ({ id: g.id as string, name: g.name as string, inviterKey: g.inviter_key as string }))}
      />
    </main>
  )
}
