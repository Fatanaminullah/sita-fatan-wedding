/**
 * Everything on the invitation that is words, dates or links. Edit here, not
 * in the sections. English only, per the owner (2026-08-09).
 *
 * Marked OWNER SUPPLIES where the value is a placeholder waiting on the
 * couple. Nothing marked that way should ship.
 */

export const COUPLE = {
  bride: {
    short: 'Sita',
    full: 'Sita Cahyani Arasy',
    // OWNER SUPPLIES: parents' full names.
    parents: 'daughter of Bapak (name) and Ibu (name)',
  },
  groom: {
    short: 'Fatan',
    full: 'Fatan Aminullah',
    // OWNER SUPPLIES: parents' full names.
    parents: 'son of Bapak (name) and Ibu (name)',
  },
  hashtag: '#NoHeSITAtionJustFATAN',
} as const

/** The wedding day, in Jakarta. */
export const WEDDING_DATE = {
  iso: '2026-10-10',
  /** Local midnight, WIB. Used by the countdown. */
  startsAt: '2026-10-10T08:00:00+07:00',
  long: 'Saturday, 10 October 2026',
  stacked: ['10', '10', '26'],
} as const

/** Ask for replies by D-14. */
export const RSVP_DEADLINE = {
  iso: '2026-09-26',
  long: '26 September',
} as const

export type EventKey = 'akad' | 'resepsi'

export type WeddingEvent = {
  key: EventKey
  name: string
  /** Shown giant on the card. */
  time: string
  /** Full clock range or "onwards". */
  timeLine: string
  venue: string
  address: string
  mapsUrl: string
  /** iCalendar UTC stamps. */
  icsStart: string
  icsEnd: string
}

export const EVENTS: Record<EventKey, WeddingEvent> = {
  akad: {
    key: 'akad',
    name: 'Akad Nikah',
    time: '08.00',
    timeLine: '08.00 WIB',
    venue: 'Masjid Istiqlal',
    address: 'Jl. Taman Wijaya Kusuma, Jakarta Pusat',
    mapsUrl: 'https://maps.google.com/?q=Masjid+Istiqlal+Jakarta',
    icsStart: '20261010T010000Z',
    icsEnd: '20261010T030000Z',
  },
  resepsi: {
    key: 'resepsi',
    name: 'Resepsi',
    time: '18.30',
    timeLine: '18.30 WIB onwards',
    venue: 'Luxus Grand Ballroom',
    address: 'Mall MGK Kemayoran, Jakarta Pusat',
    mapsUrl: 'https://maps.google.com/?q=Luxus+Grand+Ballroom+MGK+Kemayoran',
    icsStart: '20261010T113000Z',
    icsEnd: '20261010T150000Z',
  },
}

/** Al-A'raf 189, translation as supplied by the owner for the earlier prototype. */
export const VERSE = {
  text: 'It is He who created you from one soul and created from it its mate, that he might dwell in security with her.',
  source: 'Al-A’raf : 189',
} as const

/**
 * The vow. Each row is two halves set either side of the ring, read left to
 * right, row by row. Editable; keep halves short, they are set enormous.
 */
export const VOW_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['We found', 'in each'],
  ['other the', 'home we'],
  ['never knew', 'we were'],
  ['looking', 'for.'],
]

export const DRESS_CODE = {
  title: 'Formal, in dark tones.',
  lines: ['Black, brown or grey.', 'Please leave the white to the bride.'],
  swatches: [
    { name: 'Black', hex: '#141313' },
    { name: 'Brown', hex: '#3B2A22' },
    { name: 'Grey', hex: '#6B6866' },
  ],
} as const

export const GIFT = {
  intro: 'Your presence is the gift. If you would like to send something anyway:',
  // OWNER SUPPLIES: QRIS image path and the one bank line.
  qrisSrc: null as string | null,
  bank: {
    name: 'Bank (name)',
    account: '0000 0000 0000',
    holder: 'Sita Cahyani Arasy',
  },
} as const

/** OWNER SUPPLIES: one licensed track, ~2 to 4 MB, at /public/audio/. null hides the toggle. */
export const MUSIC_SRC: string | null = null

export const CLOSING = {
  thanks: 'Thank you for being part of our day.',
} as const
