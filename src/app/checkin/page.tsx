import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { Station } from './station'

export const metadata: Metadata = {
  title: 'Door',
  robots: { index: false, follow: false },
}

/**
 * The scan station, deliberately outside the (dashboard) group.
 *
 * It has no sidebar, no header and no way back to the rest of the app. The
 * tablet stands at a door facing a guest for several hours, and every piece of
 * navigation on it is something an usher can fall into by accident and a guest
 * can read over the top of.
 */
export default async function CheckinPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  // Inviters and viewers have no business at a door. RLS and the two door
  // functions already refuse them; this turns that refusal into a redirect
  // rather than a screen of errors.
  if (!['usher', 'admin', 'superadmin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return <Station canUndo={profile.role === 'admin' || profile.role === 'superadmin'} />
}
