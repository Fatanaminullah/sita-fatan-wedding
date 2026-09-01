import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import {
  loadWaveCandidates,
  readSetting,
  recipientsReachedToday,
  sentCountsByKind,
} from '@/server/repositories/wave-repository'
import { listTemplates } from '@/server/whatsapp/templates'
import { DAILY_RECIPIENT_CAP, planWave, ticketReadiness, type WaveKind } from '@/domain/wave'
import { MessagesView, type StepSummary, type StepGuest } from './messages-view'

export const metadata: Metadata = { title: 'Messages' }

const STEPS: Array<{
  kind: WaveKind
  title: string
  description: string
  /**
   * Whether "who hears first" is a meaningful question for this step.
   *
   * Only the invitation. A batch answers a question settled weeks before anyone
   * replies; the reminder's audience is "who is still quiet", known only on the
   * day it runs, and the ticket's is "who said yes". Splitting either of those
   * by a cohort chosen in August splits a group that has no reason to be split.
   * Both are limited by the daily cap instead, which is the real constraint.
   */
  usesBatches: boolean
}> = [
  {
    kind: 'invite',
    title: 'Invite them',
    description: 'The invitation, with a link to their own page.',
    usesBatches: true,
  },
  {
    kind: 'reminder',
    title: 'Chase the quiet ones',
    description: 'A follow-up to whoever has not answered, with buttons to answer in the chat.',
    usesBatches: false,
  },
  {
    kind: 'qr_checkin',
    title: 'Send their ticket',
    description: 'The QR that gets them through the door, to everyone who said yes.',
    usesBatches: false,
  },
]

const EXCLUSION_LABEL: Record<string, string> = {
  no_phone: 'No phone number',
  waitlisted: 'On the waiting list',
  already_sent: 'Already sent',
  other_batch: 'In the other batch',
  no_batch: 'In no batch',
}

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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  /*
   * One load per step, not one load reused three times.
   *
   * `loadWaveCandidates` resolves `sentAt` from the wa_sends row matching the
   * kind it is given. Loading once as 'invite' and reusing it meant steps 2 and
   * 3 read the INVITATION's send row: every guest who successfully received an
   * invitation would have been excluded from the reminder and from their ticket
   * as "already sent", and the reminder would have reached nobody who was
   * actually invited. It has been invisible only because every invitation sent
   * so far failed, which leaves sentAt null for all of them.
   */
  const [
    inviteCandidates,
    reminderCandidates,
    ticketCandidates,
    sentCounts,
    reachedToday,
    deadline,
    templates,
    ...templateNames
  ] = await Promise.all([
      loadWaveCandidates(supabase, 'invite'),
      loadWaveCandidates(supabase, 'reminder'),
      loadWaveCandidates(supabase, 'qr_checkin'),
      sentCountsByKind(supabase),
      recipientsReachedToday(supabase, `${today}T00:00:00+07:00`),
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

  const capRemaining = Math.max(0, DAILY_RECIPIENT_CAP - reachedToday)

  // The whole list, for the figures that describe the guest list rather than
  // one step: who can be reached at all, and who is still silent.
  const candidates = inviteCandidates

  const readiness = ticketReadiness(
    candidates.map((c) => ({ answered: c.answered, attending: c.attending }))
  )

  // Named, not merely counted. These are the people who will be refused at the
  // door if nobody chases them, and a number alone cannot be chased.
  const unanswered: StepGuest[] = candidates
    .filter((c) => !c.answered)
    .map((c) => ({ guestId: c.guestId, name: c.name, batch: c.batch ?? null }))

  // Every step is planned against the same snapshot, so no two figures on the
  // screen can disagree with each other.
  const steps: StepSummary[] = STEPS.map(({ kind, title, description, usesBatches }) => {
    // planWave understands invitations, not answers, so each wave applies its
    // own filter on top:
    //   the reminder chases only the quiet, so anybody who has answered is out
    //   the ticket goes only to somebody actually coming
    const forKind =
      kind === 'qr_checkin'
        ? ticketCandidates.filter((c) => c.answered && c.attending)
        : kind === 'reminder'
          ? reminderCandidates.filter((c) => !c.answered)
          : inviteCandidates

    const plan = planWave(forKind, new Date())

    return {
      kind,
      title,
      description,
      usesBatches,
      templateName: chosenTemplate[kind],
      sent: sentCounts[kind],
      eligible: plan.ready.map((c) => ({
        guestId: c.guestId,
        name: c.name,
        batch: c.batch ?? null,
      })),
      excluded: plan.excluded.map((e) => ({
        guestId: e.guestId,
        name: e.name,
        reason: EXCLUSION_LABEL[e.reason] ?? e.reason,
      })),
      waitingForTomorrow: plan.waitingForTomorrow.length,
      sharingANumber: plan.sharingANumber.length,
      // The ticket step no longer refuses to run while somebody is silent. It
      // shows them by name instead: they are already outside its audience, and
      // withholding every ticket over them helped nobody.
      unanswered: kind === 'qr_checkin' ? unanswered : [],
      blockedReason:
        kind === 'qr_checkin' && !readiness.canSend
          ? 'Nobody has said they are coming yet, so there are no tickets to send.'
          : null,
    }
  })

  return (
    <MessagesView
      steps={steps}
      deadline={deadline}
      templates={templates.ok ? templates.templates : []}
      templatesError={templates.ok ? null : templates.error}
      provider={process.env.WA_PROVIDER ?? 'fake'}
      capRemaining={capRemaining}
      reachedToday={reachedToday}
      distinctRecipients={planWave(candidates, new Date()).distinctRecipients}
      sharingANumber={planWave(candidates, new Date()).sharingANumber.length}
      noPhone={candidates.filter((c) => !c.phone).length}
      waitlisted={candidates.filter((c) => !c.hasConfirmedInvite).length}
    />
  )
}
