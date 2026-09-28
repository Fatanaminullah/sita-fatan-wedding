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

type GuestRow = {
  id: string
  name: string
  side: 'fatan' | 'sita'
  inviter_key: string
  pax: number
  is_vip: boolean
  guest_events: {
    event: 'akad' | 'resepsi'
    invite_status: 'confirmed' | 'waitlisted'
    rsvp_status: 'pending' | 'attending' | 'not_attending'
    pax_confirmed: number | null
  }[]
}

function toSeatingGuest(row: GuestRow): SeatingGuest {
  const resepsi = row.guest_events.find((e) => e.event === 'resepsi')
  return {
    id: row.id,
    name: row.name,
    side: row.side,
    inviterKey: row.inviter_key,
    pax: row.pax,
    isVip: row.is_vip,
    resepsiInvite: resepsi?.invite_status ?? null,
    resepsiRsvp: resepsi?.rsvp_status ?? null,
    resepsiPaxConfirmed: resepsi?.pax_confirmed ?? null,
  }
}

const GUEST_COLUMNS =
  'id, name, side, inviter_key, pax, is_vip, guest_events(event, invite_status, rsvp_status, pax_confirmed)'

/**
 * Every VIP, plus anyone already seated who is no longer one. The second
 * group is why this is two queries: a guest who lost VIP after being given a
 * table must still show at that table, flagged, not disappear from it.
 */
export async function listSeatingGuests(
  supabase: SupabaseClient,
  seatedIds: string[]
): Promise<SeatingGuest[]> {
  const vips = await supabase.from('guests').select(GUEST_COLUMNS).eq('is_vip', true).order('name')
  if (vips.error) throw new Error(`Failed to list VIP guests: ${vips.error.message}`)
  const rows = vips.data as unknown as GuestRow[]
  const have = new Set(rows.map((r) => r.id))
  const missing = seatedIds.filter((id) => !have.has(id))
  if (missing.length > 0) {
    const extra = await supabase.from('guests').select(GUEST_COLUMNS).in('id', missing)
    if (extra.error) throw new Error(`Failed to list seated guests: ${extra.error.message}`)
    rows.push(...(extra.data as unknown as GuestRow[]))
  }
  return rows.map(toSeatingGuest)
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
