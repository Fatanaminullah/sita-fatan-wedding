import { randomUUID } from 'node:crypto'
import { buildTemplateComponents, isValidButtonParam, type TemplateSpec } from '@/domain/whatsapp'
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

/**
 * Meta's code for "this person has had too many marketing messages today".
 *
 * The cap is per recipient across ALL businesses, not per sender, so it says
 * nothing about the health of this account and nothing is wrong with the
 * number. The only remedy is to try that person again tomorrow, which is why
 * a wave collects these rather than treating them as failures.
 */
export const MARKETING_CAP_ERROR = 131049

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

export type TemplateSend = TemplateSpec & {
  /** The template's name as approved in Meta's console. */
  name: string
  /** Must match an approved language variant of that template exactly. */
  language: 'en' | 'id'
}

/**
 * Send an approved template.
 *
 * The only way to reach a guest who has not written to us: free-form text
 * needs an open 24 hour window, and before the invitation goes out nobody has
 * one. Every wave rides on this.
 *
 * The components payload is built in the domain, where the separate numbering
 * of body and button variables is tested. Do not assemble it here.
 */
export async function sendTemplate(to: string, spec: TemplateSend): Promise<SendResult> {
  // Refused before the request, not after: a bad button parameter still
  // returns 200 from Meta and delivers a broken link to a real guest.
  if (spec.buttonParam && !isValidButtonParam(spec.buttonParam)) {
    return {
      ok: false,
      code: null,
      error: `"${spec.buttonParam}" is not a valid link parameter. It carries only the slug, never a full URL.`,
    }
  }

  const provider = process.env.WA_PROVIDER ?? 'fake'

  if (provider !== 'meta') {
    // The guest's name is a body parameter, so parameters are not logged.
    console.info(
      `[wa-send] provider=${provider}, not sending template ${spec.name}/${spec.language}.`
    )
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
        type: 'template',
        template: {
          name: spec.name,
          language: { code: spec.language },
          components: buildTemplateComponents(spec),
        },
      }),
    }
  )

  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; code?: number }
  } | null

  if (!response.ok || payload?.error) {
    const code = payload?.error?.code ?? null
    // Never log the response body: it echoes the recipient's number back.
    console.error(
      `[wa-send] Meta refused template ${spec.name}, http ${response.status}, code ${code ?? 'none'}`
    )
    return {
      ok: false,
      code,
      error:
        code === MARKETING_CAP_ERROR
          ? 'They have already had their limit of marketing messages today, from anyone. Nothing is wrong with the number; try them again tomorrow.'
          : (payload?.error?.message ?? `WhatsApp rejected the template (HTTP ${response.status}).`),
    }
  }

  const providerMessageId = payload?.messages?.[0]?.id
  if (!providerMessageId) {
    return { ok: false, code: null, error: 'WhatsApp accepted the send but returned no message id.' }
  }

  return { ok: true, providerMessageId }
}
