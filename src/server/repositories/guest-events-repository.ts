import type { SupabaseClient } from '@supabase/supabase-js'
import type { WaitlistedGuest } from '@/domain/waitlist'

export async function insertGuestEvents(
  supabase: SupabaseClient,
  guestId: string,
  events: Array<{ event: 'akad' | 'resepsi'; inviteStatus: 'confirmed' | 'waitlisted' }>
) {
  if (events.length === 0) return
  const { error } = await supabase.from('guest_events').insert(
    events.map((e) => ({ guest_id: guestId, event: e.event, invite_status: e.inviteStatus }))
  )
  if (error) throw new Error(`Failed to insert guest_events for guest ${guestId}: ${error.message}`)
}

export type EventInvite = { event: 'akad' | 'resepsi'; inviteStatus: 'confirmed' | 'waitlisted' | 'none' }

/**
 * Makes a guest's invitations match `invites` exactly: `none` removes the row,
 * anything else upserts it. Written as a replace rather than a diff because
 * the edit dialog always sends the full picture for both events, and a partial
 * update is how a guest ends up invited to an event nobody ticked.
 */
export async function setGuestEvents(
  supabase: SupabaseClient,
  guestId: string,
  invites: EventInvite[]
) {
  const remove = invites.filter((invite) => invite.inviteStatus === 'none').map((invite) => invite.event)
  const keep = invites.filter((invite) => invite.inviteStatus !== 'none')

  if (remove.length > 0) {
    const { error } = await supabase.from('guest_events').delete().eq('guest_id', guestId).in('event', remove)
    if (error) throw new Error(`Failed to remove guest_events for guest ${guestId}: ${error.message}`)
  }

  if (keep.length > 0) {
    const { error } = await supabase.from('guest_events').upsert(
      keep.map((invite) => ({
        guest_id: guestId,
        event: invite.event,
        invite_status: invite.inviteStatus,
        // A guest moved off the waitlist keeps no stale rank behind them.
        waitlist_rank: null,
      })),
      { onConflict: 'guest_id,event' }
    )
    if (error) throw new Error(`Failed to set guest_events for guest ${guestId}: ${error.message}`)
  }
}

export type WaitlistedEntry = WaitlistedGuest & { guestEventId: string; name: string }

export async function listWaitlisted(
  supabase: SupabaseClient,
  event: 'akad' | 'resepsi'
): Promise<WaitlistedEntry[]> {
  const { data, error } = await supabase
    .from('guest_events')
    .select('id, waitlist_rank, guests!inner(id, name, pax, side, inviter_key)')
    .eq('event', event)
    .eq('invite_status', 'waitlisted')
  if (error) throw new Error(`Failed to list waitlisted guests for ${event}: ${error.message}`)

  return (data ?? []).map((row) => {
    const guest = row.guests as unknown as {
      id: string
      name: string
      pax: number
      side: 'fatan' | 'sita'
      inviter_key: string
    }
    return {
      guestEventId: row.id,
      guestId: guest.id,
      name: guest.name,
      inviterKey: guest.inviter_key,
      side: guest.side,
      pax: guest.pax,
      waitlistRank: row.waitlist_rank,
    }
  })
}

export async function promoteGuestEventStatus(supabase: SupabaseClient, guestEventId: string) {
  const { error } = await supabase
    .from('guest_events')
    .update({ invite_status: 'confirmed', waitlist_rank: null })
    .eq('id', guestEventId)
  if (error) throw new Error(`Failed to promote guest_event ${guestEventId}: ${error.message}`)
}

export type RsvpWrite = {
  event: 'akad' | 'resepsi'
  status: 'attending' | 'not_attending'
  paxConfirmed: number | null
  respondedVia: 'guest_form' | 'admin_manual'
  respondedBy: string | null
}

/**
 * Write one guest's answer for one event.
 *
 * Targets the existing row rather than upserting: `guest_events` rows are
 * created when the invitation is, and an answer for an event a guest was never
 * invited to must not quietly bring that invitation into existence. The domain
 * refuses that case before it reaches here; this is the second lock.
 *
 * `guard_guest_events_rsvp_columns` rejects these columns for any role below
 * admin, so a caller without the right is stopped by the database rather than
 * by whatever the UI happened to render.
 */
export async function recordRsvp(
  supabase: SupabaseClient,
  guestId: string,
  answer: RsvpWrite
): Promise<{ error: string } | { ok: true }> {
  const { data, error } = await supabase
    .from('guest_events')
    .update({
      rsvp_status: answer.status,
      pax_confirmed: answer.paxConfirmed,
      responded_at: new Date().toISOString(),
      responded_via: answer.respondedVia,
      responded_by: answer.respondedBy,
    })
    .eq('guest_id', guestId)
    .eq('event', answer.event)
    .select('id')

  if (error) return { error: error.message }
  // Zero rows means RLS filtered it or the invitation is not there. Both are
  // refusals, and both would otherwise look like success.
  if (!data || data.length === 0) {
    return { error: 'That answer could not be saved. The guest may not be invited to this event.' }
  }
  return { ok: true }
}

/** Every event a guest holds, with the numbers an answer is judged against. */
export async function listGuestInvitations(
  supabase: SupabaseClient,
  guestId: string
): Promise<
  { event: 'akad' | 'resepsi'; inviteStatus: 'confirmed' | 'waitlisted'; invitedPax: number; rsvpStatus: string }[]
> {
  const { data, error } = await supabase
    .from('guest_events')
    .select('event, invite_status, rsvp_status, guests!inner(pax)')
    .eq('guest_id', guestId)

  if (error) throw new Error(`invitations lookup failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const guest = row.guests as unknown as { pax: number }
    return {
      event: row.event as 'akad' | 'resepsi',
      inviteStatus: row.invite_status as 'confirmed' | 'waitlisted',
      invitedPax: guest.pax,
      rsvpStatus: row.rsvp_status as string,
    }
  })
}

/**
 * Put an answer back to "no answer".
 *
 * Clears the responder trail with it: if nobody answered, nobody should be
 * recorded as having answered, and a stale `responded_by` would make the audit
 * log lie about who said what.
 */
export async function clearRsvp(
  supabase: SupabaseClient,
  guestId: string,
  event: 'akad' | 'resepsi'
): Promise<{ error: string } | { ok: true }> {
  const { data, error } = await supabase
    .from('guest_events')
    .update({
      rsvp_status: 'pending',
      pax_confirmed: null,
      responded_at: null,
      responded_via: null,
      responded_by: null,
    })
    .eq('guest_id', guestId)
    .eq('event', event)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'That change could not be saved. The guest may not be invited to this event.' }
  }
  return { ok: true }
}
