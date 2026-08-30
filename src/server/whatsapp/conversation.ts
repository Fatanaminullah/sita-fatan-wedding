import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  handleReply,
  openingMessage,
  parseReply,
  type ChatGuest,
  type ChatMessage,
  type EventKey,
} from '@/domain/conversation'
import type { InboundMessage } from '@/domain/whatsapp'
import { requireEnv } from '../supabase/env'
import { sendInteractive, sendText } from './send'

/**
 * The RSVP conversation, driven by the webhook.
 *
 * Everything about what to say lives in `src/domain/conversation.ts`. This
 * fetches the guest, hands the reply over, does what it is told, and sends the
 * answer.
 *
 * Reads and writes through two SECURITY DEFINER functions rather than the
 * secret key, so CLAUDE.md's four sanctioned uses stay at four. Both resolve a
 * guest by phone digits and both return nothing when two guests share a
 * number: a chat message carries no way to tell a household apart, and
 * guessing would put an answer on the wrong person.
 */

function anonClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false } }
  )
}

type ChatRow = {
  name: string
  pax: number
  language: 'en' | 'id'
  chat_awaiting: 'events' | 'pax' | null
  invited_akad: boolean
  invited_resepsi: boolean
  akad_rsvp: ChatGuest['akadRsvp']
  resepsi_rsvp: ChatGuest['resepsiRsvp']
  akad_pax: number | null
  resepsi_pax: number | null
}

export async function loadChatGuest(phone: string): Promise<ChatGuest | null> {
  const { data, error } = await anonClient().rpc('guest_for_chat', { p_phone: phone })
  if (error) throw new Error(`chat guest lookup failed: ${error.message}`)

  const row = (data as ChatRow[])?.[0]
  if (!row) return null

  return {
    name: row.name,
    pax: row.pax,
    language: row.language,
    invitedAkad: row.invited_akad,
    invitedResepsi: row.invited_resepsi,
    akadRsvp: row.akad_rsvp,
    resepsiRsvp: row.resepsi_rsvp,
    akadPax: row.akad_pax,
    resepsiPax: row.resepsi_pax,
    awaiting: row.chat_awaiting,
  }
}

async function send(phone: string, message: ChatMessage) {
  if (message.type === 'text') return sendText(phone, message.body)
  return sendInteractive(phone, message)
}

/**
 * Deal with one inbound message.
 *
 * Called from the webhook's `after`, so the 200 has already gone out: Meta
 * retries anything slow, and a retry here would mean the guest receives the
 * next question twice.
 *
 * Returns what it did, for the log. Nothing here is allowed to throw into the
 * webhook: a guest whose conversation breaks must not take the endpoint down
 * with them, because Meta disables an endpoint that keeps failing and then
 * nobody's replies arrive at all.
 */
export async function handleInbound(
  message: InboundMessage
): Promise<'answered' | 'handover' | 'unknown_number' | 'error'> {
  const phone = message.waId

  try {
    const guest = await loadChatGuest(phone)
    // Not a guest, or a number two guests share. Either way a person reads it
    // in the inbox; nothing is guessed.
    if (!guest) return 'unknown_number'

    const action = handleReply(guest, parseReply(message.replyId))
    if (action.kind === 'handover') return 'handover'

    if (action.kind === 'record') {
      const { error } = await anonClient().rpc('submit_rsvp_by_phone', {
        p_phone: phone,
        p_events: action.events as EventKey[],
        p_attending: action.attending,
        p_pax: action.pax,
        p_awaiting: action.awaiting,
      })
      if (error) throw new Error(`chat rsvp write failed: ${error.message}`)
    } else {
      // A question asked is a question outstanding, so a typed reply later can
      // be answered with the same one rather than starting over.
      const awaiting =
        action.reply.type === 'list' ? 'pax' : action.reply.type === 'buttons' ? 'events' : null
      await anonClient().rpc('submit_rsvp_by_phone', {
        p_phone: phone,
        p_events: null,
        p_attending: false,
        p_pax: null,
        p_awaiting: awaiting,
      })
    }

    await send(phone, action.reply)
    return 'answered'
  } catch (error) {
    // Never rethrown into the webhook.
    console.error('[wa-chat] could not handle an inbound message', error)
    return 'error'
  }
}

/**
 * Open the conversation with a guest whose window is already open.
 *
 * The reminder template will do this once Meta approves it. Until then this is
 * how the whole flow is testable: open a window by hand, then send the very
 * buttons the template will carry, through the same code path a real tap will
 * take.
 */
export async function startConversation(phone: string): Promise<{ error: string } | { ok: true }> {
  const guest = await loadChatGuest(phone)
  if (!guest) {
    return { error: 'No single guest holds that number, so there is nobody to ask.' }
  }

  const result = await send(phone, openingMessage(guest))
  if (!result.ok) return { error: result.error }

  await anonClient().rpc('submit_rsvp_by_phone', {
    p_phone: phone,
    p_events: null,
    p_attending: false,
    p_pax: null,
    p_awaiting: 'events',
  })

  return { ok: true }
}
