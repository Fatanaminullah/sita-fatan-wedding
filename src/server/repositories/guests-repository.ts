import type { SupabaseClient } from '@supabase/supabase-js'

export type NewGuest = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  phone: string | null
  isVip: boolean
  isPhysicalInvitation: boolean
  note: string | null
}

// RLS scopes these results by role automatically — do not add a manual
// inviter_key filter here. That's the point: app-code bugs can't leak rows.
export async function listGuests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('guests')
    // wa_sends rides along so the list can answer "did this reach them" without
    // a second round trip. It is RLS-scoped to the same guests this query
    // already returns (wa_sends_inviter_read, wa_sends_admin_side), so no row
    // appears here that the caller could not already see.
    .select('*, guest_events(*), wa_sends(kind, status, sent_at, error_message)')
    .order('name')
  if (error) throw new Error(`Failed to list guests: ${error.message}`)
  return data
}

export async function getGuest(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('guests')
    .select('*, guest_events(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Failed to load guest ${id}: ${error.message}`)
  return data
}

export async function insertGuest(supabase: SupabaseClient, guest: NewGuest) {
  const { data, error } = await supabase
    .from('guests')
    .insert({
      name: guest.name,
      pax: guest.pax,
      side: guest.side,
      inviter_key: guest.inviterKey,
      type: guest.type,
      phone: guest.phone,
      is_vip: guest.isVip,
      is_physical_invitation: guest.isPhysicalInvitation,
      note: guest.note,
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to insert guest: ${error?.message}`)
  return data
}

export async function updateGuest(supabase: SupabaseClient, guestId: string, guest: NewGuest) {
  const { error } = await supabase
    .from('guests')
    .update({
      name: guest.name,
      pax: guest.pax,
      side: guest.side,
      inviter_key: guest.inviterKey,
      type: guest.type,
      phone: guest.phone,
      is_vip: guest.isVip,
      is_physical_invitation: guest.isPhysicalInvitation,
      note: guest.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', guestId)
  if (error) throw new Error(`Failed to update guest ${guestId}: ${error.message}`)
}

/** The couple's own flag; the guard trigger refuses anyone but superadmin. */
export async function setGuestCandid(supabase: SupabaseClient, guestId: string, candid: boolean) {
  const { error } = await supabase.from('guests').update({ candid }).eq('id', guestId)
  if (error) throw new Error(`Failed to set candid for guest ${guestId}: ${error.message}`)
}

// guest_events cascade on delete (see the FK in the migration), so removing a
// guest removes their invitations with them. RLS decides who may do it.
/**
 * A guest who cannot be removed because something already happened to them.
 *
 * guest_events and wa_send_attempts cascade. wa_sends, wa_messages,
 * checkin_events and souvenir_claims deliberately do not: a message that was
 * genuinely sent, and a reply somebody genuinely wrote, are a record of what
 * happened. Deleting the guest row must not quietly take the transcript with
 * it, so the database refuses and the caller is told why.
 */
export class GuestHasHistoryError extends Error {}

export async function deleteGuest(supabase: SupabaseClient, guestId: string) {
  const { error } = await supabase.from('guests').delete().eq('id', guestId)
  if (!error) return
  // 23503 is foreign_key_violation. The only rows that can hold a guest back
  // are the four that do not cascade, all of them history.
  if (error.code === '23503') {
    throw new GuestHasHistoryError(`Guest ${guestId} has messages or check-ins: ${error.message}`)
  }
  throw new Error(`Failed to delete guest ${guestId}: ${error.message}`)
}

export async function updateGuestPhone(supabase: SupabaseClient, guestId: string, phone: string) {
  const { error } = await supabase.from('guests').update({ phone }).eq('id', guestId)
  if (error) throw new Error(`Failed to update phone for guest ${guestId}: ${error.message}`)
}

// RLS scopes this count to rows the caller can already see — do not add a manual
// inviter_key filter here. That's the point: app-code bugs can't leak row counts.
export async function countMissingPhone(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .is('phone', null)
  if (error) throw new Error(`Failed to count missing-phone guests: ${error.message}`)
  return count ?? 0
}
