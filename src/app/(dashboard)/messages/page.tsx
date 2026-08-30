import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadWaveCandidates, readSetting } from '@/server/repositories/wave-repository'
import { listTemplates } from '@/server/whatsapp/templates'
import { planWave, type WaveKind } from '@/domain/wave'
import { MessagesView, type StepSummary } from './messages-view'

export const metadata: Metadata = { title: 'Messages' }

const STEPS: Array<{ kind: WaveKind; title: string; description: string }> = [
  {
    kind: 'invite',
    title: 'Invite them',
    description: 'The invitation, with a link to their own page.',
  },
  {
    kind: 'reminder',
    title: 'Chase the quiet ones',
    description: 'A follow-up to whoever has not answered, with buttons to answer in the chat.',
  },
  {
    kind: 'qr_checkin',
    title: 'Send their ticket',
    description: 'The QR that gets them through the door, to everyone who said yes.',
  },
]

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

  const [candidates, deadline, templates, ...templateNames] = await Promise.all([
    loadWaveCandidates(supabase, 'invite'),
    readSetting(supabase, 'rsvp_deadline'),
    listTemplates(),
    readSetting(supabase, 'template_invite'),
    readSetting(supabase, 'template_reminder'),
    readSetting(supabase, 'template_qr_checkin'),
  ])

  const chosenTemplate: Record<WaveKind, string | null> = {
    invite: templateNames[0],
    reminder: templateNames[1],
    qr_checkin: templateNames[2],
  }

  // Every step is planned against the same snapshot, so no two figures on the
  // screen can disagree with each other.
  const steps: StepSummary[] = STEPS.map(({ kind, title, description }) => {
    const forKind =
      kind === 'invite'
        ? candidates
        : candidates.map((c) => ({ ...c, sentAt: null, lastErrorCode: null, lastAttemptAt: null }))

    const all = planWave(forKind, new Date())
    const one = planWave(forKind, new Date(), 1)
    const two = planWave(forKind, new Date(), 2)

    return {
      kind,
      title,
      description,
      templateName: chosenTemplate[kind],
      // Only the invitation has real send history so far; the other two steps
      // are shown so the shape of the whole run is visible, not because they
      // are ready. Building them is phases 8 and 9.
      ready: kind === 'invite' ? all.ready.length : 0,
      readyBatchOne: kind === 'invite' ? one.ready.length : 0,
      readyBatchTwo: kind === 'invite' ? two.ready.length : 0,
      sent: kind === 'invite' ? candidates.filter((c) => c.sentAt).length : 0,
      available: kind === 'invite',
    }
  })

  const invitePlan = planWave(candidates, new Date())

  return (
    <MessagesView
      steps={steps}
      deadline={deadline}
      templates={templates.ok ? templates.templates : []}
      templatesError={templates.ok ? null : templates.error}
      provider={process.env.WA_PROVIDER ?? 'fake'}
      // Names and batches only. A phone number has no business on this screen.
      guests={candidates.map((c) => ({
        guestId: c.guestId,
        name: c.name,
        batch: c.batch ?? null,
        reachable: Boolean(c.phone) && c.hasConfirmedInvite,
        sent: Boolean(c.sentAt),
      }))}
      distinctRecipients={invitePlan.distinctRecipients}
      sharingANumber={invitePlan.sharingANumber.length}
      noPhone={invitePlan.excluded.filter((e) => e.reason === 'no_phone').length}
      waitlisted={invitePlan.excluded.filter((e) => e.reason === 'waitlisted').length}
    />
  )
}
