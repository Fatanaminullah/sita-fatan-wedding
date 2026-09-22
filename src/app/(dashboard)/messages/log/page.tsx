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
export default async function MessageLogPage({
  searchParams,
}: {
  // Carried across the navigation from the send console, which sends the
  // operator straight here rather than leaving the result in a card they have
  // to scroll to and that dies on the next click.
  searchParams: Promise<{ sent?: string; failed?: string; skipped?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin' && profile.role !== 'admin') redirect('/dashboard')

  const [{ sent, failed, skipped }, rows] = await Promise.all([
    searchParams,
    loadSendLog(await getServerSupabase()),
  ])

  const count = (value: string | undefined) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  return (
    <SendLogView
      rows={rows}
      justRan={
        sent === undefined
          ? null
          : { sent: count(sent) ?? 0, failed: count(failed) ?? 0, skipped: count(skipped) ?? 0 }
      }
    />
  )
}
