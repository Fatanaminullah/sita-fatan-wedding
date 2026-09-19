import type { EventKey } from '../content'

export type Lang = 'en' | 'id'

/** A sentence with one italic run: the plain part, then the italic part. */
export type Split = readonly [string, string]

/**
 * Every sentence on the invitation, in one language. What is not a
 * sentence (dates as ISO, URLs, hex, the hashtag, the venue walls, the
 * bank line) stays in content.ts and is the same in both.
 */
export type Copy = {
  lang: Lang
  /** The date, written out. */
  dateLong: string
  /** The reply-by date, written out. */
  deadlineLong: string
  /**
   * `note` is shown only on the non-hijab invitation, where both doors are
   * open and one of them may not be the guest's to walk through.
   */
  events: Record<EventKey, { name: string; timeLine: string; note?: string; directions?: readonly string[] }>
  /** Under the date in the events section. */
  places: (pax: number) => string
  openMaps: string

  letter: {
    /** Tracked caps above the name. */
    dear: string
    invitedTo: string
    and: string
    replyBy: (deadline: string) => string
    aria: (name: string) => string
    /** The fallback's button. */
    open: string
  }
  cover: {
    title: string
    /** Under the open button, naming the other way in. */
    tap: string
    scrollCue: string
  }
  verse: { text: string; source: string }
  /** Six rows, two short halves each, set enormous either side of the ring. */
  vow: ReadonlyArray<readonly [string, string]>
  couple: {
    brideParents: string
    groomParents: string
    and: string
    /** The caption words: [italic lead, word]. */
    captions: { bride: Split; both: Split; groom: Split }
    aria: string
  }
  countdown: {
    units: readonly [string, string, string, string]
    over: Split
    addToCalendar: string
    dateAria: string
  }
  dress: {
    title: string
    lines: readonly [string, string]
    example: string
    drag: string
    tones: readonly [string, string, string]
    toneAria: string
    aria: string
  }
  gallery: { hint: string }
  gift: {
    label: string
    title: Split
    presence: string
    /** On the back of the card, beside the bank line. */
    intro: string
    withLove: string
    /** Tracked caps on the front. */
    turnOver: string
    turn: string
    turnBack: string
    copy: string
    copied: string
    drag: string
    aria: (bank: string, account: string, holder: string) => string
  }
  rsvp: {
    crumb: string
    of: (i: number, n: number) => string
    askBefore: string
    askAfter: string
    yes: string
    no: string
    later: string
    howMany: Split
    kept: (n: number) => string
    fewer: string
    more: string
    count: string
    ok: string
    enter: string
    reviewEyebrow: string
    reviewQ: Split
    coming: string
    ofYou: (n: number) => string
    notAble: string
    sending: string
    send: string
    doneEyebrow: string
    seeYou: Split
    miss: Split
    lastPage: string
    keep: string
    change: string
    answerToContinue: string
    prev: string
    next: string
    nav: string
    aria: string
  }
  closing: {
    thanks: string
    signOff: string
    reply: string
    aria: string
  }
  chrome: {
    mute: string
    unmute: string
    pill: string
    loading: string
    /** The toggle's accessible name: what pressing it switches to. */
    switchTo: string
  }
}
