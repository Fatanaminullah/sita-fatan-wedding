import type { SupabaseClient } from '@supabase/supabase-js'

export type NewGuest = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  phone: string | null
  isVip: boolean
}

// RLS scopes these results by role automatically — do not add a manual
// inviter_key filter here. That's the point: app-code bugs can't leak rows.
export async function listGuests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('guests')
    .select('*, guest_events(*)')
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
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to insert guest: ${error?.message}`)
  return data
}

export async function updateGuestPhone(supabase: SupabaseClient, guestId: string, phone: string) {
  const { error } = await supabase.from('guests').update({ phone }).eq('id', guestId)
  if (error) throw new Error(`Failed to update phone for guest ${guestId}: ${error.message}`)
}
