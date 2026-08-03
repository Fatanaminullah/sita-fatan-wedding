import type { SupabaseClient } from '@supabase/supabase-js'

export type NewGuest = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  phone: string | null
  isVip: boolean
  note: string | null
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
      note: guest.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', guestId)
  if (error) throw new Error(`Failed to update guest ${guestId}: ${error.message}`)
}

// guest_events cascade on delete (see the FK in the migration), so removing a
// guest removes their invitations with them. RLS decides who may do it.
export async function deleteGuest(supabase: SupabaseClient, guestId: string) {
  const { error } = await supabase.from('guests').delete().eq('id', guestId)
  if (error) throw new Error(`Failed to delete guest ${guestId}: ${error.message}`)
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
