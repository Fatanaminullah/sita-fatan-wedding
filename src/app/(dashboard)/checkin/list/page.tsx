import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { rosterForEvent } from '@/server/repositories/checkin-repository'
import type { WeddingEvent } from '@/domain/souvenir'
import { DoorList } from './door-list'

export const metadata: Metadata = {
  title: 'Guest list',
  robots: { index: false, follow: false },
}

/**
 * The Akad's tick-list.
 *
 * The Akad is small enough that ticking is faster than scanning, and there are
 * no ushers there: the couple and family admins run it themselves
 * (docs/PRD.md). One list, two toggles per row, both jobs on one tablet.
 *
 * It is also the Resepsi's repair tool, which is why it takes an event and why
 * undo lives here rather than at the scan station.
 */
export default async function DoorListPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (!['usher', 'admin', 'superadmin'].includes(profile.role)) redirect('/dashboard')

  const requested = (await searchParams).event
  const event: WeddingEvent = requested === 'resepsi' ? 'resepsi' : 'akad'

  const supabase = await getServerSupabase()
  const guests = await rosterForEvent(supabase, event)

  return (
    <DoorList
      guests={guests}
      event={event}
      canUndo={profile.role === 'admin' || profile.role === 'superadmin'}
    />
  )
}
