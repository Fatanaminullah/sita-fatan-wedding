import type { SupabaseClient } from '@supabase/supabase-js'
import { MARKETING_CAP_ERROR, type WaveCandidate, type WaveKind } from '@/domain/wave'

/**
 * Reading and recording a WhatsApp wave.
 *
 * Everything here is scoped by RLS as usual: a side-scoped admin planning a
 * wave sees their own side's guests and nobody else's. That is the correct
 * behaviour and not something to work around — a wave run by one admin simply
 * covers their half, and the other half's admin runs theirs.
 */

type Row = {
  id: string
  name: string
  phone: string | null
  language: 'en' | 'id'
  public_slug: string
  send_batch: 1 | 2 | null
  guest_events: Array<{ invite_status: string }> | null
  wa_sends: Array<{
    kind: string
    status: string
    sent_at: string | null
    last_error_code: string | null
    last_attempt_at: string | null
  }> | null
}

export type WaveGuest = WaveCandidate & {
  language: 'en' | 'id'
  /** The trailing part of the invitation URL, and the whole of what the
   *  template's button variable may carry. */
  slug: string
}

/**
 * Everyone this wave could conceivably reach, with what is already known about
 * them. The domain decides who is actually eligible; this only gathers.
 */
export async function loadWaveCandidates(
  supabase: SupabaseClient,
  kind: WaveKind
): Promise<WaveGuest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select(
      'id, name, phone, language, public_slug, send_batch, guest_events(invite_status), wa_sends(kind, status, sent_at, last_error_code, last_attempt_at)'
    )
    .order('name')

  if (error) throw new Error(`wave candidates failed: ${error.message}`)

  return (data as Row[]).map((row) => {
    const send = (row.wa_sends ?? []).find((s) => s.kind === kind)
    return {
      guestId: row.id,
      name: row.name,
      phone: row.phone,
      language: row.language,
      slug: row.public_slug,
      hasConfirmedInvite: (row.guest_events ?? []).some((e) => e.invite_status === 'confirmed'),
      // Only a genuine success counts as sent. A row that exists because an
      // attempt failed must stay reachable, or a single rejection would
      // silently retire that guest from the wave forever.
      sentAt: send && send.status !== 'failed' ? (send.sent_at ?? null) : null,
      lastErrorCode: send?.last_error_code ?? null,
      lastAttemptAt: send?.last_attempt_at ?? null,
      batch: row.send_batch,
    }
  })
}

/**
 * How many distinct numbers this account has already reached today.
 *
 * The daily cap is per recipient, so two guests on one number spend one of it.
 */
export async function recipientsReachedToday(
  supabase: SupabaseClient,
  todayStartIso: string
): Promise<number> {
  const { data, error } = await supabase
    .from('wa_sends')
    .select('guests!inner(phone)')
    .neq('status', 'failed')
    .gte('last_attempt_at', todayStartIso)

  if (error) throw new Error(`daily count failed: ${error.message}`)

  const numbers = new Set(
    (data ?? [])
      .map((row) => (row.guests as unknown as { phone: string | null })?.phone)
      .filter((phone): phone is string => Boolean(phone))
  )
  return numbers.size
}

/**
 * Claim a guest for this wave before the message goes out.
 *
 * The insert is the lock. Two operators pressing send at the same moment both
 * try to claim, the unique constraint on (guest_id, kind) lets exactly one
 * through, and the loser skips that guest instead of sending a second copy.
 * Claiming before sending rather than recording after is what makes that work:
 * a record written afterwards is written too late to prevent anything.
 */
export async function claimForWave(
  supabase: SupabaseClient,
  guestId: string,
  kind: WaveKind
): Promise<{ claimed: boolean }> {
  const { error } = await supabase.from('wa_sends').insert({
    guest_id: guestId,
    kind,
    provider: process.env.WA_PROVIDER ?? 'fake',
    status: 'queued',
    attempts: 0,
  })

  if (!error) return { claimed: true }
  // 23505: somebody already holds this one.
  if (error.code === '23505') return { claimed: false }
  throw new Error(`could not claim ${guestId}: ${error.message}`)
}

/** A previously failed row being retried keeps its history and its attempt count. */
export async function markAttempt(
  supabase: SupabaseClient,
  guestId: string,
  kind: WaveKind,
  outcome:
    | { ok: true; providerMessageId: string }
    | { ok: false; code: number | null; message: string }
): Promise<void> {
  const now = new Date().toISOString()

  const patch = outcome.ok
    ? {
        status: 'sent',
        sent_at: now,
        provider_message_id: outcome.providerMessageId,
        error_message: null,
        last_error_code: null,
        last_attempt_at: now,
      }
    : {
        status: 'failed',
        error_message: outcome.message,
        last_error_code: outcome.code === null ? null : String(outcome.code),
        last_attempt_at: now,
      }

  const { error } = await supabase
    .from('wa_sends')
    .update(patch)
    .eq('guest_id', guestId)
    .eq('kind', kind)

  if (error) throw new Error(`could not record the attempt for ${guestId}: ${error.message}`)
}

/** Release a claim that never resulted in a send, so the guest stays reachable. */
export async function releaseClaim(
  supabase: SupabaseClient,
  guestId: string,
  kind: WaveKind
): Promise<void> {
  await supabase.from('wa_sends').delete().eq('guest_id', guestId).eq('kind', kind).eq('status', 'queued')
}

export async function readSetting(
  supabase: SupabaseClient,
  key: string
): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(`setting ${key} failed: ${error.message}`)
  return (data?.value as string | undefined) ?? null
}

export async function writeSetting(
  supabase: SupabaseClient,
  key: string,
  value: string,
  userId: string
): Promise<{ error: string } | { ok: true }> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_by: userId }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return { ok: true }
}

export { MARKETING_CAP_ERROR }

/**
 * Put guests into a batch, or take them out of one.
 *
 * Bulk here, unlike RSVP answers, and the difference is what a mistake costs.
 * A wrong batch delays somebody's invitation by a day; a wrong RSVP blocks a
 * relative at a door nobody can override.
 */
export async function assignBatch(
  supabase: SupabaseClient,
  guestIds: string[],
  batch: 1 | 2 | null
): Promise<{ error: string } | { ok: true; updated: number }> {
  if (guestIds.length === 0) return { ok: true, updated: 0 }

  const { data, error } = await supabase
    .from('guests')
    .update({ send_batch: batch })
    .in('id', guestIds)
    .select('id')

  if (error) return { error: error.message }
  return { ok: true, updated: data?.length ?? 0 }
}

export type BatchRow = {
  guestId: string
  name: string
  inviterKey: string
  side: 'fatan' | 'sita'
  batch: 1 | 2 | null
  /** Could actually receive a message: has a number and a confirmed invitation. */
  reachable: boolean
  /** The invitation has already gone out to them, so their batch is moot. */
  invited: boolean
}

/**
 * The guest list as the batch screen needs it.
 *
 * Deliberately not `loadWaveCandidates`: that one carries phone numbers and
 * send history because a send needs them, and this screen needs neither. A
 * page that only arranges people into two groups should not be handling
 * anybody's phone number.
 */
export async function loadBatchRows(supabase: SupabaseClient): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('id, name, inviter_key, side, phone, send_batch, guest_events(invite_status), wa_sends(kind, status)')
    .order('name')

  if (error) throw new Error(`batch list failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const events = (row.guest_events ?? []) as Array<{ invite_status: string }>
    const sends = (row.wa_sends ?? []) as Array<{ kind: string; status: string }>
    return {
      guestId: row.id as string,
      name: row.name as string,
      inviterKey: row.inviter_key as string,
      side: row.side as 'fatan' | 'sita',
      batch: (row.send_batch as 1 | 2 | null) ?? null,
      reachable: Boolean(row.phone) && events.some((e) => e.invite_status === 'confirmed'),
      invited: sends.some((s) => s.kind === 'invite' && s.status !== 'failed'),
    }
  })
}
