import type { SupabaseClient } from '@supabase/supabase-js'

/** What a label prints. Never carries an amount: the door reads this. */
export type EnvelopeLabel = {
  code: string
  name: string
  side: 'fatan' | 'sita' | null
  inviterKey: string | null
}

export type Envelope = {
  id: string
  code: string
  guestId: string | null
  name: string
  /** The guest's current name, which may differ from the printed one. */
  guestName: string | null
  side: 'fatan' | 'sita' | null
  inviterKey: string | null
  amount: number | null
  note: string | null
  createdAt: string
  recordedAt: string | null
}

export async function issueGuestLabel(supabase: SupabaseClient, guestId: string): Promise<EnvelopeLabel> {
  const { data, error } = await supabase.rpc('issue_envelope_label', { p_guest_id: guestId })
  if (error) throw new Error(error.message)
  const row = (data as { code: string; name: string; side: 'fatan' | 'sita'; inviter_key: string }[])[0]
  return { code: row.code, name: row.name, side: row.side, inviterKey: row.inviter_key }
}

export async function issueUnlistedLabel(supabase: SupabaseClient, name: string): Promise<EnvelopeLabel> {
  const { data, error } = await supabase.rpc('issue_unlisted_envelope_label', { p_name: name })
  if (error) throw new Error(error.message)
  const row = (data as { code: string; name: string }[])[0]
  return { code: row.code, name: row.name, side: null, inviterKey: null }
}

type Row = {
  id: string
  code: string
  guest_id: string | null
  name: string
  amount: number | null
  note: string | null
  created_at: string
  recorded_at: string | null
  guests: { name: string; side: 'fatan' | 'sita'; inviter_key: string } | null
}

const COLUMNS = 'id, code, guest_id, name, amount, note, created_at, recorded_at, guests(name, side, inviter_key)'

function toEnvelope(row: Row): Envelope {
  return {
    id: row.id,
    code: row.code,
    guestId: row.guest_id,
    name: row.name,
    guestName: row.guests?.name ?? null,
    side: row.guests?.side ?? null,
    inviterKey: row.guests?.inviter_key ?? null,
    amount: row.amount,
    note: row.note,
    createdAt: row.created_at,
    recordedAt: row.recorded_at,
  }
}

export async function listEnvelopes(supabase: SupabaseClient): Promise<Envelope[]> {
  const { data, error } = await supabase.from('envelopes').select(COLUMNS).order('code')
  if (error) throw new Error(`Failed to list envelopes: ${error.message}`)
  return (data as unknown as Row[]).map(toEnvelope)
}

export async function recordEnvelopeAmount(
  supabase: SupabaseClient,
  id: string,
  input: { amount: number | null; note: string | null; userId: string }
) {
  const { error } = await supabase
    .from('envelopes')
    .update({
      amount: input.amount,
      note: input.note,
      recorded_at: input.amount === null ? null : new Date().toISOString(),
      recorded_by: input.amount === null ? null : input.userId,
    })
    .eq('id', id)
  if (error) throw new Error(`Failed to save the amount: ${error.message}`)
}

/** A second envelope for a listed guest, or one entered without a label. The code is assigned on insert. */
export async function insertEnvelope(
  supabase: SupabaseClient,
  input: { guestId: string | null; name: string; userId: string }
): Promise<string> {
  const { data, error } = await supabase
    .from('envelopes')
    .insert({ guest_id: input.guestId, name: input.name, printed_by: input.userId })
    .select('code')
    .single()
  if (error) throw new Error(`Failed to add the envelope: ${error.message}`)
  return (data as { code: string }).code
}

export async function deleteEnvelope(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('envelopes').delete().eq('id', id)
  if (error) throw new Error(`Failed to remove the envelope: ${error.message}`)
}
