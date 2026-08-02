import type { SupabaseClient } from '@supabase/supabase-js'

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
