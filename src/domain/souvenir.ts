/**
 * Souvenir claim eligibility.
 *
 * One souvenir per guest entry: not per pax, not per event. A 2-pax guest gets
 * one. A guest invited to both events gets one, not two, at whichever event
 * they attend first (docs/PRD.md).
 *
 * The real guarantee is the UNIQUE constraint on `souvenir_claims.guest_id`,
 * not this file. Two helpers scanning the same guest at the same moment are
 * separated by the database, and the loser gets a unique violation. This
 * function exists so the screen can say "already collected" before anyone
 * reaches for the box, and so the violation is a race rather than the norm.
 */

export type ClaimedVia = 'akad_table' | 'resepsi_scan'
export type WeddingEvent = 'akad' | 'resepsi'

export type ExistingClaim = {
  claimedAt: string
  claimedVia: ClaimedVia
}

export type ClaimDecision =
  | { allowed: true; via: ClaimedVia }
  | { allowed: false; reason: 'already_claimed'; claimedAt: string; claimedVia: ClaimedVia }

/** Where a claim made at this event is recorded as having happened. */
export function claimChannel(event: WeddingEvent): ClaimedVia {
  return event === 'akad' ? 'akad_table' : 'resepsi_scan'
}

/**
 * Deliberately does not require the guest to be checked in.
 *
 * The Akad-skipper case: a guest invited to both who skips the Akad collects at
 * the Resepsi, and a guest who collected at the Akad gets nothing at the
 * Resepsi even though that is where they were scanned. Attendance at *this*
 * event is not the question; whether they already hold a souvenir is.
 */
export function canClaim(input: {
  event: WeddingEvent
  existingClaim: ExistingClaim | null
}): ClaimDecision {
  if (input.existingClaim) {
    return {
      allowed: false,
      reason: 'already_claimed',
      claimedAt: input.existingClaim.claimedAt,
      claimedVia: input.existingClaim.claimedVia,
    }
  }
  return { allowed: true, via: claimChannel(input.event) }
}
