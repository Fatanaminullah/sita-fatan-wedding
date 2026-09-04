import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Session-scoped reads and writes for the WhatsApp inbox.
 *
 * Distinct from wa-messages-repository.ts, which is the webhook's write path
 * and deliberately holds no session at all. Everything here runs as the logged
 * in admin, so RLS is the boundary: wa_messages gives superadmin everything,
 * and an admin their own side's guests plus every unresolved number. Do not
 * add a manual side filter, that is what the policy is for.
 */

export type InboxGuestContext = {
  id: string
  name: string
  side: 'fatan' | 'sita'
  pax: number
  inviterKey: string
  isVip: boolean
  language: 'en' | 'id'
  events: Array<{
    event: 'akad' | 'resepsi'
    inviteStatus: 'confirmed' | 'waitlisted'
    rsvpStatus: 'pending' | 'attending' | 'not_attending'
    paxConfirmed: number | null
  }>
}

export type InboxRow = {
  id: string
  waId: string
  guestId: string | null
  direction: 'inbound' | 'outbound'
  type: string
  body: string | null
  /** The approved template this was sent as, for an outbound wave message. */
  templateName: string | null
  sentAt: string
  status: string | null
  errorTitle: string | null
  guest: InboxGuestContext | null
}

type RawGuest = {
  id: string
  name: string
  side: 'fatan' | 'sita'
  pax: number
  inviter_key: string
  is_vip: boolean
  language: 'en' | 'id'
  guest_events: Array<{
    event: 'akad' | 'resepsi'
    invite_status: 'confirmed' | 'waitlisted'
    rsvp_status: 'pending' | 'attending' | 'not_attending'
    pax_confirmed: number | null
  }> | null
}

export async function listInboxMessages(supabase: SupabaseClient): Promise<InboxRow[]> {
  const { data, error } = await supabase
    .from('wa_messages')
    // One literal, not a concatenation: PostgREST infers the row type from the
    // select string, and a `+` join widens it to an error type.
    .select(
      'id, wa_id, guest_id, direction, type, body, template_name, sent_at, status, error_title, guests(id, name, side, pax, inviter_key, is_vip, language, guest_events(event, invite_status, rsvp_status, pax_confirmed))'
    )
    .order('sent_at', { ascending: false })
  if (error) throw new Error(`Failed to list inbox messages: ${error.message}`)

  return (data ?? []).map((row) => {
    // PostgREST returns an embedded to-one relation as an object, but its
    // types widen it to a possible array. Normalise once, here.
    const raw = (Array.isArray(row.guests) ? row.guests[0] : row.guests) as RawGuest | null
    return {
      id: row.id as string,
      waId: row.wa_id as string,
      guestId: row.guest_id as string | null,
      direction: row.direction as 'inbound' | 'outbound',
      type: row.type as string,
      body: row.body as string | null,
      templateName: row.template_name as string | null,
      sentAt: row.sent_at as string,
      status: row.status as string | null,
      errorTitle: row.error_title as string | null,
      guest: raw
        ? {
            id: raw.id,
            name: raw.name,
            side: raw.side,
            pax: raw.pax,
            inviterKey: raw.inviter_key,
            isVip: raw.is_vip,
            language: raw.language,
            events: (raw.guest_events ?? []).map((event) => ({
              event: event.event,
              inviteStatus: event.invite_status,
              rsvpStatus: event.rsvp_status,
              paxConfirmed: event.pax_confirmed,
            })),
          }
        : null,
    }
  })
}

/**
 * The thread key Meta uses: digits, no plus.
 *
 * guests.phone is E.164 and carries one. Writing that verbatim would open a
 * second thread for the same person, sitting beside their real one with half
 * the conversation in each.
 */
export function threadKey(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Record something we just sent.
 *
 * Written through the session client, not the webhook's definer function: this
 * caller has a logged-in admin, so RLS can scope it properly and sent_by can
 * record who sent it. The webhook has neither.
 *
 * Covers both halves of what we send: a free-form reply typed in the inbox,
 * and a template a wave put out. The second is the reason the inbox reads as a
 * conversation at all — without it the screen shows guests answering questions
 * nobody appears to have asked.
 */
export async function insertOutboundMessage(
  supabase: SupabaseClient,
  message: {
    waId: string
    guestId: string | null
    providerMessageId: string
    body: string
    sentBy: string
    /** 'text' for a typed reply, 'template' for a wave. */
    type?: string
    /** The approved template's name, when this was one. */
    templateName?: string | null
    /** Defaults to now, which is right for anything sent from this process. */
    sentAt?: string
  }
): Promise<void> {
  const { error } = await supabase.from('wa_messages').insert({
    direction: 'outbound',
    wa_id: threadKey(message.waId),
    guest_id: message.guestId,
    provider_message_id: message.providerMessageId,
    type: message.type ?? 'text',
    body: message.body,
    template_name: message.templateName ?? null,
    sent_at: message.sentAt ?? new Date().toISOString(),
    sent_by: message.sentBy,
  })
  if (error) throw new Error(`Failed to record outbound message: ${error.message}`)
}

/** The guest's last inbound message, which is what opens the 24 hour window. */
export async function lastInboundAt(
  supabase: SupabaseClient,
  waId: string
): Promise<Date | null> {
  const { data, error } = await supabase
    .from('wa_messages')
    .select('sent_at')
    .eq('wa_id', waId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Failed to read the reply window: ${error.message}`)
  return data?.length ? new Date(data[0].sent_at as string) : null
}
