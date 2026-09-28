import type { SupabaseClient } from '@supabase/supabase-js'
import { heldPax, type HeldInvite } from '@/domain/quota'

/**
 * Seats an inviter's guests hold at one event, counted the way the capacity
 * strip and the dashboard count them (heldPax). `excludeGuestId` measures the
 * list without one guest, which is how an edit is judged: against everyone
 * else, plus what this guest will hold after it.
 */
export async function loadInviterCapacity(
  supabase: SupabaseClient,
  inviterKey: string,
  event: 'akad' | 'resepsi',
  excludeGuestId: string | null = null
): Promise<{ cap: number; confirmedPax: number }> {
  const capColumn = event === 'akad' ? 'akad_cap' : 'resepsi_cap'
  const { data: inviter, error: inviterError } = await supabase
    .from('inviters')
    .select(capColumn)
    .eq('key', inviterKey)
    .single()
  if (inviterError || !inviter) {
    throw new Error(`Failed to load inviter cap for ${inviterKey}: ${inviterError?.message}`)
  }

  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('id, pax, guest_events!inner(event, invite_status, rsvp_status, pax_confirmed)')
    .eq('inviter_key', inviterKey)
    .eq('guest_events.event', event)
    .eq('guest_events.invite_status', 'confirmed')
    .neq('guest_events.rsvp_status', 'not_attending')
  if (guestsError) {
    throw new Error(`Failed to load confirmed pax for ${inviterKey}/${event}: ${guestsError.message}`)
  }

  type Row = {
    id: string
    pax: number
    guest_events: { invite_status: HeldInvite['inviteStatus']; rsvp_status: HeldInvite['rsvpStatus']; pax_confirmed: number | null }[]
  }
  const confirmedPax = ((guests ?? []) as Row[])
    .filter((g) => g.id !== excludeGuestId)
    .reduce((sum, g) => {
      const row = g.guest_events[0]
      return (
        sum +
        heldPax(
          row && { inviteStatus: row.invite_status, rsvpStatus: row.rsvp_status, paxConfirmed: row.pax_confirmed },
          g.pax
        )
      )
    }, 0)
  return { cap: (inviter as unknown as Record<string, number>)[capColumn], confirmedPax }
}

export async function listInviters(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('inviters').select('*').order('key')
  if (error) throw new Error(`Failed to list inviters: ${error.message}`)
  return data
}

export async function updateInviterCaps(
  supabase: SupabaseClient,
  key: string,
  caps: { akadCap: number; resepsiCap: number }
) {
  const { error } = await supabase
    .from('inviters')
    .update({ akad_cap: caps.akadCap, resepsi_cap: caps.resepsiCap })
    .eq('key', key)
  if (error) throw new Error(`Failed to update caps for ${key}: ${error.message}`)
}

export async function listSideCaps(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('side_caps').select('side, vip_cap, physical_cap').order('side')
  if (error) throw new Error(`Failed to list side caps: ${error.message}`)
  return data
}

export async function updateSideVipCap(supabase: SupabaseClient, side: 'fatan' | 'sita', vipCap: number) {
  const { error } = await supabase.from('side_caps').update({ vip_cap: vipCap }).eq('side', side)
  if (error) throw new Error(`Failed to update VIP cap for ${side}: ${error.message}`)
}

export async function updateSidePhysicalCap(
  supabase: SupabaseClient,
  side: 'fatan' | 'sita',
  physicalCap: number
) {
  const { error } = await supabase.from('side_caps').update({ physical_cap: physicalCap }).eq('side', side)
  if (error) throw new Error(`Failed to update printed invitation cap for ${side}: ${error.message}`)
}
