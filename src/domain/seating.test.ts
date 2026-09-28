import { describe, expect, it } from 'vitest'
import { buildSeating, seatsFor, type SeatingGuest, type SeatingTable } from './seating'

function guest(overrides: Partial<SeatingGuest> = {}): SeatingGuest {
  return {
    id: 'g1',
    name: 'Invented Guest',
    side: 'fatan',
    inviterKey: 'Papa Fatan',
    pax: 2,
    isVip: true,
    resepsiInvite: 'confirmed',
    resepsiRsvp: 'pending',
    resepsiPaxConfirmed: null,
    ...overrides,
  }
}

function table(overrides: Partial<SeatingTable> = {}): SeatingTable {
  return { id: 't1', name: 'Table 1', seats: 6, position: 1, ...overrides }
}

describe('seatsFor', () => {
  it('uses the invited pax while the guest has not answered', () => {
    expect(seatsFor(guest({ pax: 2 }))).toBe(2)
  })

  it('uses the confirmed pax once the guest said yes', () => {
    expect(seatsFor(guest({ pax: 2, resepsiRsvp: 'attending', resepsiPaxConfirmed: 1 }))).toBe(1)
  })

  it('takes no seat when the guest said no', () => {
    expect(seatsFor(guest({ resepsiRsvp: 'not_attending' }))).toBe(0)
  })
})

describe('buildSeating', () => {
  it('lists every seatable VIP as unseated when nobody has a table', () => {
    const result = buildSeating([table()], [guest({ id: 'a' }), guest({ id: 'b', pax: 1 })], [])
    expect(result.unseated.map((g) => g.id)).toEqual(['a', 'b'])
    expect(result.totals).toMatchObject({ tables: 1, seats: 6, seated: 0, toSeat: 3, short: 0 })
  })

  it('leaves out guests who are not VIP, not invited to the Resepsi, or waitlisted', () => {
    const result = buildSeating(
      [table()],
      [
        guest({ id: 'plain', isVip: false }),
        guest({ id: 'akadOnly', resepsiInvite: null }),
        guest({ id: 'waiting', resepsiInvite: 'waitlisted' }),
        guest({ id: 'vip' }),
      ],
      []
    )
    expect(result.unseated.map((g) => g.id)).toEqual(['vip'])
  })

  it('keeps a declined VIP out of the pool but counts them apart', () => {
    const result = buildSeating([table()], [guest({ id: 'no', resepsiRsvp: 'not_attending' })], [])
    expect(result.unseated).toEqual([])
    expect(result.declined.map((g) => g.id)).toEqual(['no'])
    expect(result.totals.toSeat).toBe(0)
  })

  it('fills a table by pax and reports what is left', () => {
    const result = buildSeating(
      [table({ seats: 6 })],
      [guest({ id: 'a', pax: 2 }), guest({ id: 'b', pax: 1 })],
      [
        { guestId: 'a', tableId: 't1' },
        { guestId: 'b', tableId: 't1' },
      ]
    )
    expect(result.tables[0]).toMatchObject({ used: 3, free: 3, over: 0 })
    expect(result.tables[0].guests.map((g) => g.id)).toEqual(['a', 'b'])
    expect(result.unseated).toEqual([])
    expect(result.totals).toMatchObject({ seated: 3, toSeat: 0 })
  })

  it('allows a table past its seats and flags by how much', () => {
    const result = buildSeating(
      [table({ seats: 2 })],
      [guest({ id: 'a', pax: 2 }), guest({ id: 'b', pax: 1 })],
      [
        { guestId: 'a', tableId: 't1' },
        { guestId: 'b', tableId: 't1' },
      ]
    )
    expect(result.tables[0]).toMatchObject({ used: 3, free: 0, over: 1 })
    expect(result.totals.overTables).toBe(1)
  })

  it('keeps a seated guest who later declined at the table, taking no seat, flagged', () => {
    const result = buildSeating(
      [table()],
      [guest({ id: 'a', resepsiRsvp: 'not_attending' })],
      [{ guestId: 'a', tableId: 't1' }]
    )
    expect(result.tables[0].used).toBe(0)
    expect(result.tables[0].guests[0]).toMatchObject({ id: 'a', seats: 0, stale: true })
  })

  it('flags a seated guest who is no longer VIP', () => {
    const result = buildSeating([table()], [guest({ id: 'a', isVip: false, pax: 1 })], [{ guestId: 'a', tableId: 't1' }])
    expect(result.tables[0].guests[0]).toMatchObject({ stale: true })
  })

  it('reports how many seats short the plan is', () => {
    const result = buildSeating(
      [table({ seats: 2 })],
      [guest({ id: 'a', pax: 2 }), guest({ id: 'b', pax: 2 })],
      [{ guestId: 'a', tableId: 't1' }]
    )
    expect(result.totals).toMatchObject({ seats: 2, seated: 2, toSeat: 2, short: 2 })
  })

  it('orders tables by position', () => {
    const result = buildSeating(
      [table({ id: 'b', position: 2 }), table({ id: 'a', position: 1 })],
      [],
      []
    )
    expect(result.tables.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('ignores an assignment whose guest or table is gone', () => {
    const result = buildSeating([table()], [guest({ id: 'a' })], [
      { guestId: 'ghost', tableId: 't1' },
      { guestId: 'a', tableId: 'gone' },
    ])
    expect(result.tables[0].guests).toEqual([])
    expect(result.unseated.map((g) => g.id)).toEqual(['a'])
  })
})
