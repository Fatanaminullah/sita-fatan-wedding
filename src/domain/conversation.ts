/**
 * Answering the invitation inside WhatsApp.
 *
 * A guest taps a button in the reminder, which opens a 24 hour window, and
 * everything after that is free-form: no template, no approval, no cost. The
 * whole conversation lives in that window.
 *
 * The order is: yes or no, then which events (only if invited to both), then
 * how many. Events before headcount, because a guest coming to one event and
 * not the other has a different number in mind for each, and asking the number
 * first invites them to answer a question they cannot yet answer.
 */

export type EventKey = 'akad' | 'resepsi'
export type Language = 'en' | 'id'

/** Everything the chat knows about whoever just wrote in. */
export type ChatGuest = {
  name: string
  /** The ceiling on any headcount. Never exceeded, by any route. */
  pax: number
  language: Language
  invitedAkad: boolean
  invitedResepsi: boolean
  akadRsvp: 'pending' | 'attending' | 'not_attending' | null
  resepsiRsvp: 'pending' | 'attending' | 'not_attending' | null
  akadPax: number | null
  resepsiPax: number | null
  /** The question already asked and not yet answered. */
  awaiting: 'events' | 'pax' | null
  /**
   * Their invitation has actually gone out, by WhatsApp or on paper.
   *
   * The chat is the invitation's reply channel, so it has no business running
   * before the invitation exists. wave-actions already refuses to remind a
   * guest who was never invited, for the same reason: an answer to a question
   * nobody asked is not an answer.
   */
  invitationSent: boolean
}

/* ------------------------------------------------------------- payloads */

export const YES = 'RSVP_YES'
export const NO = 'RSVP_NO'

export function paxPayload(n: number): string {
  return `RSVP_PAX_${n}`
}

export function eventsPayload(events: EventKey[]): string {
  return `RSVP_EVT_${[...events].sort().join('_')}`
}

export type ParsedReply =
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'pax'; pax: number }
  | { kind: 'events'; events: EventKey[] }
  | { kind: 'unknown' }

/**
 * Read a tap.
 *
 * Three different shapes carry a tap depending on where it came from, and they
 * are easy to miss because only one of them is ever visible while testing:
 *
 *   button.payload            a quick reply on an approved template
 *   interactive.button_reply  a button we sent inside the open window
 *   interactive.list_reply    a row of a list we sent inside the window
 *
 * The caller pulls whichever exists; this only has to understand the string.
 */
export function parseReply(replyId: string | null | undefined): ParsedReply {
  if (!replyId) return { kind: 'unknown' }
  const id = replyId.trim().toUpperCase()

  if (id === YES) return { kind: 'yes' }
  if (id === NO) return { kind: 'no' }

  const pax = /^RSVP_PAX_(\d+)$/.exec(id)
  if (pax) {
    const n = Number(pax[1])
    return Number.isInteger(n) && n > 0 ? { kind: 'pax', pax: n } : { kind: 'unknown' }
  }

  const events = /^RSVP_EVT_([A-Z_]+)$/.exec(id)
  if (events) {
    const parts = events[1].split('_').filter(Boolean)
    const known = parts
      .map((p) => (p === 'AKAD' ? 'akad' : p === 'RESEPSI' ? 'resepsi' : null))
      .filter((e): e is EventKey => e !== null)
    return known.length > 0 ? { kind: 'events', events: known } : { kind: 'unknown' }
  }

  return { kind: 'unknown' }
}

/* ------------------------------------------------------------ the reply */

export type ChatAction =
  /** Write these events as attending or declining, then ask what comes next. */
  | {
      kind: 'record'
      events: EventKey[]
      attending: boolean
      pax: number | null
      awaiting: 'events' | 'pax' | null
      reply: ChatMessage
    }
  /**
   * Say something and write nothing.
   *
   * `awaiting` is what this message leaves outstanding, and it is stated here
   * rather than inferred by the caller from the message's shape. That
   * inference had exactly one wrong case, and it was not cosmetic: the nudge
   * and the events question are both button messages, so any typed word
   * recorded "waiting for events", and the next typed word was answered with
   * "Which will you come to?" — asked of a guest who had never said they were
   * coming, and a tap on it recorded them as attending.
   */
  | { kind: 'say'; reply: ChatMessage; awaiting: 'events' | 'pax' | null }
  /** Not ours to answer. A person reads it in the inbox. */
  | { kind: 'handover' }

export type ChatMessage =
  | { type: 'text'; body: string }
  | { type: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }
  | {
      type: 'list'
      body: string
      button: string
      rows: Array<{ id: string; title: string; description?: string }>
    }

const COPY = {
  en: {
    ask: (name: string) => `Hello ${name}. Will you be joining us?`,
    yes: 'Yes, I will attend',
    no: 'Sorry, I cannot',
    whichEvents: 'Lovely. Which will you come to?',
    akadOnly: 'The Akad',
    resepsiOnly: 'The Resepsi',
    both: 'Both',
    howMany: (max: number) => `And how many of you? Your invitation is for ${max}.`,
    pick: 'Choose',
    person: (n: number) => (n === 1 ? '1 person' : `${n} people`),
    done: (n: number) =>
      n === 1
        ? 'Thank you! We have you down, and we cannot wait.'
        : `Thank you! We have ${n} of you down, and we cannot wait.`,
    declined: 'Thank you for letting us know. You will be missed.',
    alreadyDone: 'We already have your reply. If anything changes, just tell us here.',
    // Free text is never acted on. It is answered with the buttons, because
    // most guests will type "iya hadir" rather than tap anything.
    nudge: 'Thank you! Please tap one of these so we record it correctly:',
  },
  id: {
    ask: (name: string) => `Halo ${name}. Apakah Anda berkenan hadir?`,
    yes: 'Ya, saya hadir',
    no: 'Maaf, berhalangan',
    whichEvents: 'Terima kasih. Acara mana yang akan dihadiri?',
    akadOnly: 'Akad',
    resepsiOnly: 'Resepsi',
    both: 'Keduanya',
    howMany: (max: number) => `Berapa orang yang hadir? Undangan Anda untuk ${max} orang.`,
    pick: 'Pilih',
    person: (n: number) => `${n} orang`,
    done: (n: number) => `Terima kasih. Kami catat ${n} orang. Sampai jumpa!`,
    declined: 'Terima kasih atas kabarnya. Kami akan merindukan Anda.',
    alreadyDone: 'Jawaban Anda sudah kami terima. Jika ada perubahan, kabari saja di sini.',
    nudge: 'Terima kasih! Mohon ketuk salah satu tombol berikut agar tercatat:',
  },
} as const

function invitedEvents(guest: ChatGuest): EventKey[] {
  const events: EventKey[] = []
  if (guest.invitedAkad) events.push('akad')
  if (guest.invitedResepsi) events.push('resepsi')
  return events
}

/** The opening question, and the same message the reminder template carries. */
export function openingMessage(guest: ChatGuest): ChatMessage {
  const t = COPY[guest.language]
  return {
    type: 'buttons',
    body: t.ask(guest.name),
    buttons: [
      { id: YES, title: t.yes },
      { id: NO, title: t.no },
    ],
  }
}

function askEvents(guest: ChatGuest): ChatMessage {
  const t = COPY[guest.language]
  return {
    type: 'buttons',
    body: t.whichEvents,
    buttons: [
      { id: eventsPayload(['akad']), title: t.akadOnly },
      { id: eventsPayload(['resepsi']), title: t.resepsiOnly },
      { id: eventsPayload(['akad', 'resepsi']), title: t.both },
    ],
  }
}

/**
 * The headcount, never offering more than the invitation.
 *
 * WhatsApp lists cap at ten rows, and a guest invited for more than ten is not
 * a thing this wedding has, but the slice is there so a data change can never
 * produce a message Meta rejects.
 */
function askPax(guest: ChatGuest): ChatMessage {
  const t = COPY[guest.language]
  const options = Array.from({ length: Math.min(guest.pax, 10) }, (_, i) => i + 1)

  if (options.length === 1) {
    // One person, one answer. Asking would be a question with a single
    // possible response.
    return { type: 'text', body: t.done(1) }
  }

  return {
    type: 'list',
    body: t.howMany(guest.pax),
    button: t.pick,
    rows: options.map((n) => ({ id: paxPayload(n), title: t.person(n) })),
  }
}

/**
 * What to do about the message that just arrived.
 *
 * `now` is not needed: nothing here depends on the clock. Whether the window is
 * still open is Meta's answer to give, and the send reports it.
 */
export function handleReply(guest: ChatGuest, reply: ParsedReply): ChatAction {
  const t = COPY[guest.language]
  const events = invitedEvents(guest)

  // Nothing to answer. Not a conversation we started.
  if (events.length === 0) return { kind: 'handover' }

  // Invited to something, but not yet told about it. Whatever they wrote is
  // for a person to read, not for the form to answer: asking them to confirm
  // an invitation they have not received is how somebody ends up recorded as
  // attending an event nobody has described to them.
  if (!guest.invitationSent) return { kind: 'handover' }

  switch (reply.kind) {
    case 'no':
      return {
        kind: 'record',
        events,
        attending: false,
        pax: null,
        awaiting: null,
        reply: { type: 'text', body: t.declined },
      }

    case 'yes': {
      // Invited to both: which, before how many. A guest coming to one and not
      // the other has a different number in mind for each.
      if (events.length > 1) {
        return { kind: 'say', reply: askEvents(guest), awaiting: 'events' }
      }
      // One event and one person: there is nothing left to ask.
      if (guest.pax === 1) {
        return {
          kind: 'record',
          events,
          attending: true,
          pax: 1,
          awaiting: null,
          reply: { type: 'text', body: t.done(1) },
        }
      }
      // askPax answers outright when there is only one seat to confirm, and
      // that message asks for nothing.
      const ask = askPax(guest)
      return { kind: 'say', reply: ask, awaiting: ask.type === 'list' ? 'pax' : null }
    }

    case 'events': {
      const chosen = reply.events.filter((e) => events.includes(e))
      if (chosen.length === 0) return { kind: 'say', reply: askEvents(guest), awaiting: 'events' }

      if (guest.pax === 1) {
        return {
          kind: 'record',
          events: chosen,
          attending: true,
          pax: 1,
          awaiting: null,
          reply: { type: 'text', body: t.done(1) },
        }
      }

      // Recorded now, so a window that closes here leaves "coming, headcount
      // unknown" rather than nothing at all.
      return {
        kind: 'record',
        events: chosen,
        attending: true,
        pax: null,
        awaiting: 'pax',
        reply: askPax(guest),
      }
    }

    case 'pax': {
      // The ceiling, enforced here as well as in the database. A tap can only
      // come from a list we sent, but a payload is a string on the wire.
      const pax = Math.min(reply.pax, guest.pax)
      const attending = events.filter((e) =>
        e === 'akad' ? guest.akadRsvp === 'attending' : guest.resepsiRsvp === 'attending'
      )
      const target = attending.length > 0 ? attending : events

      return {
        kind: 'record',
        events: target,
        attending: true,
        pax,
        awaiting: null,
        reply: { type: 'text', body: t.done(pax) },
      }
    }

    default: {
      // Free text, or a tap we do not recognise. Never acted on.
      //
      // Most guests will type "iya hadir" rather than tap, and reading that as
      // a yes is how somebody gets recorded as attending because they wrote
      // "tidak bisa hadir". So text only ever prompts.
      if (guest.awaiting === 'pax') return { kind: 'say', reply: askPax(guest), awaiting: 'pax' }
      if (guest.awaiting === 'events') {
        return { kind: 'say', reply: askEvents(guest), awaiting: 'events' }
      }

      // Nothing outstanding and they have already answered: a real question for
      // a person, not a form to re-open.
      if (isComplete(guest)) return { kind: 'handover' }

      // The opening question again, and nothing is outstanding: `awaiting`
      // only names the two follow-up questions, and claiming one of those here
      // is what let a typed word skip past "will you be joining us".
      return {
        kind: 'say',
        reply: { ...openingMessage(guest), body: t.nudge },
        awaiting: null,
      }
    }
  }
}

/** Every invited event answered, and any acceptance carries a headcount. */
export function isComplete(guest: ChatGuest): boolean {
  const events = invitedEvents(guest)
  if (events.length === 0) return false

  return events.every((event) => {
    const status = event === 'akad' ? guest.akadRsvp : guest.resepsiRsvp
    const pax = event === 'akad' ? guest.akadPax : guest.resepsiPax
    if (status === 'not_attending') return true
    return status === 'attending' && pax !== null
  })
}

/**
 * A guest who said yes and never said how many.
 *
 * The window closes 24 hours after their last message, so a conversation can
 * stop here. It must not look answered: they are coming, and nobody knows how
 * many places to lay.
 */
export function isStranded(guest: ChatGuest): boolean {
  return !isComplete(guest) && invitedEvents(guest).some((event) => {
    const status = event === 'akad' ? guest.akadRsvp : guest.resepsiRsvp
    const pax = event === 'akad' ? guest.akadPax : guest.resepsiPax
    return status === 'attending' && pax === null
  })
}
