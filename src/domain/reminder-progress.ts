/**
 * Where the guests the reminder reached have got to.
 *
 * The reminder is the message with the question in it, so after it goes out a
 * guest is in exactly one of four places: answered, said nothing at all, or
 * started answering in the chat and stopped at one of its two follow-up
 * questions ("which event?", "how many?").
 *
 * The answer on file decides, not the chat's own bookmark. The chat can still
 * be waiting for a number that somebody since entered by hand, and that guest
 * is answered.
 */

export type ReminderGuestEvent = {
  event: 'akad' | 'resepsi'
  inviteStatus: 'confirmed' | 'waitlisted'
  rsvpStatus: 'pending' | 'attending' | 'not_attending'
  paxConfirmed: number | null
}

export type ReminderGuest = {
  id: string
  name: string
  inviterKey: string
  /** The reminder send's last status, or null when none was sent. */
  reminderStatus: string | null
  /** Which follow-up question the chat last asked and is waiting on. */
  chatAwaiting: 'events' | 'pax' | null
  events: ReminderGuestEvent[]
}

export type StuckGuest = { id: string; name: string; inviterKey: string }

export type ReminderProgress = {
  reminded: number
  answered: number
  silent: number
  /** Of the silent, how many WhatsApp reported as read. */
  silentRead: number
  stuckOnEvents: StuckGuest[]
  stuckOnPax: StuckGuest[]
}

const REACHED = new Set(['sent', 'delivered', 'read'])

export function afterReminder(guests: ReminderGuest[]): ReminderProgress {
  const result: ReminderProgress = {
    reminded: 0,
    answered: 0,
    silent: 0,
    silentRead: 0,
    stuckOnEvents: [],
    stuckOnPax: [],
  }

  for (const guest of guests) {
    if (!guest.reminderStatus || !REACHED.has(guest.reminderStatus)) continue
    const invited = guest.events.filter((e) => e.inviteStatus === 'confirmed')
    if (invited.length === 0) continue
    result.reminded += 1

    const who = { id: guest.id, name: guest.name, inviterKey: guest.inviterKey }
    const comingNoCount = invited.some((e) => e.rsvpStatus === 'attending' && e.paxConfirmed === null)
    const allPending = invited.every((e) => e.rsvpStatus === 'pending')
    const complete = invited.every((e) => e.rsvpStatus !== 'pending') && !comingNoCount

    if (complete) result.answered += 1
    else if (comingNoCount || (allPending && guest.chatAwaiting === 'pax')) result.stuckOnPax.push(who)
    else if (allPending && guest.chatAwaiting === 'events') result.stuckOnEvents.push(who)
    // Silent, and also the rare guest with one event answered and the other
    // still pending (an answer by hand for one event): still owed an answer.
    else {
      result.silent += 1
      if (guest.reminderStatus === 'read') result.silentRead += 1
    }
  }

  const byName = (a: StuckGuest, b: StuckGuest) => a.name.localeCompare(b.name)
  result.stuckOnEvents.sort(byName)
  result.stuckOnPax.sort(byName)
  return result
}
