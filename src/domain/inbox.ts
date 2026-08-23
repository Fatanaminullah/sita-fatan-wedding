import { SERVICE_WINDOW_MS, serviceWindowExpiresAt } from './whatsapp'

/**
 * Turning a flat wa_messages list into threads, and deciding whether a
 * free-form reply will actually deliver.
 */

export type InboxMessage = {
  id: string
  /** The counterpart's number, digits only, as Meta sends it. */
  waId: string
  /** Null when the number matched no guest at the time it arrived. */
  guestId: string | null
  direction: 'inbound' | 'outbound'
  body: string | null
  type: string
  sentAt: Date
}

export type Conversation = {
  waId: string
  /** From any message in the thread that resolved one. */
  guestId: string | null
  /** Oldest first, the way a chat reads. */
  messages: InboxMessage[]
  lastMessage: InboxMessage
  /**
   * The guest's own last message, which is what the 24-hour reply window keys
   * off. Null for a thread we started. Deliberately not "last message": our
   * own reply must never appear to extend the window.
   */
  lastInboundAt: Date | null
}

/**
 * Group messages into threads, newest thread first.
 *
 * Grouped by wa_id rather than guest_id: a number matching no guest is still a
 * real person writing, and threading those under one "unknown" bucket would
 * merge strangers into a single conversation.
 */
export function buildConversations(messages: InboxMessage[]): Conversation[] {
  const byWaId = new Map<string, InboxMessage[]>()
  for (const message of messages) {
    const existing = byWaId.get(message.waId)
    if (existing) existing.push(message)
    else byWaId.set(message.waId, [message])
  }

  const conversations: Conversation[] = []
  for (const [waId, thread] of byWaId) {
    const ordered = [...thread].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
    const inbound = ordered.filter((m) => m.direction === 'inbound')

    conversations.push({
      waId,
      // Resolution happens per message, so a number that only matched after a
      // phone backfill leaves its earlier messages unresolved. Any hit counts.
      guestId: ordered.find((m) => m.guestId)?.guestId ?? null,
      messages: ordered,
      lastMessage: ordered[ordered.length - 1],
      lastInboundAt: inbound.length ? inbound[inbound.length - 1].sentAt : null,
    })
  }

  return conversations.sort(
    (a, b) => b.lastMessage.sentAt.getTime() - a.lastMessage.sentAt.getTime()
  )
}

/**
 * Whether the reply box should be usable, and why not when it should not.
 *
 * Three states rather than a boolean, because "they have never written to us"
 * and "their message aged out" need different copy. Telling someone the window
 * expired when no window ever opened is just confusing.
 *
 * Inside the window a free-form text message sends with no template and no
 * approval, and Meta does not bill it. Outside it, only a template delivers
 * and a free-form attempt fails with error 131047.
 */
export type ReplyState =
  | { kind: 'open'; expiresAt: Date }
  | { kind: 'expired'; expiredAt: Date }
  | { kind: 'never_written' }

export function replyState(lastInboundAt: Date | null, now: Date): ReplyState {
  if (!lastInboundAt) return { kind: 'never_written' }

  const expiresAt = serviceWindowExpiresAt(lastInboundAt)
  return now.getTime() < expiresAt.getTime()
    ? { kind: 'open', expiresAt }
    : { kind: 'expired', expiredAt: expiresAt }
}

export { SERVICE_WINDOW_MS }
