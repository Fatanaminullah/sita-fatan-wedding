import { describe, expect, it } from 'vitest'
import {
  NO,
  YES,
  eventsPayload,
  handleReply,
  isComplete,
  isStranded,
  parseReply,
  paxPayload,
  type ChatGuest,
} from './conversation'

function guest(over: Partial<ChatGuest> = {}): ChatGuest {
  return {
    name: 'Test Guest',
    pax: 2,
    language: 'en',
    invitedAkad: false,
    invitedResepsi: true,
    akadRsvp: null,
    resepsiRsvp: 'pending',
    akadPax: null,
    resepsiPax: null,
    awaiting: null,
    invitationSent: true,
    ...over,
  }
}

describe('parseReply', () => {
  it('reads yes and no', () => {
    expect(parseReply(YES)).toEqual({ kind: 'yes' })
    expect(parseReply(NO)).toEqual({ kind: 'no' })
  })

  it('reads a headcount', () => {
    expect(parseReply(paxPayload(3))).toEqual({ kind: 'pax', pax: 3 })
  })

  it('reads one event and both', () => {
    expect(parseReply(eventsPayload(['akad']))).toEqual({ kind: 'events', events: ['akad'] })
    expect(parseReply(eventsPayload(['akad', 'resepsi']))).toEqual({
      kind: 'events',
      events: ['akad', 'resepsi'],
    })
  })

  it('treats free text and nothing as unknown', () => {
    expect(parseReply('iya hadir').kind).toBe('unknown')
    expect(parseReply(null).kind).toBe('unknown')
    expect(parseReply('').kind).toBe('unknown')
  })

  it('ignores case, since a payload is a string on the wire', () => {
    expect(parseReply('rsvp_yes')).toEqual({ kind: 'yes' })
  })
})

describe('handleReply', () => {
  describe('declining', () => {
    it('records a decline against every invited event', () => {
      const action = handleReply(
        guest({ invitedAkad: true, akadRsvp: 'pending' }),
        { kind: 'no' }
      )
      expect(action).toMatchObject({ kind: 'record', attending: false, awaiting: null })
      if (action.kind === 'record') expect(action.events.sort()).toEqual(['akad', 'resepsi'])
    })

    it('records no headcount with a decline', () => {
      const action = handleReply(guest(), { kind: 'no' })
      if (action.kind === 'record') expect(action.pax).toBeNull()
    })
  })

  describe('accepting', () => {
    it('asks which events when they are invited to both', () => {
      const action = handleReply(guest({ invitedAkad: true, akadRsvp: 'pending' }), { kind: 'yes' })
      expect(action.kind).toBe('say')
      if (action.kind === 'say') expect(action.reply.type).toBe('buttons')
    })

    it('asks the headcount when only one event is involved', () => {
      const action = handleReply(guest({ pax: 4 }), { kind: 'yes' })
      expect(action.kind).toBe('say')
      if (action.kind === 'say') expect(action.reply.type).toBe('list')
    })

    // One event, one person: every remaining question has a single answer.
    it('asks nothing at all of a single guest at a single event', () => {
      const action = handleReply(guest({ pax: 1 }), { kind: 'yes' })
      expect(action).toMatchObject({ kind: 'record', attending: true, pax: 1, awaiting: null })
    })
  })

  describe('the headcount never exceeds the invitation', () => {
    it('offers only as many rows as they were invited for', () => {
      const action = handleReply(guest({ pax: 2 }), { kind: 'yes' })
      if (action.kind === 'say' && action.reply.type === 'list') {
        expect(action.reply.rows).toHaveLength(2)
        expect(action.reply.rows.map((r) => r.id)).toEqual([paxPayload(1), paxPayload(2)])
      }
    })

    // A payload is a string on the wire. A tap can only come from a list we
    // sent, but nothing about the transport guarantees that.
    it('clamps a headcount larger than the invitation', () => {
      const action = handleReply(guest({ pax: 2, resepsiRsvp: 'attending' }), {
        kind: 'pax',
        pax: 9,
      })
      if (action.kind === 'record') expect(action.pax).toBe(2)
    })

    it('caps the list at ten rows, whatever the data says', () => {
      const action = handleReply(guest({ pax: 40 }), { kind: 'yes' })
      if (action.kind === 'say' && action.reply.type === 'list') {
        expect(action.reply.rows).toHaveLength(10)
      }
    })
  })

  describe('choosing events', () => {
    const both = () => guest({ invitedAkad: true, akadRsvp: 'pending' })

    it('records the chosen event and asks the headcount', () => {
      const action = handleReply(both(), { kind: 'events', events: ['akad'] })
      expect(action).toMatchObject({ kind: 'record', attending: true, pax: null, awaiting: 'pax' })
      if (action.kind === 'record') expect(action.events).toEqual(['akad'])
    })

    it('records both when they choose both', () => {
      const action = handleReply(both(), { kind: 'events', events: ['akad', 'resepsi'] })
      if (action.kind === 'record') expect(action.events.sort()).toEqual(['akad', 'resepsi'])
    })

    it('ignores an event they were never invited to', () => {
      const action = handleReply(guest(), { kind: 'events', events: ['akad'] })
      // Invited to the Resepsi only, so an Akad choice is not theirs to make.
      expect(action.kind).toBe('say')
    })

    it('finishes immediately for a single guest', () => {
      const action = handleReply(
        guest({ invitedAkad: true, akadRsvp: 'pending', pax: 1 }),
        { kind: 'events', events: ['akad'] }
      )
      expect(action).toMatchObject({ kind: 'record', pax: 1, awaiting: null })
    })
  })

  describe('free text', () => {
    // Most guests type rather than tap, and reading "tidak bisa hadir" as a
    // yes is how somebody gets recorded as attending when they said the
    // opposite.
    it('never acts on it', () => {
      const action = handleReply(guest(), { kind: 'unknown' })
      expect(action.kind).not.toBe('record')
    })

    it('re-asks the outstanding question rather than starting over', () => {
      const action = handleReply(guest({ pax: 3, awaiting: 'pax' }), { kind: 'unknown' })
      if (action.kind === 'say') expect(action.reply.type).toBe('list')
    })

    it('offers the buttons again when nothing is outstanding', () => {
      const action = handleReply(guest(), { kind: 'unknown' })
      if (action.kind === 'say') expect(action.reply.type).toBe('buttons')
    })

    // A guest who has finished and then writes a sentence is asking a real
    // question, not filling in a form.
    it('hands a finished guest to a person', () => {
      const action = handleReply(
        guest({ resepsiRsvp: 'attending', resepsiPax: 2 }),
        { kind: 'unknown' }
      )
      expect(action.kind).toBe('handover')
    })
  })

  it('hands over anyone invited to nothing', () => {
    const stranger = guest({ invitedAkad: false, invitedResepsi: false, resepsiRsvp: null })
    expect(handleReply(stranger, { kind: 'yes' }).kind).toBe('handover')
  })
})

describe('isComplete', () => {
  it('is false while anything is pending', () => {
    expect(isComplete(guest())).toBe(false)
  })

  it('is true once a single event is answered with a headcount', () => {
    expect(isComplete(guest({ resepsiRsvp: 'attending', resepsiPax: 2 }))).toBe(true)
  })

  it('is true for a decline, which needs no headcount', () => {
    expect(isComplete(guest({ resepsiRsvp: 'not_attending' }))).toBe(true)
  })

  // The state that broke pure derivation: both attending with a headcount is
  // genuinely finished, and is why the outstanding question is recorded.
  it('is true when both events are answered', () => {
    expect(
      isComplete(
        guest({
          invitedAkad: true,
          akadRsvp: 'attending',
          akadPax: 2,
          resepsiRsvp: 'attending',
          resepsiPax: 2,
        })
      )
    ).toBe(true)
  })

  it('is false when one of two events is still pending', () => {
    expect(
      isComplete(guest({ invitedAkad: true, akadRsvp: 'pending', resepsiRsvp: 'attending', resepsiPax: 2 }))
    ).toBe(false)
  })

  it('is false for an acceptance with no headcount', () => {
    expect(isComplete(guest({ resepsiRsvp: 'attending', resepsiPax: null }))).toBe(false)
  })
})

describe('isStranded', () => {
  // The window closes 24 hours after a guest's last message, so a conversation
  // can simply stop. Coming, with nobody knowing how many places to lay.
  it('catches a yes with no headcount', () => {
    expect(isStranded(guest({ resepsiRsvp: 'attending', resepsiPax: null }))).toBe(true)
  })

  it('is false once the headcount arrives', () => {
    expect(isStranded(guest({ resepsiRsvp: 'attending', resepsiPax: 2 }))).toBe(false)
  })

  it('is false for someone who never started', () => {
    expect(isStranded(guest())).toBe(false)
  })

  it('is false for a decline', () => {
    expect(isStranded(guest({ resepsiRsvp: 'not_attending' }))).toBe(false)
  })
})

describe('the conversation only runs with somebody we have invited', () => {
  // The chat is the invitation's reply channel. Running the form with a guest
  // who has not been sent one asks them to answer a question nobody put to
  // them, and records them as attending an event they have not been told
  // about. It happened: a guest wrote to the number between the test message
  // and her batch, and answered a wedding invitation she had not received.
  it('hands over when no invitation has gone out yet', () => {
    const notYet = guest({ invitationSent: false })
    expect(handleReply(notYet, { kind: 'yes' }).kind).toBe('handover')
    expect(handleReply(notYet, { kind: 'unknown' }).kind).toBe('handover')
    expect(handleReply(notYet, { kind: 'events', events: ['resepsi'] }).kind).toBe('handover')
  })

  it('runs normally once it has', () => {
    expect(handleReply(guest({ invitationSent: true }), { kind: 'yes' }).kind).not.toBe('handover')
  })
})

describe('what a message leaves outstanding', () => {
  /*
   * The action says what it is waiting for. It used to be guessed from the
   * shape of the reply, and the guess was wrong in exactly one place: the
   * nudge and the events question are both button messages, so typing
   * anything at all recorded "waiting for events".
   *
   * The consequence was not cosmetic. Type twice and the second reply was
   * "Which will you come to?", asked of a guest who had never said they were
   * coming, and a tap on it recorded them as attending.
   */
  it('leaves nothing outstanding after a nudge', () => {
    const action = handleReply(guest(), { kind: 'unknown' })
    expect(action.kind).toBe('say')
    if (action.kind === 'say') expect(action.awaiting).toBeNull()
  })

  it('nudges again rather than advancing, however many times they type', () => {
    const first = handleReply(guest(), { kind: 'unknown' })
    if (first.kind !== 'say') throw new Error('expected a nudge')
    const second = handleReply(guest({ awaiting: first.awaiting }), { kind: 'unknown' })
    if (second.kind !== 'say') throw new Error('expected a nudge')
    expect(second.reply).toEqual(first.reply)
  })

  it('waits for the events answer once it has actually asked for one', () => {
    const both = guest({ invitedAkad: true, akadRsvp: 'pending' })
    const action = handleReply(both, { kind: 'yes' })
    expect(action.kind).toBe('say')
    if (action.kind === 'say') expect(action.awaiting).toBe('events')
  })

  it('waits for the headcount once it has asked for one', () => {
    const action = handleReply(guest({ pax: 3 }), { kind: 'yes' })
    expect(action.kind).toBe('say')
    if (action.kind === 'say') expect(action.awaiting).toBe('pax')
  })
})

describe('the closing word', () => {
  // The guest has just done what was asked of them. Confirming the number
  // without thanking them reads as a receipt rather than a reply.
  it('thanks them, in both languages', () => {
    const done = handleReply(guest({ pax: 2, resepsiRsvp: 'attending' }), { kind: 'pax', pax: 2 })
    if (done.kind !== 'record' || done.reply.type !== 'text') throw new Error('expected a text')
    expect(done.reply.body).toMatch(/thank you/i)

    const id = handleReply(
      guest({ pax: 2, language: 'id', resepsiRsvp: 'attending' }),
      { kind: 'pax', pax: 2 }
    )
    if (id.kind !== 'record' || id.reply.type !== 'text') throw new Error('expected a text')
    expect(id.reply.body).toMatch(/terima kasih/i)
  })
})
