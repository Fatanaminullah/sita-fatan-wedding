import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadWaveCandidates, readSetting, sentCountsByKind } from '@/server/repositories/wave-repository'
import { listTemplates } from '@/server/whatsapp/templates'
import { planWave, ticketReadiness, type WaveKind } from '@/domain/wave'
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

  const [candidates, sentCounts, deadline, templates, ...templateNames] = await Promise.all([
    loadWaveCandidates(supabase, 'invite'),
    sentCountsByKind(supabase),
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

  const readiness = ticketReadiness(
    candidates.map((c) => ({ answered: c.answered, attending: c.attending }))
  )

  // Every step is planned against the same snapshot, so no two figures on the
  // screen can disagree with each other.
  const steps: StepSummary[] = STEPS.map(({ kind, title, description }) => {
    // planWave understands invitations, not answers, so each wave applies its
    // own filter on top:
    //   the reminder chases only the quiet, so anybody who has answered is out
    //   the ticket goes only to somebody actually coming
    const forKind =
      kind === 'qr_checkin'
        ? candidates.filter((c) => c.answered && c.attending)
        : kind === 'reminder'
          ? candidates.filter((c) => !c.answered)
          : candidates

    const all = planWave(forKind, new Date())
    const one = planWave(forKind, new Date(), 1)
    const two = planWave(forKind, new Date(), 2)

    const blocked = kind === 'qr_checkin' && !readiness.ready

    return {
      kind,
      title,
      description,
      templateName: chosenTemplate[kind],
      ready: blocked ? 0 : all.ready.length,
      readyBatchOne: blocked ? 0 : one.ready.length,
      readyBatchTwo: blocked ? 0 : two.ready.length,
      sent: sentCounts[kind],
      available: true,
      blockedReason:
        kind === 'qr_checkin' && !readiness.ready
          ? readiness.reason === 'unanswered'
            ? `${readiness.unanswered} guests have not answered. Every one of them would get no ticket and be refused at the door, so this stays shut until the last answer is in.`
            : 'Nobody has said they are coming yet.'
          : null,
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
