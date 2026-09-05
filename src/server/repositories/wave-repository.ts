import type { SupabaseClient } from '@supabase/supabase-js'
import { MARKETING_CAP_ERROR, type BatchNumber, type WaveCandidate, type WaveKind } from '@/domain/wave'

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
  pax: number
  public_slug: string
  rsvp_token: string
  send_batch: BatchNumber | null
  guest_events: Array<{ invite_status: string; rsvp_status: string; pax_confirmed: number | null }> | null
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
  /**
   * The entry ticket, carried ONLY by the QR wave and never by a link.
   * docs/ROUTING.md Decision 2: a forwarded invitation must not become entry.
   */
  token: string
  /** Every invited event has an answer on file. */
  answered: boolean
  /** At least one of those answers was yes. */
  attending: boolean
  /**
   * How many people the ticket admits.
   *
   * The approved ticket template prints it, so it is part of the send and not
   * merely reporting. The largest confirmed number across the events they are
   * actually coming to: a guest at both doors is admitted for the wider of the
   * two, and the door itself still checks per event. Falls back to the invited
   * pax when they are coming but nobody recorded a number, which is better
   * than printing a ticket for nobody.
   */
  confirmedPax: number
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
      'id, name, phone, pax, language, public_slug, rsvp_token, send_batch, guest_events(invite_status, rsvp_status, pax_confirmed), wa_sends(kind, status, sent_at, last_error_code, last_attempt_at)'
    )
    .order('name')

  if (error) throw new Error(`wave candidates failed: ${error.message}`)

  return (data as Row[]).map((row) => {
    const send = (row.wa_sends ?? []).find((s) => s.kind === kind)
    const confirmed = (row.guest_events ?? []).filter((e) => e.invite_status === 'confirmed')
    const attendingPax = confirmed
      .filter((e) => e.rsvp_status === 'attending')
      .map((e) => e.pax_confirmed ?? row.pax)
    return {
      guestId: row.id,
      name: row.name,
      phone: row.phone,
      language: row.language,
      slug: row.public_slug,
      token: row.rsvp_token,
      // Answered means every invited event has a reply, not just one of them:
      // a guest answered for the Akad and silent on the Resepsi is still
      // going to be refused at the second door.
      answered: confirmed.length > 0 && confirmed.every((e) => e.rsvp_status !== 'pending'),
      attending: confirmed.some((e) => e.rsvp_status === 'attending'),
      confirmedPax: attendingPax.length > 0 ? Math.max(...attendingPax) : row.pax,
      hasConfirmedInvite: confirmed.length > 0,
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
  const provider = process.env.WA_PROVIDER ?? 'fake'

  const { error } = await supabase.from('wa_sends').insert({
    guest_id: guestId,
    kind,
    provider,
    status: 'queued',
    attempts: 0,
  })

  if (!error) return { claimed: true }
  if (error.code !== '23505') {
    throw new Error(`could not claim ${guestId}: ${error.message}`)
  }

  /*
   * A row already exists. That is the lock working for a live claim, and a
   * dead end for a failed one.
   *
   * wa_sends is unique (guest_id, kind), so a failed attempt leaves a row
   * sitting in the only slot that guest has for that step. The insert above
   * then collides forever and the guest is reported as "already claimed by
   * another run" on every subsequent attempt. loadWaveCandidates deliberately
   * treats a failed row as not sent, precisely so a single rejection cannot
   * retire somebody from the wave — and this made that impossible. Three
   * guests whose invitations failed on a bad header image could never be
   * invited again.
   *
   * Re-taking is conditional on status = 'failed', which keeps the lock
   * honest: two operators retrying at once, and the second matches zero rows
   * because the first already moved it to 'queued'.
   *
   * `attempts` is left alone. It counts how many times this guest has been
   * tried, across runs, and resetting it would erase the fact that a number
   * has failed repeatedly.
   */
  const { data: retaken, error: retakeError } = await supabase
    .from('wa_sends')
    .update({ status: 'queued', provider, error_message: null, last_error_code: null })
    .eq('guest_id', guestId)
    .eq('kind', kind)
    .eq('status', 'failed')
    .select('id')

  if (retakeError) {
    throw new Error(`could not re-claim ${guestId}: ${retakeError.message}`)
  }

  return { claimed: (retaken ?? []).length > 0 }
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
  batch: BatchNumber | null
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
  batch: BatchNumber | null
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
 * page that only arranges people into groups should not be handling anybody's
 * phone number.
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
      batch: (row.send_batch as BatchNumber | null) ?? null,
      reachable: Boolean(row.phone) && events.some((e) => e.invite_status === 'confirmed'),
      invited: sends.some((s) => s.kind === 'invite' && s.status !== 'failed'),
    }
  })
}

/** How many genuine sends each wave has behind it. */
export async function sentCountsByKind(
  supabase: SupabaseClient
): Promise<Record<WaveKind, number>> {
  const { data, error } = await supabase.from('wa_sends').select('kind, status').neq('status', 'failed')
  if (error) throw new Error(`send counts failed: ${error.message}`)

  const counts: Record<WaveKind, number> = { invite: 0, reminder: 0, qr_checkin: 0 }
  for (const row of data ?? []) {
    const kind = row.kind as WaveKind
    // A queued row is a claim, not a delivery. Counting it would tell the
    // couple a message went out that never did.
    if (row.status === 'queued') continue
    if (kind in counts) counts[kind] += 1
  }
  return counts
}

export type SendLogRow = {
  id: string
  guestId: string
  guestName: string
  inviterKey: string
  kind: WaveKind
  status: string
  sentAt: string | null
  lastAttemptAt: string | null
  attempts: number
  errorMessage: string | null
  lastErrorCode: string | null
  providerMessageId: string | null
}

/**
 * Every send this account has on record, newest attempt first.
 *
 * One row per guest per step, because `wa_sends` carries
 * `unique (guest_id, kind)` and a retry updates the row it retried. This is a
 * ledger of where each guest stands, not a history of every attempt: that
 * history does not exist in the data and this must not pretend otherwise.
 *
 * RLS scopes it. An inviter sees sends to their own guests
 * (wa_sends_inviter_read) and a side-scoped admin sees their own side.
 */
export async function loadSendLog(supabase: SupabaseClient): Promise<SendLogRow[]> {
  const { data, error } = await supabase
    .from('wa_sends')
    .select(
      'id, guest_id, kind, status, sent_at, last_attempt_at, attempts, error_message, last_error_code, provider_message_id, guests(name, inviter_key)'
    )
    .order('last_attempt_at', { ascending: false, nullsFirst: false })
    .limit(2000)

  if (error) throw new Error(`send log failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const guest = row.guests as unknown as { name: string; inviter_key: string } | null
    return {
      id: row.id as string,
      guestId: row.guest_id as string,
      // A send whose guest row is not readable should never be rendered as a
      // nameless row: that is the Unscoped Lookup trap in miniature.
      guestName: guest?.name ?? 'Not visible to you',
      inviterKey: guest?.inviter_key ?? '',
      kind: row.kind as WaveKind,
      status: row.status as string,
      sentAt: (row.sent_at as string | null) ?? null,
      lastAttemptAt: (row.last_attempt_at as string | null) ?? null,
      attempts: (row.attempts as number | null) ?? 0,
      errorMessage: (row.error_message as string | null) ?? null,
      lastErrorCode: (row.last_error_code as string | null) ?? null,
      providerMessageId: (row.provider_message_id as string | null) ?? null,
    }
  })
}

/**
 * Append one immutable record of an attempt.
 *
 * `markAttempt` updates the guest's current state; this records that the
 * attempt happened at all. A retry overwrites the wa_sends row it retried, so
 * without this the question "what did we do to this person, and when, and what
 * came back" has no answer once a row has been rewritten.
 *
 * Deliberately never throws. Losing a log line must not fail a send that
 * already reached a real phone, and must not abort the rest of a 250-guest run.
 */
export async function recordSendAttempt(
  supabase: SupabaseClient,
  attempt: {
    guestId: string
    kind: WaveKind
    outcome: 'accepted' | 'rejected'
    providerMessageId?: string | null
    errorCode?: string | null
    errorMessage?: string | null
    actorId?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('wa_send_attempts').insert({
    guest_id: attempt.guestId,
    kind: attempt.kind,
    outcome: attempt.outcome,
    provider_message_id: attempt.providerMessageId ?? null,
    error_code: attempt.errorCode ?? null,
    error_message: attempt.errorMessage ?? null,
    actor_id: attempt.actorId ?? null,
  })

  if (error) {
    // The guest's number is not in scope here, so this is safe to log.
    console.error(`[wa-attempts] could not record ${attempt.kind} attempt: ${error.message}`)
  }
}
