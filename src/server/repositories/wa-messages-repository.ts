import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { InboundMessage, StatusUpdate } from '@/domain/whatsapp'
import { requireEnv } from '../supabase/env'

/**
 * The WhatsApp webhook's write path.
 *
 * Meta calls /api/whatsapp/webhook with no session, so there is no logged-in
 * role for RLS to scope. The precedent is guest_by_public_slug, used by the
 * unauthenticated /to/<slug> page: a narrow SECURITY DEFINER function on the
 * publishable key, never SUPABASE_SECRET_KEY, whose four sanctioned callers
 * (CLAUDE.md) stay at four. A service-role client sitting in a public route
 * would hold read and write on every table, including 336 phone numbers, to
 * do a job that needs one insert.
 *
 * That precedent does not transfer unchanged: guest_by_public_slug only reads,
 * and the slug is itself the credential. These functions write, and the
 * X-Hub-Signature-256 check happens in Node where Postgres cannot see it. So
 * the grant to `anon` is gated on WA_WEBHOOK_DB_SECRET, which the browser
 * never holds. Both functions return void, so a caller who somehow held the
 * secret still cannot use them to enumerate the guest list.
 */
function webhookClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Record one inbound message. Resolution of the sender's number to a guest
 * happens inside the function, not here, so the phone comparison never leaves
 * the database.
 *
 * Redelivery is expected: Meta retries anything that did not return 200, and
 * the unique constraint on provider_message_id absorbs it.
 */
export async function recordInboundMessage(message: InboundMessage): Promise<void> {
  const db = webhookClient()
  const { error } = await db.rpc('wa_webhook_record_message', {
    p_secret: requireEnv('WA_WEBHOOK_DB_SECRET'),
    p_direction: 'inbound',
    p_wa_id: message.waId,
    p_provider_message_id: message.providerMessageId,
    p_type: message.type,
    p_body: message.body,
    p_sent_at: message.sentAt.toISOString(),
  })
  // The id is safe to surface; wa_id is a real person's phone number and is
  // deliberately absent from every log line in this file.
  if (error) throw new Error(`wa_webhook_record_message failed for ${message.providerMessageId}: ${error.message}`)
}

/** Record one delivery status callback against whichever table holds the id. */
export async function recordStatusUpdate(status: StatusUpdate): Promise<void> {
  const db = webhookClient()
  const { error } = await db.rpc('wa_webhook_record_status', {
    p_secret: requireEnv('WA_WEBHOOK_DB_SECRET'),
    p_provider_message_id: status.providerMessageId,
    p_status: status.status,
    p_status_at: status.statusAt.toISOString(),
    p_error_code: status.errorCode,
    p_error_title: status.errorTitle,
  })
  if (error) throw new Error(`wa_webhook_record_status failed for ${status.providerMessageId}: ${error.message}`)
}
