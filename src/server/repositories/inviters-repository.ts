import type { SupabaseClient } from '@supabase/supabase-js'

export async function loadInviterCapacity(
  supabase: SupabaseClient,
  inviterKey: string,
  event: 'akad' | 'resepsi'
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
    .select('id, pax, guest_events!inner(event, invite_status, rsvp_status)')
    .eq('inviter_key', inviterKey)
    .eq('guest_events.event', event)
    .eq('guest_events.invite_status', 'confirmed')
    .neq('guest_events.rsvp_status', 'not_attending')
  if (guestsError) {
    throw new Error(`Failed to load confirmed pax for ${inviterKey}/${event}: ${guestsError.message}`)
  }

  const confirmedPax = (guests ?? []).reduce((sum, g) => sum + g.pax, 0)
  return { cap: (inviter as unknown as Record<string, number>)[capColumn], confirmedPax }
}

export async function listInviters(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('inviters').select('*').order('key')
  if (error) throw new Error(`Failed to list inviters: ${error.message}`)
  return data
}
