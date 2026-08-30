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
  | { type: 'body'; parameters: Array<{ type: 'text'; text: string }> }
  | { type: 'header'; parameters: Array<{ type: 'image'; image: { link: string } }> }
  | {
      type: 'button'
      sub_type: 'url'
      index: string
      parameters: Array<{ type: 'text'; text: string }>
    }

export type TemplateSpec = {
  /** Body variables in order: {{1}}, {{2}}, ... */
  bodyParams: string[]
  /**
   * The URL button's own {{1}}. Meta appends it to the base registered with
   * the template, so this carries ONLY the trailing part, never a whole URL.
   */
  buttonParam?: string | null
  /** A publicly reachable image for a template with an image header. */
  headerImageUrl?: string | null
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

  if (spec.bodyParams.length > 0) {
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

  return components
}

/**
 * A slug is the whole of what the button variable may carry.
 *
 * Meta appends it to the registered base, so passing a full URL produces
 * `https://www.sitafatan.wedding/to/https://...`, and passing a path with a
 * slash silently changes where the guest lands. Both look fine in the request.
 */
export function isValidButtonParam(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value)
}
