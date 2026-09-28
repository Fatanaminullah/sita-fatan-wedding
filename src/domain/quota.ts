export type QuotaState = {
  cap: number
  confirmedPax: number
}

export type QuotaDecision = {
  allowed: true
  overCap: boolean
  remaining: number
  overBy: number
}

export function checkQuota(state: QuotaState, addingPax: number): QuotaDecision {
  const projected = state.confirmedPax + addingPax
  const remaining = state.cap - projected
  const overCap = remaining < 0
  return {
    allowed: true,
    overCap,
    remaining,
    overBy: overCap ? -remaining : 0,
  }
}

export type HeldInvite = {
  inviteStatus: 'confirmed' | 'waitlisted'
  rsvpStatus: 'pending' | 'attending' | 'not_attending'
  paxConfirmed: number | null
}

/**
 * Seats one guest holds against their inviter's cap at one event.
 *
 * The same rule as seatPax in summary.ts, which the capacity strip and the
 * dashboard use: the answered number once they said yes, the whole invitation
 * until then, nothing once they said no. The save warning used to count the
 * invitation for everyone, so an inviter whose guests had replied "one of two"
 * was called over cap while the strip beside it read 90 / 90.
 */
export function heldPax(invite: HeldInvite | null | undefined, invitedPax: number): number {
  if (!invite || invite.inviteStatus !== 'confirmed') return 0
  if (invite.rsvpStatus === 'not_attending') return 0
  if (invite.rsvpStatus === 'attending' && invite.paxConfirmed) return Math.min(invite.paxConfirmed, invitedPax)
  return invitedPax
}
