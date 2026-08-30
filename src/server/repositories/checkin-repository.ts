import type { SupabaseClient } from '@supabase/supabase-js'
import type { DoorGuest } from '@/domain/checkin'
import type { ClaimedVia, WeddingEvent } from '@/domain/souvenir'

/**
 * The door's data access.
 *
 * Reads go through two SECURITY DEFINER functions rather than the tables,
 * because ushers hold no policy on `guests` and must not get one: row-level
 * security cannot hide a column, and a policy wide enough to serve the door
 * would also hand over every guest's phone number. Writes go straight to
 * `checkin_events` and `souvenir_claims`, which ushers do have.
 */

/** A row as either door function returns it, before camel-casing. */
type RpcRow = {
  id: string
  name: string
  pax: number
  side: string
  inviter_key: string
  note?: string | null
  is_vip: boolean
  invite_status: 'confirmed' | 'waitlisted' | null
  rsvp_status: 'pending' | 'attending' | 'not_attending' | null
  pax_confirmed: number | null
  checked_in_at: string | null
  checked_in_by_name?: string | null
  souvenir_claimed_at: string | null
  souvenir_claimed_via?: ClaimedVia | null
}

function toDoorGuest(row: RpcRow): DoorGuest {
  return {
    id: row.id,
    name: row.name,
    pax: row.pax,
    isVip: row.is_vip,
    inviterKey: row.inviter_key,
    // Only the roster returns it; the ticket lookup does not, so a missing
    // field is normal rather than a mapping bug.
    note: row.note ?? null,
    inviteStatus: row.invite_status,
    rsvpStatus: row.rsvp_status,
    paxConfirmed: row.pax_confirmed,
    checkedInAt: row.checked_in_at,
    checkedInByName: row.checked_in_by_name ?? null,
    souvenirClaimedAt: row.souvenir_claimed_at,
    souvenirClaimedVia: row.souvenir_claimed_via ?? null,
  }
}

/**
 * Resolve one guest from the ticket encoded in their QR.
 *
 * Returns null for an unknown token. The function makes no distinction between
 * a token that never existed and one that did, so neither does this.
 */
export async function guestByToken(
  supabase: SupabaseClient,
  token: string,
  event: WeddingEvent
): Promise<DoorGuest | null> {
  const { data, error } = await supabase.rpc('guest_by_rsvp_token', {
    p_token: token,
    p_event: event,
  })
  if (error) throw new Error(`ticket lookup failed: ${error.message}`)
  const row = (data as RpcRow[])?.[0]
  return row ? toDoorGuest(row) : null
}

/**
 * The list of everyone invited to one event, for the moment a QR will not read.
 *
 * `query` is matched against the name. An empty query returns the whole event
 * roster, which is what the Akad table renders.
 */
export async function rosterForEvent(
  supabase: SupabaseClient,
  event: WeddingEvent,
  query: string | null = null
): Promise<DoorGuest[]> {
  const { data, error } = await supabase.rpc('guest_roster_for_event', {
    p_event: event,
    p_query: query,
  })
  if (error) throw new Error(`roster lookup failed: ${error.message}`)
  return (data as RpcRow[]).map(toDoorGuest)
}

/**
 * Record an arrival.
 *
 * Deliberately an insert and never an upsert. A second row for the same guest
 * and event is a real second scan at a real door, and keeping it is the whole
 * reason `checkin_events` carries no unique constraint. The screen is what
 * refuses to admit someone twice; the table remembers that it was tried.
 */
export async function recordCheckIn(
  supabase: SupabaseClient,
  input: { guestId: string; event: WeddingEvent; paxArrived: number; userId: string }
): Promise<void> {
  const { error } = await supabase.from('checkin_events').insert({
    guest_id: input.guestId,
    event: input.event,
    pax_arrived: input.paxArrived,
    checked_in_by: input.userId,
  })
  if (error) throw new Error(`check-in failed: ${error.message}`)
}

export type ClaimResult =
  | { ok: true }
  /** The UNIQUE constraint fired: someone else got there first. */
  | { ok: false; reason: 'already_claimed' }

/**
 * Record a souvenir handover.
 *
 * A unique violation here is the correct answer, not an error to paper over.
 * Two helpers scanning the same guest at the same moment are separated by the
 * database; the loser is told the souvenir is already gone. Never upsert this
 * (docs/DATA_MODEL.md).
 */
export async function recordSouvenirClaim(
  supabase: SupabaseClient,
  input: { guestId: string; via: ClaimedVia; userId: string }
): Promise<ClaimResult> {
  const { error } = await supabase.from('souvenir_claims').insert({
    guest_id: input.guestId,
    claimed_via: input.via,
    claimed_by: input.userId,
  })
  if (!error) return { ok: true }
  // 23505 unique_violation
  if (error.code === '23505') return { ok: false, reason: 'already_claimed' }
  throw new Error(`souvenir claim failed: ${error.message}`)
}

/**
 * Undo an arrival. Admin only, enforced by RLS: ushers hold insert and select
 * on `checkin_events` and nothing else, so a mis-tap at the door is corrected
 * by the couple or a family admin rather than by the person who made it.
 *
 * Removes every row for the pair, not just the first, so undoing also clears
 * any duplicate-scan rows and leaves the guest genuinely not-arrived.
 */
export async function removeCheckIn(
  supabase: SupabaseClient,
  input: { guestId: string; event: WeddingEvent }
): Promise<void> {
  const { error } = await supabase
    .from('checkin_events')
    .delete()
    .eq('guest_id', input.guestId)
    .eq('event', input.event)
  if (error) throw new Error(`undo check-in failed: ${error.message}`)
}

/** Undo a souvenir handover. Admin only, same reasoning as removeCheckIn. */
export async function removeSouvenirClaim(
  supabase: SupabaseClient,
  guestId: string
): Promise<void> {
  const { error } = await supabase.from('souvenir_claims').delete().eq('guest_id', guestId)
  if (error) throw new Error(`undo souvenir claim failed: ${error.message}`)
}
