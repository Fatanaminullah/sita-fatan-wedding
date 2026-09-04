import { describe, it, expect } from 'vitest'
import { buildConversations, replyState, type InboxMessage } from './inbox'

function msg(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 'm1',
    waId: '6281111111111',
    guestId: null,
    direction: 'inbound',
    body: 'halo',
    type: 'text',
    templateName: null,
    status: null,
    sentAt: new Date('2026-08-23T10:00:00+07:00'),
    ...overrides,
  }
}

describe('buildConversations', () => {
  it('groups by wa_id, not by guest, so an unresolved number still gets a thread', () => {
    const conversations = buildConversations([
      msg({ id: 'a', waId: '628111', sentAt: new Date('2026-08-23T10:00:00+07:00') }),
      msg({ id: 'b', waId: '628222', sentAt: new Date('2026-08-23T11:00:00+07:00') }),
      msg({ id: 'c', waId: '628111', sentAt: new Date('2026-08-23T12:00:00+07:00') }),
    ])
    expect(conversations).toHaveLength(2)
    expect(conversations.map((c) => c.waId)).toEqual(['628111', '628222'])
  })

  it('orders threads by their latest message, newest first', () => {
    const conversations = buildConversations([
      msg({ id: 'old', waId: '628aaa', sentAt: new Date('2026-08-20T10:00:00+07:00') }),
      msg({ id: 'new', waId: '628bbb', sentAt: new Date('2026-08-23T10:00:00+07:00') }),
    ])
    expect(conversations.map((c) => c.waId)).toEqual(['628bbb', '628aaa'])
  })

  it('orders messages inside a thread oldest first, the way a chat reads', () => {
    const [conversation] = buildConversations([
      msg({ id: 'second', sentAt: new Date('2026-08-23T11:00:00+07:00') }),
      msg({ id: 'first', sentAt: new Date('2026-08-23T10:00:00+07:00') }),
    ])
    expect(conversation.messages.map((m) => m.id)).toEqual(['first', 'second'])
  })

  it('reports the last message and the last inbound separately', () => {
    // The reply window keys off the last INBOUND message. Our own outbound
    // reply must not extend it, or the UI would promise a send that fails.
    const [conversation] = buildConversations([
      msg({ id: 'guest', direction: 'inbound', sentAt: new Date('2026-08-23T10:00:00+07:00') }),
      msg({ id: 'ours', direction: 'outbound', sentAt: new Date('2026-08-23T15:00:00+07:00') }),
    ])
    expect(conversation.lastMessage.id).toBe('ours')
    expect(conversation.lastInboundAt).toEqual(new Date('2026-08-23T10:00:00+07:00'))
  })

  it('leaves lastInboundAt null for a thread we started', () => {
    const [conversation] = buildConversations([msg({ direction: 'outbound' })])
    expect(conversation.lastInboundAt).toBeNull()
  })

  it('carries the guest id when any message in the thread resolved one', () => {
    // Resolution happens per message. A number that matched only after a
    // phone backfill leaves earlier messages unresolved.
    const [conversation] = buildConversations([
      msg({ id: 'before', guestId: null, sentAt: new Date('2026-08-23T10:00:00+07:00') }),
      msg({ id: 'after', guestId: 'guest-uuid', sentAt: new Date('2026-08-23T11:00:00+07:00') }),
    ])
    expect(conversation.guestId).toBe('guest-uuid')
  })

  it('returns nothing for no messages', () => {
    expect(buildConversations([])).toEqual([])
  })
})

describe('replyState', () => {
  const now = new Date('2026-08-23T12:00:00+07:00')

  it('is open inside 24 hours of the guest`s last message', () => {
    const state = replyState(new Date('2026-08-23T10:00:00+07:00'), now)
    expect(state.kind).toBe('open')
    if (state.kind === 'open') {
      expect(state.expiresAt).toEqual(new Date('2026-08-24T10:00:00+07:00'))
    }
  })

  it('is expired once 24 hours have passed', () => {
    const state = replyState(new Date('2026-08-22T10:00:00+07:00'), now)
    expect(state.kind).toBe('expired')
    if (state.kind === 'expired') {
      expect(state.expiredAt).toEqual(new Date('2026-08-23T10:00:00+07:00'))
    }
  })

  it('distinguishes never-written from expired, because they need different copy', () => {
    expect(replyState(null, now).kind).toBe('never_written')
  })

  it('shuts exactly on the boundary, not a moment after', () => {
    const lastInbound = new Date('2026-08-22T12:00:00+07:00')
    expect(replyState(lastInbound, new Date('2026-08-23T11:59:59+07:00')).kind).toBe('open')
    expect(replyState(lastInbound, new Date('2026-08-23T12:00:00+07:00')).kind).toBe('expired')
  })
})
