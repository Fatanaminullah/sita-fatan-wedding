import { describe, it, expect } from 'vitest'
import { afterReminder, type ReminderGuest } from './reminder-progress'

function guest(over: Partial<ReminderGuest> = {}): ReminderGuest {
  return {
    id: 'g',
    name: 'Test Guest',
    inviterKey: 'Fatan',
    reminderStatus: 'delivered',
    chatAwaiting: null,
    events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending', paxConfirmed: null }],
    ...over,
  }
}

describe('after the reminder', () => {
  it('leaves out guests the reminder never reached', () => {
    const result = afterReminder([guest({ reminderStatus: null }), guest({ reminderStatus: 'failed' })])
    expect(result.reminded).toBe(0)
  })

  it('counts a guest who did nothing as silent, split by read receipt', () => {
    const result = afterReminder([
      guest({ id: 'a', reminderStatus: 'read' }),
      guest({ id: 'b', reminderStatus: 'delivered' }),
      guest({ id: 'c', reminderStatus: 'sent' }),
    ])
    expect(result).toMatchObject({ reminded: 3, silent: 3, silentRead: 1, answered: 0 })
  })

  it('names a guest who tapped yes and never picked an event', () => {
    const both = [
      { event: 'akad' as const, inviteStatus: 'confirmed' as const, rsvpStatus: 'pending' as const, paxConfirmed: null },
      { event: 'resepsi' as const, inviteStatus: 'confirmed' as const, rsvpStatus: 'pending' as const, paxConfirmed: null },
    ]
    const result = afterReminder([guest({ id: 'q1', chatAwaiting: 'events', events: both })])
    expect(result.silent).toBe(0)
    expect(result.stuckOnEvents.map((g) => g.id)).toEqual(['q1'])
  })

  it('names a guest coming with no headcount', () => {
    const result = afterReminder([
      guest({
        id: 'q2',
        chatAwaiting: 'pax',
        events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: null }],
      }),
    ])
    expect(result.stuckOnPax.map((g) => g.id)).toEqual(['q2'])
  })

  // One event and more than one seat: "yes" only asks how many, and records
  // nothing until a number is picked.
  it('names a guest asked how many who still has nothing on file', () => {
    const result = afterReminder([guest({ id: 'q2b', chatAwaiting: 'pax' })])
    expect(result.stuckOnPax.map((g) => g.id)).toEqual(['q2b'])
    expect(result.silent).toBe(0)
  })

  // The chat can still be waiting for a number that somebody since put on
  // file by hand. The answer on file wins.
  it('counts a guest as answered once the answer is on file, whatever the chat is waiting for', () => {
    const result = afterReminder([
      guest({
        id: 'done',
        chatAwaiting: 'pax',
        events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 }],
      }),
    ])
    expect(result).toMatchObject({ answered: 1, stuckOnPax: [] })
  })

  it('counts a decline as answered and ignores waitlisted events', () => {
    const result = afterReminder([
      guest({
        events: [
          { event: 'akad', inviteStatus: 'waitlisted', rsvpStatus: 'pending', paxConfirmed: null },
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending', paxConfirmed: null },
        ],
      }),
    ])
    expect(result).toMatchObject({ reminded: 1, answered: 1, silent: 0 })
  })

  it('adds up to the number reminded', () => {
    const result = afterReminder([
      guest({ id: '1' }),
      guest({ id: '2', chatAwaiting: 'events' }),
      guest({ id: '3', chatAwaiting: 'pax' }),
      guest({ id: '4', events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 }] }),
    ])
    expect(result.answered + result.silent + result.stuckOnEvents.length + result.stuckOnPax.length).toBe(
      result.reminded
    )
  })
})
