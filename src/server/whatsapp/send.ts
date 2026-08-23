import { randomUUID } from 'node:crypto'
import { requireEnv } from '../supabase/env'

/**
 * Outbound WhatsApp, behind the provider switch CLAUDE.md calls for.
 *
 * WA_PROVIDER decides. It defaults to `fake` in .env.example precisely so that
 * a local `npm run dev` cannot put a real message on a real guest's phone by
 * accident: reaching Meta has to be a deliberate change to the environment,
 * never the default.
 */

const GRAPH_VERSION = 'v21.0'

/** Meta's code for a free-form send outside the 24 hour service window. */
export const RE_ENGAGEMENT_ERROR = 131047

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; code: number | null }

/**
 * Send a plain text message.
 *
 * Only valid inside the service window: WhatsApp refuses free-form text to
 * someone who has not written to us in the last 24 hours. The caller checks
 * that first so the screen can explain itself, but Meta is the real authority
 * and 131047 is surfaced with its own wording rather than a generic failure.
 */
export async function sendText(to: string, body: string): Promise<SendResult> {
  const provider = process.env.WA_PROVIDER ?? 'fake'

  if (provider !== 'meta') {
    // Nothing leaves the machine. The body is deliberately not logged: it is
    // private correspondence with a guest.
    console.info(`[wa-send] provider=${provider}, not sending. ${body.length} chars queued.`)
    return { ok: true, providerMessageId: `fake.${randomUUID()}` }
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${requireEnv('WA_PHONE_NUMBER_ID')}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requireEnv('WA_ACCESS_TOKEN')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        // Link previews are off: an invitation link would otherwise unfurl
        // inside what is meant to read as a short personal reply.
        text: { preview_url: false, body },
      }),
    }
  )

  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; code?: number }
  } | null

  if (!response.ok || payload?.error) {
    const code = payload?.error?.code ?? null
    // Never include the response body wholesale: it echoes the recipient's
    // number back, and that is a guest's phone number in a log line.
    console.error(`[wa-send] Meta refused the send, http ${response.status}, code ${code ?? 'none'}`)
    return {
      ok: false,
      code,
      error:
        code === RE_ENGAGEMENT_ERROR
          ? 'WhatsApp refused this: the 24 hour reply window has closed. Only an approved template can reach them now.'
          : (payload?.error?.message ?? `WhatsApp rejected the send (HTTP ${response.status}).`),
    }
  }

  const providerMessageId = payload?.messages?.[0]?.id
  if (!providerMessageId) {
    return { ok: false, code: null, error: 'WhatsApp accepted the send but returned no message id.' }
  }

  return { ok: true, providerMessageId }
}
