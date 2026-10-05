import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listEnvelopes } from '@/server/repositories/envelopes-repository'
import { GiftsView } from './gifts-view'

export const metadata: Metadata = { title: 'Gifts' }

export default async function GiftsPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [envelopes, guests] = await Promise.all([
    listEnvelopes(supabase),
    supabase.from('guests').select('id, name, inviter_key').order('name'),
  ])
  if (guests.error) throw new Error(`Failed to list guests: ${guests.error.message}`)

  return (
    <main className="p-4 md:p-6">
      <GiftsView
        envelopes={envelopes}
        guests={(guests.data ?? []).map((g) => ({ id: g.id as string, name: g.name as string, inviterKey: g.inviter_key as string }))}
      />
    </main>
  )
}
