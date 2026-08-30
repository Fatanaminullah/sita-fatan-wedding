/**
 * What the door itself can count.
 *
 * An usher holds no read on `guests`, so the ordinary dashboard renders every
 * figure as zero for them: RLS returns no rows, nothing errors, and a
 * volunteer reads "0 guests" as fact. That is the Unscoped Lookup Rule in
 * docs/DATA_MODEL.md, and it is why this exists rather than a role flag on the
 * existing dashboard.
 *
 * These numbers come only from what an usher genuinely can read, so every one
 * of them is true for every role.
 */

export type WeddingEvent = 'akad' | 'resepsi'

/** One row of `checkin_events`, as the door reads it. */
export type CheckinRow = {
  guestId: string
  event: WeddingEvent
  paxArrived: number
  checkedInAt: string
}

export type EventTally = {
  event: WeddingEvent
  /** Distinct guests admitted. Not row count: a duplicate scan is kept. */
  guests: number
  /** Bodies in the room, from what was actually counted at the door. */
  pax: number
}

export type DoorSummary = {
  akad: EventTally
  resepsi: EventTally
  souvenirs: number
  /** The most recent admission, for a "yes, this thing is working" signal. */
  lastCheckedInAt: string | null
  lastGuestId: string | null
}

/**
 * Deduplicates by guest before counting.
 *
 * `checkin_events` deliberately has no unique constraint: a second scan of the
 * same guest is a real event and the row is kept as a record that it was
 * tried. That makes a naive `count(*)` over-report arrivals, and a naive
 * `sum(pax_arrived)` over-report the room. Both take the earliest row per
 * guest, which is the admission that actually happened.
 */
export function tallyDoor(rows: CheckinRow[], souvenirCount: number): DoorSummary {
  const firstByGuestEvent = new Map<string, CheckinRow>()

  for (const row of rows) {
    const key = `${row.guestId}:${row.event}`
    const existing = firstByGuestEvent.get(key)
    if (!existing || row.checkedInAt < existing.checkedInAt) {
      firstByGuestEvent.set(key, row)
    }
  }

  const tally = (event: WeddingEvent): EventTally => {
    const admitted = [...firstByGuestEvent.values()].filter((r) => r.event === event)
    return {
      event,
      guests: admitted.length,
      pax: admitted.reduce((sum, r) => sum + r.paxArrived, 0),
    }
  }

  // The latest admission is taken across every row, including a duplicate
  // scan: the question this answers is "is the door still working", and the
  // most recent thing that happened is the honest answer to it.
  let last: CheckinRow | null = null
  for (const row of rows) {
    if (!last || row.checkedInAt > last.checkedInAt) last = row
  }

  return {
    akad: tally('akad'),
    resepsi: tally('resepsi'),
    souvenirs: souvenirCount,
    lastCheckedInAt: last?.checkedInAt ?? null,
    lastGuestId: last?.guestId ?? null,
  }
}
