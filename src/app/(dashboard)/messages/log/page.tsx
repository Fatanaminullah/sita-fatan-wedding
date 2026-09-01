import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadSendLog } from '@/server/repositories/wave-repository'
import { SendLogView } from './send-log-view'

export const metadata: Metadata = { title: 'Message log' }

/**
 * What actually happened to every message.
 *
 * Its own page rather than a panel on the send console: the console is about
 * the run you are about to make, and this is about the runs already made. The
 * console's outcome card lives in component state and dies on the next
 * navigation, so before this page existed there was no way to read back what
 * happened to 250 real people.
 */
export default async function MessageLogPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin' && profile.role !== 'admin') redirect('/dashboard')

  const rows = await loadSendLog(await getServerSupabase())
  return <SendLogView rows={rows} />
}
