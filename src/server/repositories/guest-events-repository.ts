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
