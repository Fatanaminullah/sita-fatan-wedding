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
