/**
 * What a scan at the door means.
 *
 * Takes the row `guest_by_rsvp_token` returns and decides what the screen
 * shows and what the usher is allowed to do next. No IO, no framework: the
 * door's judgement is arithmetic over one row.
 *
 * "Warn, allow, flag" (docs/PRD.md) governs *quota*, where a wrong guess costs
 * a number being off by two. It does not govern the door, where a wrong guess
 * costs someone walking into a wedding they were not invited to. So an
 * invitation to this event is a hard requirement, decided by the owner on
 * 2026-08-30, and no role can override it at the door: a wrong row is fixed by
 * editing the guest in the admin app and scanning again.
 *
 * What is still only a warning is the guest who declined and came anyway. They
 * were invited, they hold a real ticket, and they changed their mind. That is
 * a note for the usher, not a refusal.
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
  /**
   * The guest's group, as the couple write it: "Keluarga A", "Teman kantor".
   * This is how one Wati is told from another at a door, so it is shown and
   * searched rather than treated as an internal field.
   */
  note: string | null
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
   * Three states withhold it, for two different reasons. `not_invited` and
   * `waitlisted` are refusals: this person has no invitation to this event,
   * and a waiting-list place is not an invitation (they were never promoted,
   * so they were never sent a ticket). `already_in` is not a refusal of the
   * person, only of the second admission.
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
 * `not_invited` outranks everything: it is the refusal that means "this person
 * does not belong at this door", and it must not be buried under a softer
 * message. `already_in` comes next, because telling an usher that a guest is
 * already inside is more use than telling them the guest once declined.
 * `waitlisted` then refuses for its own reason, and `declined` is last because
 * it is the only one of the four that still admits.
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
    return { ...base, outcome: 'not_invited', canAdmit: false }
  }
  if (guest.checkedInAt !== null) {
    return { ...base, outcome: 'already_in', canAdmit: false }
  }
  if (guest.inviteStatus === 'waitlisted') {
    return { ...base, outcome: 'waitlisted', canAdmit: false }
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

  // Refused for the same reason the door refuses. Souvenirs are counted one
  // per invited guest entry, and someone with no invitation to this event has
  // no entry to count. They should not have got past the door either.
  if (guest.inviteStatus === null) {
    return {
      outcome: 'not_invited',
      canGive: false,
      via: null,
      claimedAt: null,
      claimedVia: null,
      vip: guest.isVip,
    }
  }

  return {
    outcome: 'give',
    canGive: true,
    via: decision.via,
    claimedAt: null,
    claimedVia: null,
    vip: guest.isVip,
  }
}
