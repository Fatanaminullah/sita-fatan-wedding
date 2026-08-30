import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadBatchRows } from '@/server/repositories/wave-repository'
import { BatchesView } from './batches-view'

export const metadata: Metadata = { title: 'Batches' }

/**
 * Arranging who hears first.
 *
 * Its own page rather than a panel on the send screen: with 334 guests this is
 * a job of its own, done once, well before anything sends. Messages links here
 * and shows the counts, so the send screen stays about sending.
 */
export default async function BatchesPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin' && profile.role !== 'admin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const guests = await loadBatchRows(supabase)

  return <BatchesView guests={guests} />
}
