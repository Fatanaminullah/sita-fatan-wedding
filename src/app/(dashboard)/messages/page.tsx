import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadWaveCandidates, readSetting } from '@/server/repositories/wave-repository'
import { planWave } from '@/domain/wave'
import { WaveView } from './wave-view'

export const metadata: Metadata = { title: 'Messages' }

/**
 * The send console.
 *
 * Only the couple and their admins. An inviter has no business messaging the
 * whole guest list, and an usher's account exists for one day and one screen.
 */
export default async function MessagesPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin' && profile.role !== 'admin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [candidates, deadline] = await Promise.all([
    loadWaveCandidates(supabase, 'invite'),
    readSetting(supabase, 'rsvp_deadline'),
  ])

  const plan = planWave(candidates, new Date())

  return (
    <WaveView
      deadline={deadline}
      // Serialisable only: the view needs names and ids, never phone numbers.
      ready={plan.ready.map((c) => ({ guestId: c.guestId, name: c.name }))}
      waitingForTomorrow={plan.waitingForTomorrow.map((c) => ({
        guestId: c.guestId,
        name: c.name,
      }))}
      sharingANumber={plan.sharingANumber.map((c) => ({ guestId: c.guestId, name: c.name }))}
      excluded={plan.excluded}
      distinctRecipients={plan.distinctRecipients}
      sentCount={candidates.filter((c) => c.sentAt).length}
      provider={process.env.WA_PROVIDER ?? 'fake'}
    />
  )
}
