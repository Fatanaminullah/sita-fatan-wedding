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
 * A confirmed RSVP is part of that requirement, decided 2026-08-30. Only
 * `rsvp_status = 'attending'` is admitted. The couple resolve every
 * non-responder by hand before the day, so a guest still sitting at 'pending'
 * on 10 October is someone the sweep missed rather than someone waiting to
 * answer, and 'not_attending' is a decision that was actually taken.
 *
 * That makes the door strict in both directions, which is only safe because
 * nobody is expected to reach it unresolved. The dashboard's pending count is
 * what keeps that true; if it is not zero before the QR send, this rule turns
 * real guests away.
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
  /** Nobody ever recorded an answer for them. */
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
   * The most the door may admit for this guest.
   *
   * What they confirmed, and nothing above it. A party that answered "two" may
   * not arrive as three: seats were released to the waiting list on the
   * strength of those answers, and a door that quietly accepts more hands back
   * the capacity somebody else was refused. The station used to offer the
   * invited size plus one, so a guest invited for 3 who confirmed 2 was
   * offered 4.
   *
   * Falls back to the invited size when nobody ever answered, since that is
   * then the only number anyone agreed on, and never drops below one, so a
   * person standing at the door can always be let in.
   */
  maxPax: number
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
    suggestedPax: Math.max(1, guest.paxConfirmed ?? guest.pax),
    maxPax: Math.max(1, guest.paxConfirmed ?? guest.pax),
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
  // an invitation but no answer recorded. Both mean the same thing at a door.
  if (guest.rsvpStatus !== 'attending') {
    return { ...base, outcome: 'no_rsvp', canAdmit: false }
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
