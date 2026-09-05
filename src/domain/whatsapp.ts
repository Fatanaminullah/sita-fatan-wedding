import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Meta Cloud API webhook parsing and the service-window rule.
 *
 * Pure by the folder contract: `node:crypto` is the standard library, not a
 * framework, and nothing here touches IO. The route hands the raw body in and
 * gets plain data back.
 */

/**
 * A user-initiated service conversation stays open for 24 hours from the
 * guest's last message. Inside it, free-form text sends with no template and
 * no approval, and Meta does not bill it. Outside it, only a template will
 * deliver, and a free-form attempt fails with error 131047.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

/** The delivery statuses `wa_messages.status` accepts. */
const STORABLE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const
export type DeliveryStatus = (typeof STORABLE_STATUSES)[number]

export type InboundMessage = {
  /** The guest's number as Meta sends it: digits, no plus. */
  waId: string
  providerMessageId: string
  type: string
  /** Null for types with nothing readable to show (image, audio, sticker). */
  body: string | null
  /**
   * The id behind a tapped button or list row, not the words on it. Null for
   * anything a guest typed, which is what keeps typed text from counting as a
   * tap.
   */
  replyId: string | null
  sentAt: Date
  /** The WhatsApp display name, when Meta included a contacts block. */
  profileName: string | null
}

export type StatusUpdate = {
  providerMessageId: string
  status: DeliveryStatus
  statusAt: Date
  errorCode: number | null
  errorTitle: string | null
}

/**
 * Verify `X-Hub-Signature-256` against the app secret.
 *
 * The endpoint is public, so an unsigned or wrongly signed payload is the
 * expected attack, not an edge case. Every failure path returns false rather
 * than throwing: `timingSafeEqual` throws on a length mismatch, which a
 * hand-crafted header can trigger at will.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string
): boolean {
  // An empty secret would otherwise make every forged signature verifiable,
  // since both sides would be an HMAC under the same empty key.
  if (!appSecret) return false
  if (!header || !header.startsWith('sha256=')) return false

  const provided = header.slice('sha256='.length)
  // Buffer.from silently drops non-hex characters, so a garbage header
  // becomes a short buffer and fails the length check below.
  if (!/^[0-9a-f]+$/i.test(provided)) return false

  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  const actual = Buffer.from(provided, 'hex')
  if (actual.length !== expected.length) return false

  return timingSafeEqual(actual, expected)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Meta sends unix seconds, as a string. */
function asTimestamp(value: unknown): Date | null {
  const seconds = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(seconds)) return null
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The readable text of a message, by type.
 *
 * A type with nothing to extract returns null and the message is still kept:
 * the row is what proves a guest wrote, and dropping it is the exact failure
 * this whole feature exists to prevent.
 */
/**
 * The id behind a tap, as opposed to the words on the button.
 *
 * Three shapes carry it, and only one of them is visible while testing with a
 * template, so the other two are easy to forget until a live guest taps
 * something and nothing happens:
 *
 *   button.payload            a quick reply on an approved template
 *   interactive.button_reply  a button we sent inside the open window
 *   interactive.list_reply    a row of a list we sent inside the window
 *
 * The words are no use for this: they are translated, and a guest typing the
 * same words by hand must never count as a tap.
 */
function extractReplyId(message: Record<string, unknown>, type: string): string | null {
  if (type === 'button') return asString(asRecord(message.button)?.payload)
  if (type === 'interactive') {
    const interactive = asRecord(message.interactive)
    return (
      asString(asRecord(interactive?.button_reply)?.id) ??
      asString(asRecord(interactive?.list_reply)?.id)
    )
  }
  return null
}

function extractBody(message: Record<string, unknown>, type: string): string | null {
  switch (type) {
    case 'text':
      return asString(asRecord(message.text)?.body)
    case 'button':
      return asString(asRecord(message.button)?.text)
    case 'interactive': {
      const interactive = asRecord(message.interactive)
      return (
        asString(asRecord(interactive?.button_reply)?.title) ??
        asString(asRecord(interactive?.list_reply)?.title)
      )
    }
    case 'reaction':
      return asString(asRecord(message.reaction)?.emoji)
    default:
      return null
  }
}

/**
 * Normalize one webhook POST body into messages and status updates.
 *
 * **Never throws.** Meta retries any non-200 and disables an endpoint that
 * keeps failing, so a parser that rejects an unfamiliar shape would take the
 * whole inbox down rather than skip one row. Anything unrecognized is dropped
 * silently and the rest of the batch survives.
 */
export function parseWebhookPayload(payload: unknown): {
  messages: InboundMessage[]
  statuses: StatusUpdate[]
} {
  const messages: InboundMessage[] = []
  const statuses: StatusUpdate[] = []

  for (const entry of asArray(asRecord(payload)?.entry)) {
    for (const change of asArray(asRecord(entry)?.changes)) {
      const value = asRecord(asRecord(change)?.value)
      if (!value) continue

      // Meta pairs one contacts block with the messages in the same change.
      const contact = asRecord(asArray(value.contacts)[0])
      const contactWaId = asString(contact?.wa_id)
      const profileName = asString(asRecord(contact?.profile)?.name)

      for (const raw of asArray(value.messages)) {
        const message = asRecord(raw)
        if (!message) continue

        const providerMessageId = asString(message.id)
        const type = asString(message.type)
        const sentAt = asTimestamp(message.timestamp)
        const waId = asString(message.from) ?? contactWaId
        if (!providerMessageId || !type || !sentAt || !waId) continue

        messages.push({
          waId,
          providerMessageId,
          type,
          body: extractBody(message, type),
          replyId: extractReplyId(message, type),
          sentAt,
          profileName,
        })
      }

      for (const raw of asArray(value.statuses)) {
        const status = asRecord(raw)
        if (!status) continue

        const providerMessageId = asString(status.id)
        const name = asString(status.status)
        const statusAt = asTimestamp(status.timestamp)
        if (!providerMessageId || !statusAt) continue
        // 'deleted' and anything else Meta adds later would violate the
        // column's CHECK constraint. Dropping it beats failing the insert.
        if (!name || !STORABLE_STATUSES.includes(name as DeliveryStatus)) continue

        const error = asRecord(asArray(status.errors)[0])
        const code = error?.code
        statuses.push({
          providerMessageId,
          status: name as DeliveryStatus,
          statusAt,
          errorCode: typeof code === 'number' ? code : null,
          errorTitle: asString(error?.title),
        })
      }
    }
  }

  return { messages, statuses }
}

/** When the free-form reply window shuts, given the guest's last message. */
export function serviceWindowExpiresAt(lastInboundAt: Date): Date {
  return new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS)
}

/**
 * Whether a free-form reply will deliver right now.
 *
 * A guest who has never written has no open window, so the answer is no. The
 * inbox uses this to disable the reply box with the reason on it, rather than
 * letting a send fail at Meta with 131047 after the fact.
 */
export function isWithinServiceWindow(lastInboundAt: Date | null, now: Date): boolean {
  if (!lastInboundAt) return false
  return now.getTime() < serviceWindowExpiresAt(lastInboundAt).getTime()
}

/* -------------------------------------------------------------- templates */

/**
 * Building an approved template's `components` payload.
 *
 * Pure, and tested, because of one trap that is invisible at a glance: **body
 * variables and button variables are numbered in separate namespaces.** A
 * template whose body reads "Halo {{1}}, mohon konfirmasi sebelum {{2}}" and
 * whose button URL is registered as `https://www.sitafatan.wedding/to/{{1}}`
 * has three variables, and the button's `{{1}}` is the slug, not the name.
 *
 * Passing the body's parameters to the button sends every guest the same
 * broken link, addressed to somebody else's name, and it looks perfectly
 * correct in the request. This function exists so that mistake has one place
 * to be made and a test that catches it.
 */

export type TemplateComponent =
  | {
      type: 'body'
      parameters: Array<{ type: 'text'; text: string; parameter_name?: string }>
    }
  | { type: 'header'; parameters: Array<{ type: 'image'; image: { link: string } }> }
  | {
      type: 'button'
      sub_type: 'url'
      index: string
      parameters: Array<{ type: 'text'; text: string }>
    }
  | {
      type: 'button'
      sub_type: 'quick_reply'
      index: string
      parameters: Array<{ type: 'payload'; payload: string }>
    }

export type TemplateSpec = {
  /**
   * Body variables in order, for a template written with {{1}}, {{2}}.
   * Ignored when `namedParams` is given.
   */
  bodyParams: string[]
  /**
   * Body variables by name, for a template written with {{name}}.
   *
   * Meta supports both and a template is one or the other. The real
   * `wedding_invitation_v1` is named — `{{name}}` and `{{rsvp_deadline}}` —
   * and sending positional parameters to it is rejected, so this is not a
   * stylistic choice.
   */
  namedParams?: Record<string, string> | null
  /**
   * The URL button's own {{1}}. Meta appends it to the base registered with
   * the template, so this carries ONLY the trailing part, never a whole URL.
   */
  buttonParam?: string | null
  /** A publicly reachable image for a template with an image header. */
  headerImageUrl?: string | null
  /**
   * Payloads for a template's quick-reply buttons, in the order they were
   * approved.
   *
   * A quick-reply button on a template carries NO payload of its own. Whatever
   * comes back when a guest taps it is whatever the sender attached here, and
   * attaching nothing means the reply arrives as the button's own words —
   * indistinguishable from a guest typing them, which is precisely what the
   * conversation refuses to act on. So without this, every tap on the reminder
   * would be ignored.
   */
  quickReplyPayloads?: string[] | null
}

export function buildTemplateComponents(spec: TemplateSpec): TemplateComponent[] {
  const components: TemplateComponent[] = []

  // Header first: Meta reads components positionally in places, and a header
  // after a body is the kind of thing that works until it does not.
  if (spec.headerImageUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: spec.headerImageUrl } }],
    })
  }

  const named = spec.namedParams ? Object.entries(spec.namedParams) : []

  if (named.length > 0) {
    components.push({
      type: 'body',
      parameters: named.map(([parameter_name, text]) => ({
        type: 'text',
        parameter_name,
        text,
      })),
    })
  } else if (spec.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: spec.bodyParams.map((text) => ({ type: 'text', text })),
    })
  }

  if (spec.buttonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      // Index is the button's position in the template, as a string. One
      // button means '0'.
      index: '0',
      parameters: [{ type: 'text', text: spec.buttonParam }],
    })
  }

  for (const [i, payload] of (spec.quickReplyPayloads ?? []).entries()) {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(i),
      parameters: [{ type: 'payload', payload }],
    })
  }

  return components
}

/**
 * What the URL button's variable may carry.
 *
 * Meta appends this to the base registered with the template, so it is a path
 * fragment and never a whole URL. How much of the path it carries depends on
 * where the template puts its `{{1}}`, and the real invitation registers
 * `https://www.sitafatan.wedding/{{1}}` — so the value is `to/<slug>`, not the
 * slug alone. An earlier version of this refused any slash and would have
 * rejected the only correct value.
 *
 * A full URL is still refused: it would produce `.../https://...` and look
 * perfectly fine in the request while sending every guest somewhere broken.
 */
/**
 * Whether Meta's own servers could fetch this URL.
 *
 * Every picture in a template — the invitation header, the QR on a ticket — is
 * sent as a link, and WhatsApp fetches it from its own infrastructure rather
 * than from us. A link that only resolves on the machine that sent it is
 * accepted by the send API, comes back with a real message id, and then fails
 * minutes later with "Media upload error" against every recipient at once.
 *
 * That is exactly what a local `npm run dev` produces: NEXT_PUBLIC_SITE_URL is
 * `http://localhost:3000`, so the header points at a laptop. Refusing it before
 * the wave runs is the difference between one error message and a whole batch
 * of failed sends that have already spent their marketing cap for the day.
 */
export function isFetchableByMeta(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  // Meta requires https for media links, so http is never merely a warning.
  if (parsed.protocol !== 'https:') return false

  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return false
  if (/^127\./.test(host)) return false
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false

  return true
}

export function isValidButtonParam(value: string): boolean {
  if (/^https?:/i.test(value)) return false
  if (value.startsWith('/') || value.includes('//')) return false
  return /^[a-z0-9/-]+$/.test(value) && value.length > 0
}

/* ------------------------------------------------------------- link opens */

/**
 * Whether a request for an invitation page came from a person.
 *
 * WhatsApp fetches every link it is sent, to build the preview card in the
 * chat. That fetch arrives seconds after the invitation goes out, from Meta's
 * infrastructure, and it looks exactly like the guest opening their invitation
 * on send day. Counting it would show near-perfect open rates within minutes
 * and make the one genuinely useful figure — opened but never answered —
 * meaningless.
 *
 * Deliberately errs toward calling something a bot. An open that is missed is
 * a smaller lie than an open that never happened.
 */
const BOT_MARKERS = [
  'whatsapp',
  'facebookexternalhit',
  'facebot',
  'telegrambot',
  'twitterbot',
  'slackbot',
  'discordbot',
  'linkedinbot',
  'skypeuripreview',
  'bot',
  'crawler',
  'spider',
  'preview',
  'headless',
  'curl',
  'wget',
  'python-requests',
  'axios',
  'go-http-client',
  'vercel',
  'lighthouse',
  'monitor',
]

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  // No user agent at all is not a browser a guest is holding.
  if (!userAgent) return true
  const ua = userAgent.toLowerCase()
  return BOT_MARKERS.some((marker) => ua.includes(marker))
}

/**
 * The text a template actually put on the guest's phone.
 *
 * The send API takes a template name and a bag of parameters, so nothing in
 * the send path ever holds the sentence the guest reads. That was fine while
 * wa_sends was the only record of a wave. It stopped being fine when the inbox
 * became a transcript: a thread showing the guest's answers with our questions
 * missing reads as though they replied to nothing.
 *
 * So the approved body is fetched from Meta and filled in here, from the same
 * parameters the send used. Approximate by nature: Meta applies its own
 * formatting, and a variable the caller did not supply is left as written
 * rather than blanked, because an unfilled `{{name}}` in the transcript is a
 * visible bug and an empty gap is not.
 */
export function renderTemplateBody(
  bodyText: string,
  params: { named?: Record<string, string> | null; positional?: string[] | null }
): string {
  const named = params.named ?? {}
  const positional = params.positional ?? []

  return bodyText.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key: string) => {
    if (Object.prototype.hasOwnProperty.call(named, key)) return named[key]
    // Meta numbers positional variables from 1, arrays from 0.
    const index = Number(key)
    if (Number.isInteger(index) && index >= 1 && index <= positional.length) {
      return positional[index - 1]
    }
    return whole
  })
}

/**
 * Meta's send failures, said the way an admin needs them.
 *
 * Meta's own text is written for developers and runs to a sentence; in a
 * table cell it spills into the next three columns. The codes an admin can
 * act on get a short line and, where there is one, the action. Anything else
 * keeps Meta's text, and the table truncates it with the full text on hover.
 */
export function describeSendFailure(raw: string | null | undefined): { short: string; action: string | null } | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (s.includes('healthy ecosystem') || s.includes('131049')) {
    return { short: 'Held back by Meta: marketing limit', action: 'Retry after a day, or wait for them to message first' }
  }
  if (s.includes('131047') || s.includes('re-engagement') || s.includes('24 hour')) {
    return { short: 'Reply window closed', action: 'Send a template, or wait for them to write' }
  }
  if (s.includes('131026') || s.includes('undeliverable') || s.includes('not a whatsapp')) {
    return { short: 'Number not on WhatsApp', action: 'Check the number' }
  }
  if (s.includes('130472') || s.includes('experiment')) {
    return { short: 'Number in a Meta experiment', action: 'Retry later' }
  }
  if (s.includes('131056') || s.includes('pair rate limit')) {
    return { short: 'Too many sends to this number', action: 'Retry later' }
  }
  if (s.includes('132') && s.includes('template')) {
    return { short: 'Template problem', action: 'Check the template in WhatsApp Manager' }
  }
  return { short: raw, action: null }
}
