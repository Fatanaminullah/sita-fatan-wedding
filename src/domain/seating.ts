/**
 * VIP seating at the Resepsi. VIP exists only inside the Resepsi, so this is
 * the only event with tables.
 *
 * A seat is one person: a party of 2 takes 2 seats and sits at one table.
 * Warn, allow, flag: a table may be seated past its size, and comes back
 * with `over` set rather than refusing the guest.
 */

export type SeatingGuest = {
  id: string
  name: string
  side: 'fatan' | 'sita'
  inviterKey: string
  pax: number
  isVip: boolean
  /** Null when the guest is not invited to the Resepsi at all. */
  resepsiInvite: 'confirmed' | 'waitlisted' | null
  resepsiRsvp: 'pending' | 'attending' | 'not_attending' | null
  resepsiPaxConfirmed: number | null
}

export type SeatingTable = {
  id: string
  name: string
  seats: number
  position: number
}

export type SeatAssignment = { guestId: string; tableId: string }

export type SeatedGuest = SeatingGuest & {
  seats: number
  /**
   * Seated, but no longer someone this plan is for: they declined, lost VIP,
   * or left the Resepsi after being given a table. Kept at the table so the
   * couple sees it and decides, rather than vanishing silently.
   */
  stale: boolean
}

export type SeatingTableView = SeatingTable & {
  guests: SeatedGuest[]
  used: number
  free: number
  over: number
}

export type Seating = {
  tables: SeatingTableView[]
  /** Seatable VIPs without a table, in the order given. */
  unseated: SeatedGuest[]
  /** VIPs without a table who said they are not coming. */
  declined: SeatedGuest[]
  totals: {
    tables: number
    seats: number
    seated: number
    toSeat: number
    /** Seats missing for everyone still to seat, zero when the plan fits. */
    short: number
    overTables: number
  }
}

/** Confirmed pax once they said yes, invited pax until then, none once they said no. */
export function seatsFor(guest: SeatingGuest): number {
  if (guest.resepsiRsvp === 'not_attending') return 0
  if (guest.resepsiRsvp === 'attending' && guest.resepsiPaxConfirmed) return guest.resepsiPaxConfirmed
  return guest.pax
}

function isSeatable(guest: SeatingGuest): boolean {
  return guest.isVip && guest.resepsiInvite === 'confirmed' && guest.resepsiRsvp !== 'not_attending'
}

function view(guest: SeatingGuest): SeatedGuest {
  return { ...guest, seats: seatsFor(guest), stale: !isSeatable(guest) }
}

export function buildSeating(
  tables: SeatingTable[],
  guests: SeatingGuest[],
  assignments: SeatAssignment[]
): Seating {
  const byGuest = new Map(guests.map((g) => [g.id, g]))
  const tableIds = new Set(tables.map((t) => t.id))
  const seatedAt = new Map<string, string>()
  for (const a of assignments) {
    if (byGuest.has(a.guestId) && tableIds.has(a.tableId)) seatedAt.set(a.guestId, a.tableId)
  }

  const views = [...tables]
    .sort((a, b) => a.position - b.position)
    .map((t): SeatingTableView => {
      const seated = guests.filter((g) => seatedAt.get(g.id) === t.id).map(view)
      const used = seated.reduce((sum, g) => sum + g.seats, 0)
      return { ...t, guests: seated, used, free: Math.max(0, t.seats - used), over: Math.max(0, used - t.seats) }
    })

  const vipsWithoutTable = guests.filter(
    (g) => !seatedAt.has(g.id) && g.isVip && g.resepsiInvite === 'confirmed'
  )
  const unseated = vipsWithoutTable.filter(isSeatable).map(view)
  const declined = vipsWithoutTable.filter((g) => g.resepsiRsvp === 'not_attending').map(view)

  const seats = views.reduce((sum, t) => sum + t.seats, 0)
  const seated = views.reduce((sum, t) => sum + t.used, 0)
  const toSeat = unseated.reduce((sum, g) => sum + g.seats, 0)
  const open = views.reduce((sum, t) => sum + t.free, 0)

  return {
    tables: views,
    unseated,
    declined,
    totals: {
      tables: views.length,
      seats,
      seated,
      toSeat,
      short: Math.max(0, toSeat - open),
      overTables: views.filter((t) => t.over > 0).length,
    },
  }
}
