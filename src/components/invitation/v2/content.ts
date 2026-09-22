/**
 * Everything on the invitation that is the same in both languages: dates as
 * data, links, the hashtag, the venue walls, the bank line, the swatches.
 * Every sentence lives in copy/en.ts and copy/id.ts (2026-09-16; the page
 * was English only from 2026-08-09 until then).
 *
 * Marked OWNER SUPPLIES where the value is a placeholder waiting on the
 * couple. Nothing marked that way should ship.
 */

export const COUPLE = {
  bride: {
    short: 'Sita',
    full: 'Sita Cahyani Arasy',
    instagram: 'sitachynrsy',
  },
  groom: {
    short: 'Fatan',
    full: 'Fatan Aminullah',
    instagram: 'fatanamminullah',
  },
  /** Set exactly so; the names are the capitals. Never uppercased by CSS. */
  hashtag: '#noheSITAtionjustFATAN',
} as const

/** The wedding day, in Jakarta. */
export const WEDDING_DATE = {
  iso: '2026-10-10',
  /** Local midnight, WIB. Used by the countdown. */
  startsAt: '2026-10-10T08:00:00+07:00',
  stacked: ['10', '10', '26'],
} as const

/** Ask for replies by D-14. Written out per language in copy/. */
export const RSVP_DEADLINE = {
  iso: '2026-09-26',
} as const

export type EventKey = 'akad' | 'resepsi'

/**
 * What an event is, apart from its words. The name, the time line and the
 * directions are copy (copy/en.ts, copy/id.ts), keyed by `key`.
 */
export type WeddingEvent = {
  key: EventKey
  /** Shown giant on the card. */
  time: string
  venue: string
  address: string
  mapsUrl: string
  /** iCalendar UTC stamps. */
  icsStart: string
  icsEnd: string
  /**
   * The venue name as the events section sets it: one line per entry, each
   * fitted to touch both gutters, split into the half that parts upward and
   * the half that parts downward. The split decides how big the wall reads,
   * so it is content, not layout.
   */
  wall: { up: readonly string[]; down: readonly string[] }
}

export const EVENTS: Record<EventKey, WeddingEvent> = {
  akad: {
    key: 'akad',
    time: '08.00',
    venue: 'Masjid Istiqlal',
    address: 'Jl. Taman Wijaya Kusuma, Jakarta Pusat',
    mapsUrl: 'https://maps.google.com/?q=Masjid+Istiqlal+Jakarta',
    icsStart: '20261010T010000Z',
    icsEnd: '20261010T030000Z',
    wall: { up: ['Masjid'], down: ['Istiqlal'] },
  },
  resepsi: {
    key: 'resepsi',
    time: '18.30',
    venue: 'Luxus Grand Ballroom',
    address: 'Mall MGK Kemayoran, Jakarta Pusat',
    mapsUrl: 'https://maps.google.com/?q=Luxus+Grand+Ballroom+MGK+Kemayoran',
    icsStart: '20261010T113000Z',
    icsEnd: '20261010T150000Z',
    // "Luxus Grand" on one line fits at about 50px on a phone, a heading,
    // not a wall. Three lines read as the building's inscription.
    wall: { up: ['Luxus', 'Grand'], down: ['Ballroom'] },
  },
}

/** The three tones. Their names are copy (copy.dress.tones), in this order. */
export const DRESS_SWATCHES = ['#141313', '#3B2A22', '#6B6866'] as const

export const GIFT = {
  // OWNER SUPPLIES: the QRIS image path. The bank line is the owner's, given
  // on 2026-09-21; the number's spacing is for reading only, the copy button
  // strips it.
  qrisSrc: null as string | null,
  bank: {
    name: 'BCA',
    account: '8415 350 640',
    holder: 'Sita Cahyani Arasy',
  },
} as const

/** One track at /public/audio/. null hides the toggle. Starts once the verse has been read. */
export const MUSIC_SRC: string | null = '/audio/crazier-piano-karaoke.mp3'
