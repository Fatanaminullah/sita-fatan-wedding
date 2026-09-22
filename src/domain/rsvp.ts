/**
 * What an RSVP answer is allowed to say.
 *
 * One answer per guest per event, because a guest can attend the Akad and
 * decline the Resepsi (docs/PRD.md). Nothing here decides *who may write* an
 * answer: that is RLS and the `guard_guest_events_rsvp_columns` trigger, which
 * lock these columns to admin, superadmin and the service role. This decides
 * only what a given answer means and whether the numbers in it hold together.
 *
 * The governing rule is **pax down only**. A guest invited for four may come as
 * two, one, or none of them. They may never come as five: the invitation is
 * the ceiling, capacity was planned against it, and a guest who wants to bring
 * an extra person is a conversation with the couple rather than a number they
 * can raise themselves.
 *
 * The door is the other half of this. Only `attending` is admitted, so an
 * answer recorded here is what decides whether someone gets through on the
 * day (src/domain/checkin.ts).
 */

export type WeddingEvent = 'akad' | 'resepsi'
export type RsvpAnswer = 'attending' | 'not_attending'
export type RsvpStatus = 'pending' | RsvpAnswer
export type RespondedVia = 'guest_form' | 'admin_manual'

/** What is on file for one guest and one event before the answer lands. */
export type EventInvitation = {
  event: WeddingEvent
  /** null when they hold no invitation to this event at all. */
  inviteStatus: 'confirmed' | 'waitlisted' | null
  /** The ceiling. How many people the invitation was for. */
  invitedPax: number
}

export type RsvpDecision =
  | {
      allowed: true
      event: WeddingEvent
      status: RsvpAnswer
      /** null when declining: nobody is coming, so no number is recorded. */
      paxConfirmed: number | null
      /** Set when the answer is worth a human's attention anyway. */
      flags: string[]
    }
  | { allowed: false; reason: RsvpRefusal; message: string }

export type RsvpRefusal = 'not_invited' | 'pax_too_high' | 'pax_not_positive' | 'pax_missing'

/**
 * Decide one answer, for one event.
 *
 * `paxConfirmed` is ignored when declining. A declining guest who also typed a
 * number is answering two questions at once and only one of them counts.
 */
export function decideRsvp(input: {
  invitation: EventInvitation
  answer: RsvpAnswer
  paxConfirmed: number | null
}): RsvpDecision {
  const { invitation, answer } = input

  if (invitation.inviteStatus === null) {
    return {
      allowed: false,
      reason: 'not_invited',
      message: `They hold no invitation to the ${eventName(invitation.event)}, so there is nothing to answer.`,
    }
  }

  if (answer === 'not_attending') {
    return {
      allowed: true,
      event: invitation.event,
      status: 'not_attending',
      paxConfirmed: null,
      // A declining waitlisted guest is worth noticing: their place was never
      // theirs to give up, and the cascade has one fewer person to promote.
      flags: invitation.inviteStatus === 'waitlisted' ? ['declined_while_waitlisted'] : [],
    }
  }

  const pax = input.paxConfirmed

  if (pax === null) {
    return {
      allowed: false,
      reason: 'pax_missing',
      message: 'How many of them are coming?',
    }
  }
  if (!Number.isInteger(pax) || pax < 1) {
    return {
      allowed: false,
      reason: 'pax_not_positive',
      message: 'At least one person has to be coming. To record nobody, answer not attending.',
    }
  }
  if (pax > invitation.invitedPax) {
    return {
      allowed: false,
      reason: 'pax_too_high',
      // Named as a ceiling rather than an error, because the answer is not
      // wrong so much as bigger than what was offered.
      message: `They were invited for ${invitation.invitedPax}. To bring more, raise the invitation first.`,
    }
  }

  const flags: string[] = []
  // Accepting a place that was never confirmed. Allowed, because the couple
  // may be promoting them in the same breath, but it should not pass silently.
  if (invitation.inviteStatus === 'waitlisted') flags.push('attending_while_waitlisted')
  if (pax < invitation.invitedPax) flags.push('coming_with_fewer')

  return {
    allowed: true,
    event: invitation.event,
    status: 'attending',
    paxConfirmed: pax,
    flags,
  }
}

/**
 * How many places an answer gives back.
 *
 * Feeds the waiting-list cascade: a guest invited for four who confirms two
 * frees two, and one who declines outright frees all four. Counted against the
 * invitation rather than against any earlier answer, so re-answering never
 * double-counts.
 */
export function paxFreed(invitation: EventInvitation, decision: RsvpDecision): number {
  if (!decision.allowed) return 0
  if (decision.status === 'not_attending') return invitation.invitedPax
  return Math.max(0, invitation.invitedPax - (decision.paxConfirmed ?? 0))
}

/**
 * Whether every event this guest holds an invitation to has been answered.
 *
 * This is what the sweep counts down. A guest invited to both who has answered
 * only the Akad is still unanswered, because the Resepsi door will refuse them.
 */
export function isFullyAnswered(
  invitations: EventInvitation[],
  answers: { event: WeddingEvent; status: RsvpStatus }[]
): boolean {
  const invited = invitations.filter((i) => i.inviteStatus !== null)
  if (invited.length === 0) return false
  return invited.every((i) => {
    const answer = answers.find((a) => a.event === i.event)
    return answer !== undefined && answer.status !== 'pending'
  })
}

function eventName(event: WeddingEvent): string {
  return event === 'akad' ? 'Akad' : 'Resepsi'
}
