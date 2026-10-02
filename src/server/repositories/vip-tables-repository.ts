import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeatAssignment, SeatingGuest, SeatingTable } from '@/domain/seating'

type TableRow = { id: string; name: string; seats: number; position: number }

export async function listVipTables(supabase: SupabaseClient): Promise<SeatingTable[]> {
  const { data, error } = await supabase.from('vip_tables').select('id, name, seats, position').order('position')
  if (error) throw new Error(`Failed to list VIP tables: ${error.message}`)
  return (data as TableRow[]).map((row) => ({ ...row }))
}

export async function listSeatAssignments(supabase: SupabaseClient): Promise<SeatAssignment[]> {
  const { data, error } = await supabase.from('vip_table_guests').select('guest_id, table_id')
  if (error) throw new Error(`Failed to list seating: ${error.message}`)
  return (data as { guest_id: string; table_id: string }[]).map((row) => ({
    guestId: row.guest_id,
    tableId: row.table_id,
  }))
}

type SeatingRow = {
  id: string
  name: string
  side: 'fatan' | 'sita'
  inviter_key: string
  pax: number
  is_vip: boolean
  resepsi_invite: 'confirmed' | 'waitlisted' | null
  resepsi_rsvp: 'pending' | 'attending' | 'not_attending' | null
  resepsi_pax: number | null
}

/**
 * Every VIP, plus anyone already seated who is no longer one: a guest who lost
 * VIP after being given a table must still show at that table, flagged.
 *
 * Through vip_seating_guests rather than the guests table, because an admin or
 * inviter reads only their own guests there, and a plan missing the other
 * side's names would read as empty seats. The function returns seating
 * columns only, never a phone or a note.
 */
export async function listSeatingGuests(supabase: SupabaseClient): Promise<SeatingGuest[]> {
  const { data, error } = await supabase.rpc('vip_seating_guests')
  if (error) throw new Error(`Failed to list VIP guests: ${error.message}`)
  return ((data ?? []) as SeatingRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    side: row.side,
    inviterKey: row.inviter_key,
    pax: row.pax,
    isVip: row.is_vip,
    resepsiInvite: row.resepsi_invite,
    resepsiRsvp: row.resepsi_rsvp,
    resepsiPaxConfirmed: row.resepsi_pax,
  }))
}

/** Whether the signed-in user may seat or unseat this guest (RLS asks the same). */
export async function canManageSeat(supabase: SupabaseClient, guestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('vip_seat_manageable', { p_guest_id: guestId })
  if (error) throw new Error(`Failed to check the guest: ${error.message}`)
  return data === true
}

export async function insertVipTable(supabase: SupabaseClient, input: { name: string; seats: number; position: number }) {
  const { error } = await supabase.from('vip_tables').insert(input)
  if (error) throw new Error(`Failed to add a table: ${error.message}`)
}

export async function updateVipTable(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{ name: string; seats: number }>
) {
  const { error } = await supabase.from('vip_tables').update(patch).eq('id', id)
  if (error) throw new Error(`Failed to update the table: ${error.message}`)
}

export async function deleteVipTable(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('vip_tables').delete().eq('id', id)
  if (error) throw new Error(`Failed to remove the table: ${error.message}`)
}

/** One row per guest, so seating someone already seated moves them. */
export async function upsertSeat(supabase: SupabaseClient, guestId: string, tableId: string) {
  const { error } = await supabase
    .from('vip_table_guests')
    .upsert({ guest_id: guestId, table_id: tableId }, { onConflict: 'guest_id' })
  if (error) throw new Error(`Failed to seat the guest: ${error.message}`)
}

export async function deleteSeat(supabase: SupabaseClient, guestId: string) {
  const { error } = await supabase.from('vip_table_guests').delete().eq('guest_id', guestId)
  if (error) throw new Error(`Failed to unseat the guest: ${error.message}`)
}
