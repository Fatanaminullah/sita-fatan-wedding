import type { SupabaseClient } from '@supabase/supabase-js'

/** What a label prints. Never carries an amount: the door reads this. */
export type EnvelopeLabel = {
  code: string
  name: string
  side: 'fatan' | 'sita' | null
  inviterKey: string | null
}

export type GiftKind = 'envelope' | 'transfer' | 'item'

/** One gift: an envelope from the door, a transfer, or a present. */
export type Envelope = {
  id: string
  kind: GiftKind
  /** Envelopes only: the code on the printed label. */
  code: string | null
  /** Items only: what it is. */
  item: string | null
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
  kind: GiftKind
  code: string | null
  item: string | null
  guest_id: string | null
  name: string
  amount: number | null
  note: string | null
  created_at: string
  recorded_at: string | null
  guests: { name: string; side: 'fatan' | 'sita'; inviter_key: string } | null
}

const COLUMNS = 'id, kind, code, item, guest_id, name, amount, note, created_at, recorded_at, guests(name, side, inviter_key)'

function toEnvelope(row: Row): Envelope {
  return {
    id: row.id,
    kind: row.kind,
    code: row.code,
    item: row.item,
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
  const { data, error } = await supabase
    .from('envelopes')
    .select(COLUMNS)
    .order('code', { nullsFirst: false })
    .order('created_at')
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

/**
 * A gift recorded by hand: an envelope handed over outside the door, a
 * transfer, or a present. Only an envelope is given a code, on insert.
 */
export async function insertGift(
  supabase: SupabaseClient,
  input: {
    kind: GiftKind
    guestId: string | null
    name: string
    amount: number | null
    item: string | null
    note: string | null
    userId: string
  }
): Promise<string | null> {
  const counted = input.amount !== null
  const { data, error } = await supabase
    .from('envelopes')
    .insert({
      kind: input.kind,
      guest_id: input.guestId,
      name: input.name,
      amount: input.amount,
      item: input.item,
      note: input.note,
      printed_by: input.userId,
      recorded_at: counted ? new Date().toISOString() : null,
      recorded_by: counted ? input.userId : null,
    })
    .select('code')
    .single()
  if (error) throw new Error(`Failed to add the gift: ${error.message}`)
  return (data as { code: string | null }).code
}

export async function deleteEnvelope(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('envelopes').delete().eq('id', id)
  if (error) throw new Error(`Failed to remove the envelope: ${error.message}`)
}
