/**
 * What a scan at the door means.
 *
 * Takes the row `guest_by_rsvp_token` returns and decides what the screen
 * shows and what the usher is allowed to do next. No IO, no framework: the
 * door's judgement is arithmetic over one row.
 *
 * The governing rule is the project's "warn, allow, flag" (docs/PRD.md).
 * Almost nothing here refuses. A guest standing in front of an usher with a
 * queue behind them is a person, and the screen's job is to tell the usher
 * what is unusual, not to bar the door on the strength of a spreadsheet.
 */

import type { ClaimedVia, WeddingEvent } from './souvenir'
import { canClaim } from './souvenir'

export type InviteStatus = 'confirmed' | 'waitlisted'
export type RsvpStatus = 'pending' | 'attending' | 'not_attending'

/** One guest as the door sees them. Mirrors the RPC's return, camel-cased. */
export type DoorGuest = {
  id: string
  name: string
  pax: number
  isVip: boolean
  inviterKey: string
  /** null when they hold no invitation to *this* event. */
  inviteStatus: InviteStatus | null
  rsvpStatus: RsvpStatus | null
  paxConfirmed: number | null
  checkedInAt: string | null
  checkedInByName: string | null
  souvenirClaimedAt: string | null
  souvenirClaimedVia: ClaimedVia | null
}

export type ScanOutcome =
  /** Nothing is unusual. Let them in. */
  | 'admit'
  /** Someone already checked this guest in at this event. */
  | 'already_in'
  /** They hold no invitation to this event. */
  | 'not_invited'
  /** Invited but never promoted off the waiting list. */
  | 'waitlisted'
  /** They told us they were not coming, and here they are. */
  | 'declined'

export type ScanDecision = {
  outcome: ScanOutcome
  /**
   * Whether the primary button is offered at all.
   *
   * Only `already_in` withholds it, because admitting twice is the one action
   * with no sensible meaning. Every other unusual state is still admissible by
   * an usher who can see the person in front of them.
   */
  canAdmit: boolean
  /** Pre-filled headcount. What they confirmed, else what they were invited for. */
  suggestedPax: number
  /** True when this guest has no souvenir yet, whatever happens with entry. */
  souvenirDue: boolean
  vip: boolean
}

/**
 * Precedence matters and is not arbitrary.
 *
 * `not_invited` outranks everything: it is the only state where the usher may
 * be looking at the wrong door entirely, and it must not be buried under a
 * softer warning. `already_in` comes next because it is the one outcome that
 * removes the primary action. `waitlisted` and `declined` are both "let them
 * in, but know this", and waitlisted is the more surprising of the two.
 */
export function resolveScan(input: {
  guest: DoorGuest
  event: WeddingEvent
}): ScanDecision {
  const { guest } = input

  const base = {
    suggestedPax: guest.paxConfirmed ?? guest.pax,
    souvenirDue: guest.souvenirClaimedAt === null,
    vip: guest.isVip,
  }

  if (guest.inviteStatus === null) {
    return { ...base, outcome: 'not_invited', canAdmit: true }
  }
  if (guest.checkedInAt !== null) {
    return { ...base, outcome: 'already_in', canAdmit: false }
  }
  if (guest.inviteStatus === 'waitlisted') {
    return { ...base, outcome: 'waitlisted', canAdmit: true }
  }
  if (guest.rsvpStatus === 'not_attending') {
    return { ...base, outcome: 'declined', canAdmit: true }
  }
  return { ...base, outcome: 'admit', canAdmit: true }
}

export type SouvenirOutcome = 'give' | 'already_claimed' | 'not_invited'

export type SouvenirDecision = {
  outcome: SouvenirOutcome
  canGive: boolean
  via: ClaimedVia | null
  claimedAt: string | null
  claimedVia: ClaimedVia | null
  vip: boolean
}

/**
 * The souvenir station's own read of the same guest.
 *
 * Kept separate from `resolveScan` because the two stations answer different
 * questions about the same person, and a station that borrowed the other's
 * outcomes would eventually show an entry warning at a souvenir table.
 */
export function resolveSouvenirScan(input: {
  guest: DoorGuest
  event: WeddingEvent
}): SouvenirDecision {
  const { guest, event } = input
  const claim = guest.souvenirClaimedAt
    ? { claimedAt: guest.souvenirClaimedAt, claimedVia: guest.souvenirClaimedVia! }
    : null

  const decision = canClaim({ event, existingClaim: claim })

  if (!decision.allowed) {
    return {
      outcome: 'already_claimed',
      canGive: false,
      via: null,
      claimedAt: decision.claimedAt,
      claimedVia: decision.claimedVia,
      vip: guest.isVip,
    }
  }

  // No invitation to either event is worth a word before handing over a box,
  // but it does not block: the souvenir count is per guest entry and this is
  // still a guest entry.
  const outcome: SouvenirOutcome = guest.inviteStatus === null ? 'not_invited' : 'give'

  return {
    outcome,
    canGive: true,
    via: decision.via,
    claimedAt: null,
    claimedVia: null,
    vip: guest.isVip,
  }
}
