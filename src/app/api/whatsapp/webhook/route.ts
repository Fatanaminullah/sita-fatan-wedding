import { after } from 'next/server'
import { parseWebhookPayload, verifySignature } from '@/domain/whatsapp'
import { recordInboundMessage, recordStatusUpdate } from '@/server/repositories/wa-messages-repository'
import { requireEnv } from '@/server/supabase/env'

/**
 * Meta Cloud API webhook.
 *
 * This endpoint is the only way a guest's reply is ever seen. A number
 * registered to Cloud API cannot be opened in WhatsApp Messenger or the
 * WhatsApp Business app, and Meta Business Suite Inbox does not cover Cloud
 * API numbers. There is no inbox anywhere else. Every message this route drops
 * is a message nobody will ever read.
 *
 * Callback URL: https://staging.sitafatan.wedding/api/whatsapp/webhook
 */

// node:crypto, used by verifySignature, is unavailable on the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Verification handshake. Meta calls this once when the callback URL is saved
 * in the dashboard, and echoing hub.challenge is what activates it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode !== 'subscribe' || token !== requireEnv('WA_VERIFY_TOKEN') || !challenge) {
    // 403 rather than 404: the route exists, the caller failed to prove it is
    // Meta. Nothing about which of the three checks failed is disclosed.
    return new Response('Forbidden', { status: 403 })
  }

  // Meta expects the raw challenge as the body, not JSON.
  return new Response(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
}

/**
 * Event delivery: inbound messages and delivery status updates.
 *
 * Every path that is not a signature failure answers 200. Meta retries any
 * non-200 and disables an endpoint that keeps failing, so a payload we cannot
 * use must be acknowledged and dropped, never rejected. A retry would deliver
 * the same unusable payload again, forever.
 */
export async function POST(request: Request) {
  // The signature covers the exact bytes Meta sent. Parsing first and
  // re-serializing would change them and every signature would fail.
  const rawBody = await request.text()

  const signature = request.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature, requireEnv('WA_APP_SECRET'))) {
    // The one deliberate non-200. This endpoint is public and an unsigned
    // payload is the expected attack, not a delivery worth retrying.
    return new Response('Invalid signature', { status: 403 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.warn('[wa-webhook] signed payload was not JSON, acknowledged and dropped')
    return acknowledge()
  }

  const { messages, statuses } = parseWebhookPayload(payload)

  // Acknowledge before writing. Meta's delivery window is short and a slow
  // 200 counts against the endpoint the same way an error does.
  after(async () => {
    for (const message of messages) {
      try {
        await recordInboundMessage(message)
      } catch (error) {
        // Logged, not rethrown: one bad row must not cost the rest of the
        // batch, and the response has already gone out regardless.
        console.error('[wa-webhook] failed to record inbound message', error)
      }
    }
    for (const status of statuses) {
      try {
        await recordStatusUpdate(status)
      } catch (error) {
        console.error('[wa-webhook] failed to record status update', error)
      }
    }
  })

  // Counts only. wa_id is a guest's phone number and message bodies are
  // private correspondence; neither belongs in a log.
  console.info(`[wa-webhook] accepted ${messages.length} message(s), ${statuses.length} status(es)`)
  return acknowledge()
}

function acknowledge() {
  return new Response(null, { status: 200 })
}
