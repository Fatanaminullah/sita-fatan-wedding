import { describe, expect, it } from 'vitest'
import { tallyDoor, type CheckinRow } from './door-summary'

function row(over: Partial<CheckinRow> = {}): CheckinRow {
  return {
    guestId: 'g1',
    event: 'resepsi',
    paxArrived: 2,
    checkedInAt: '2026-10-10T19:00:00+07:00',
    ...over,
  }
}

describe('tallyDoor', () => {
  it('counts nothing before the doors open', () => {
    const d = tallyDoor([], 0)
    expect(d.resepsi).toEqual({ event: 'resepsi', guests: 0, pax: 0 })
    expect(d.akad).toEqual({ event: 'akad', guests: 0, pax: 0 })
    expect(d.lastCheckedInAt).toBeNull()
  })

  it('counts guests and the bodies they brought', () => {
    const d = tallyDoor(
      [row({ guestId: 'a', paxArrived: 2 }), row({ guestId: 'b', paxArrived: 3 })],
      0
    )
    expect(d.resepsi.guests).toBe(2)
    expect(d.resepsi.pax).toBe(5)
  })

  // The reason this function exists rather than a count(*) in SQL.
  it('does not count a duplicate scan twice', () => {
    const d = tallyDoor(
      [
        row({ guestId: 'a', paxArrived: 2, checkedInAt: '2026-10-10T19:00:00+07:00' }),
        row({ guestId: 'a', paxArrived: 2, checkedInAt: '2026-10-10T19:05:00+07:00' }),
      ],
      0
    )
    expect(d.resepsi.guests).toBe(1)
    expect(d.resepsi.pax).toBe(2)
  })

  it('takes the earliest admission when a duplicate disagrees on headcount', () => {
    // The first scan is the admission that happened; a later row is a record
    // that someone tried again, not a correction.
    const d = tallyDoor(
      [
        row({ guestId: 'a', paxArrived: 4, checkedInAt: '2026-10-10T19:05:00+07:00' }),
        row({ guestId: 'a', paxArrived: 2, checkedInAt: '2026-10-10T19:00:00+07:00' }),
      ],
      0
    )
    expect(d.resepsi.pax).toBe(2)
  })

  it('keeps the two events apart', () => {
    const d = tallyDoor(
      [
        row({ guestId: 'a', event: 'akad', paxArrived: 1 }),
        row({ guestId: 'a', event: 'resepsi', paxArrived: 3 }),
      ],
      0
    )
    // Same guest at both doors is two admissions, one per event.
    expect(d.akad).toEqual({ event: 'akad', guests: 1, pax: 1 })
    expect(d.resepsi).toEqual({ event: 'resepsi', guests: 1, pax: 3 })
  })

  it('reports the most recent admission across both doors', () => {
    const d = tallyDoor(
      [
        row({ guestId: 'a', checkedInAt: '2026-10-10T19:00:00+07:00' }),
        row({ guestId: 'b', event: 'akad', checkedInAt: '2026-10-10T20:11:00+07:00' }),
      ],
      0
    )
    expect(d.lastCheckedInAt).toBe('2026-10-10T20:11:00+07:00')
    expect(d.lastGuestId).toBe('b')
  })

  it('passes the souvenir count straight through', () => {
    // One per guest for the whole wedding, not per event, so it is never
    // split across the two tallies.
    expect(tallyDoor([], 31).souvenirs).toBe(31)
  })
})
