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
 * A confirmed RSVP was part of that requirement from 2026-08-30 until
 * 2026-10-08, when the owner reversed it two days out: with 18 invitations
 * still unanswered, a strict door would turn real guests away. A guest who
 * never answered is now admitted and flagged (`no_rsvp`, with `canAdmit`).
 * 'not_attending' is still refused: that is a decision the guest took.
 *
 * The headcount is no longer capped either (same day). A party that confirmed
 * 2 and arrives as 4 is let in as 4; `extraPax` is how many came beyond what
 * was expected, and the door list shows it.
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
  /** Whose family invited them, which is also which door desk they go to. */
  side: 'fatan' | 'sita'
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
  /** How many the admission that counts let in, or null before arrival. */
  checkedInPax: number | null
  /** The VIP table they are seated at, from the seating plan, or null. */
  vipTableName: string | null
}

/**
 * A typo guard, not a ceiling. Nobody brings twenty people to a wedding
 * table; a 40 typed by a thumb in a queue is a mistake.
 */
export const DOOR_PAX_LIMIT = 20

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
  /** Nobody ever recorded an answer for them. Admitted, and flagged. */
  | 'no_rsvp'

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
  /**
   * What they said they would bring: confirmed, else invited, never below one.
   * Not a ceiling. Anything above it is counted by `extraPax`.
   */
  expectedPax: number
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
 * `waitlisted` then refuses for its own reason. `declined` outranks `no_rsvp`
 * because "they told us no" is a more useful thing to say to an usher than
 * "we never heard".
 */
export function resolveScan(input: {
  guest: DoorGuest
  event: WeddingEvent
}): ScanDecision {
  const { guest } = input

  const base = {
    suggestedPax: expected(guest),
    expectedPax: expected(guest),
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
    return { ...base, outcome: 'declined', canAdmit: false }
  }
  // Anything that is not an explicit yes: 'pending', or null on a guest with
  // an invitation but no answer recorded. Both mean the same thing at a door,
  // and both are let in now, flagged so the screen says so.
  if (guest.rsvpStatus !== 'attending') {
    return { ...base, outcome: 'no_rsvp', canAdmit: true }
  }
  return { ...base, outcome: 'admit', canAdmit: true }
}

function expected(guest: DoorGuest): number {
  return Math.max(1, guest.paxConfirmed ?? guest.pax)
}

/** How many walked in beyond what this guest said they would bring. */
export function extraPax(guest: DoorGuest, paxArrived: number): number {
  return Math.max(0, paxArrived - expected(guest))
}

/**
 * The VIP line the door shows, or null for everyone else.
 *
 * Tables are usually named "VIP Table 5", and "VIP · VIP Table 5" says the
 * same word twice, so a name that already carries it stands alone.
 */
export function vipLabel(guest: DoorGuest): string | null {
  if (!guest.isVip) return null
  const table = guest.vipTableName?.trim()
  if (!table) return 'VIP'
  return /\bvip\b/i.test(table) ? table : `VIP · ${table}`
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
