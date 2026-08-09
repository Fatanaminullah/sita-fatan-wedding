export type Side = 'fatan' | 'sita'
export type EventKey = 'akad' | 'resepsi'

export type SummaryGuestEvent = {
  event: EventKey
  inviteStatus: 'confirmed' | 'waitlisted'
  rsvpStatus: 'pending' | 'attending' | 'not_attending'
}

export type SummaryGuest = {
  id: string
  pax: number
  side: Side
  inviterKey: string
  type: 'family' | 'friend'
  isVip: boolean
  hasPhone: boolean
  events: SummaryGuestEvent[]
}

export type SummaryCaps = {
  inviters: Array<{ key: string; side: Side; akadCap: number; resepsiCap: number }>
  vipCapBySide: Record<Side, number>
  physicalCapBySide: Record<Side, number>
  /**
   * Printed-card counts per side, supplied by the caller rather than derived
   * from the guest list: under an inviter's RLS the guest list is partial,
   * and the printed pool is shared by the whole side, so the repository
   * fetches the true counts through a definer function for every role.
   */
  physicalUsedBySide: Record<Side, number>
}

export type CapacityTotals = {
  event: EventKey | 'vip'
  used: number
  cap: number
  remaining: number
  overCap: boolean
}

export type SideRow = {
  side: Side
  akadUsed: number
  akadCap: number
  akadRemaining: number
  resepsiUsed: number
  resepsiCap: number
  resepsiRemaining: number
  vipUsed: number
  vipCap: number
  vipRemaining: number
  /** Printed cards: entries, not pax. One card per invitation. */
  physicalUsed: number
  physicalCap: number
  physicalRemaining: number
  waitlistPax: number
}

export type InviterRow = {
  inviterKey: string
  side: Side
  akadUsed: number
  akadCap: number
  akadRemaining: number
  resepsiUsed: number
  resepsiCap: number
  resepsiRemaining: number
  vipUsed: number
  waitlistPax: number
  invitedPax: number
  guests: number
  missingPhone: number
}

export type Summary = {
  events: { akad: CapacityTotals; resepsi: CapacityTotals; vip: CapacityTotals }
  sides: SideRow[]
  inviters: InviterRow[]
  byType: { family: number; friend: number }
  waitlist: {
    totalPax: number
    bySide: Record<Side, number>
    byInviter: Array<{ inviterKey: string; side: Side; akad: number; resepsi: number; total: number }>
  }
  /** Entries, not pax. Souvenir bags are per guest entry, not per head. */
  entryCounts: { akad: number; resepsi: number; both: number; unique: number }
  phone: { withPhone: number; missing: number; total: number }
  guestCount: number
  totalPax: number
}

const SIDES: Side[] = ['fatan', 'sita']

/**
 * A seat is counted when the guest is confirmed (not waitlisted) for that event
 * and has not declined. Waitlisted pax are tracked separately: they are people
 * we have not promised a seat to, so counting them as used would hide real room.
 */
function takesSeat(event: SummaryGuestEvent | undefined): boolean {
  return event?.inviteStatus === 'confirmed' && event.rsvpStatus !== 'not_attending'
}

function eventOf(guest: SummaryGuest, event: EventKey): SummaryGuestEvent | undefined {
  return guest.events.find((e) => e.event === event)
}

function totals(event: EventKey | 'vip', used: number, cap: number): CapacityTotals {
  const remaining = cap - used
  return { event, used, cap, remaining, overCap: remaining < 0 }
}

export function buildSummary(guests: SummaryGuest[], caps: SummaryCaps): Summary {
  const sideAccumulator = new Map<Side, { akad: number; resepsi: number; vip: number; waitlist: number }>(
    SIDES.map((side) => [side, { akad: 0, resepsi: 0, vip: 0, waitlist: 0 }])
  )
  const inviterAccumulator = new Map<
    string,
    {
      akad: number
      resepsi: number
      vip: number
      waitlistAkad: number
      waitlistResepsi: number
      waitlistPax: number
      invitedPax: number
      guests: number
      missingPhone: number
    }
  >(
    caps.inviters.map((inviter) => [
      inviter.key,
      {
        akad: 0,
        resepsi: 0,
        vip: 0,
        waitlistAkad: 0,
        waitlistResepsi: 0,
        waitlistPax: 0,
        invitedPax: 0,
        guests: 0,
        missingPhone: 0,
      },
    ])
  )

  const byType = { family: 0, friend: 0 }
  const entryCounts = { akad: 0, resepsi: 0, both: 0, unique: 0 }
  const phone = { withPhone: 0, missing: 0, total: guests.length }
  let totalPax = 0

  for (const guest of guests) {
    totalPax += guest.pax
    if (guest.hasPhone) phone.withPhone += 1
    else phone.missing += 1

    const akad = eventOf(guest, 'akad')
    const resepsi = eventOf(guest, 'resepsi')
    const akadSeat = takesSeat(akad)
    const resepsiSeat = takesSeat(resepsi)

    // Family/friend describes who is coming, so it counts the same population
    // as the seats above: someone still waiting for a seat is not in it yet.
    if (akadSeat || resepsiSeat) byType[guest.type] += guest.pax

    if (akadSeat) entryCounts.akad += 1
    if (resepsiSeat) entryCounts.resepsi += 1
    if (akadSeat && resepsiSeat) entryCounts.both += 1
    if (akadSeat || resepsiSeat) entryCounts.unique += 1

    // Waitlist totals count people, not seat-slots: a guest waiting for both
    // events is one group of pax on hold, not two. The per-event split below
    // is where "waiting for Akad specifically" is answered.
    const isWaitlisted =
      akad?.inviteStatus === 'waitlisted' || resepsi?.inviteStatus === 'waitlisted'
    const waitlistPax = isWaitlisted ? guest.pax : 0

    // Side totals count every guest, even one whose inviter key is unknown:
    // an unrecognized inviter is a data problem, but the seat is still real.
    const side = sideAccumulator.get(guest.side)
    if (side) {
      if (akadSeat) side.akad += guest.pax
      if (resepsiSeat) side.resepsi += guest.pax
      if (resepsiSeat && guest.isVip) side.vip += guest.pax
      side.waitlist += waitlistPax
    }

    const inviter = inviterAccumulator.get(guest.inviterKey)
    if (inviter) {
      if (akadSeat) inviter.akad += guest.pax
      if (resepsiSeat) inviter.resepsi += guest.pax
      if (resepsiSeat && guest.isVip) inviter.vip += guest.pax
      if (akad?.inviteStatus === 'waitlisted') inviter.waitlistAkad += guest.pax
      if (resepsi?.inviteStatus === 'waitlisted') inviter.waitlistResepsi += guest.pax
      inviter.waitlistPax += waitlistPax
      if (!guest.hasPhone) inviter.missingPhone += 1
      if (akadSeat || resepsiSeat) {
        inviter.invitedPax += guest.pax
        inviter.guests += 1
      }
    }
  }

  const capBySide = new Map<Side, { akad: number; resepsi: number }>(
    SIDES.map((side) => [side, { akad: 0, resepsi: 0 }])
  )
  for (const inviter of caps.inviters) {
    const bucket = capBySide.get(inviter.side)
    if (!bucket) continue
    bucket.akad += inviter.akadCap
    bucket.resepsi += inviter.resepsiCap
  }

  const sides: SideRow[] = SIDES.map((side) => {
    const used = sideAccumulator.get(side)!
    const cap = capBySide.get(side)!
    const vipCap = caps.vipCapBySide[side] ?? 0
    const physicalCap = caps.physicalCapBySide[side] ?? 0
    const physicalUsed = caps.physicalUsedBySide[side] ?? 0
    return {
      side,
      akadUsed: used.akad,
      akadCap: cap.akad,
      akadRemaining: cap.akad - used.akad,
      resepsiUsed: used.resepsi,
      resepsiCap: cap.resepsi,
      resepsiRemaining: cap.resepsi - used.resepsi,
      vipUsed: used.vip,
      vipCap,
      vipRemaining: vipCap - used.vip,
      physicalUsed,
      physicalCap,
      physicalRemaining: physicalCap - physicalUsed,
      waitlistPax: used.waitlist,
    }
  })

  const inviters: InviterRow[] = caps.inviters.map((inviter) => {
    const used = inviterAccumulator.get(inviter.key)!
    return {
      inviterKey: inviter.key,
      side: inviter.side,
      akadUsed: used.akad,
      akadCap: inviter.akadCap,
      akadRemaining: inviter.akadCap - used.akad,
      resepsiUsed: used.resepsi,
      resepsiCap: inviter.resepsiCap,
      resepsiRemaining: inviter.resepsiCap - used.resepsi,
      vipUsed: used.vip,
      waitlistPax: used.waitlistPax,
      invitedPax: used.invitedPax,
      guests: used.guests,
      missingPhone: used.missingPhone,
    }
  })

  const totalAkadUsed = sides.reduce((sum, s) => sum + s.akadUsed, 0)
  const totalResepsiUsed = sides.reduce((sum, s) => sum + s.resepsiUsed, 0)
  const totalVipUsed = sides.reduce((sum, s) => sum + s.vipUsed, 0)

  return {
    events: {
      akad: totals('akad', totalAkadUsed, sides.reduce((sum, s) => sum + s.akadCap, 0)),
      resepsi: totals('resepsi', totalResepsiUsed, sides.reduce((sum, s) => sum + s.resepsiCap, 0)),
      vip: totals('vip', totalVipUsed, sides.reduce((sum, s) => sum + s.vipCap, 0)),
    },
    sides,
    inviters,
    byType,
    waitlist: {
      totalPax: sides.reduce((sum, s) => sum + s.waitlistPax, 0),
      bySide: { fatan: sides[0].waitlistPax, sita: sides[1].waitlistPax },
      byInviter: caps.inviters.map((inviter) => {
        const used = inviterAccumulator.get(inviter.key)!
        return {
          inviterKey: inviter.key,
          side: inviter.side,
          akad: used.waitlistAkad,
          resepsi: used.waitlistResepsi,
          total: used.waitlistPax,
        }
      }),
    },
    entryCounts,
    phone,
    guestCount: guests.length,
    totalPax,
  }
}

/**
 * The inviter dashboard shows one person's world, so the headline capacity
 * cards must use that inviter's own caps, not the event-wide ones: an inviter
 * over their own cap is over cap, full stop, even if the room still has seats.
 * VIP has no per-inviter cap, so it falls back to the shared cap of the
 * inviter's side. An unknown key scopes nothing and keeps the full totals.
 */
export function scopeSummaryToInviter(summary: Summary, inviterKey: string): Summary {
  const inviters = summary.inviters.filter((row) => row.inviterKey === inviterKey)
  const own = inviters[0]
  const sideRow = own ? summary.sides.find((row) => row.side === own.side) : undefined

  return {
    ...summary,
    events: own
      ? {
          akad: totals('akad', own.akadUsed, own.akadCap),
          resepsi: totals('resepsi', own.resepsiUsed, own.resepsiCap),
          vip: totals('vip', own.vipUsed, sideRow?.vipCap ?? 0),
        }
      : summary.events,
    inviters,
    sides: sideRow ? [sideRow] : summary.sides,
    waitlist: {
      ...summary.waitlist,
      byInviter: summary.waitlist.byInviter.filter((row) => row.inviterKey === inviterKey),
    },
  }
}

/**
 * A side-scoped admin's world is one side of the wedding. Sibling of
 * scopeSummaryToInviter: without it the other side's inviters would render as
 * zero-count rows (their guests are invisible under RLS), indistinguishable
 * from genuinely empty inviters, and the headline cards would measure one
 * side's usage against both sides' caps. An unknown side scopes nothing.
 */
export function scopeSummaryToSide(summary: Summary, side: Side): Summary {
  const sideRow = summary.sides.find((row) => row.side === side)
  if (!sideRow) {
    return { ...summary, inviters: summary.inviters.filter((row) => row.side === side) }
  }

  return {
    ...summary,
    events: {
      akad: totals('akad', sideRow.akadUsed, sideRow.akadCap),
      resepsi: totals('resepsi', sideRow.resepsiUsed, sideRow.resepsiCap),
      vip: totals('vip', sideRow.vipUsed, sideRow.vipCap),
    },
    sides: [sideRow],
    inviters: summary.inviters.filter((row) => row.side === side),
    waitlist: {
      ...summary.waitlist,
      byInviter: summary.waitlist.byInviter.filter((row) => row.side === side),
    },
  }
}

export type SlotOpportunity = {
  inviterKey: string
  side: Side
  event: EventKey
  remaining: number
  waitingPax: number
}

/**
 * Where a freed seat and a waiting guest exist at the same time. This is the
 * trigger for the slot-fill prompt: an inviter under cap on an event that has
 * somebody waiting for it. An over-cap inviter never appears, because there is
 * no slot to offer, only a decision to make.
 */
export function slotOpportunities(summary: Summary): SlotOpportunity[] {
  const waitingByInviter = new Map(summary.waitlist.byInviter.map((row) => [row.inviterKey, row]))
  const offers: SlotOpportunity[] = []

  for (const inviter of summary.inviters) {
    const waiting = waitingByInviter.get(inviter.inviterKey)
    if (!waiting) continue
    const events: Array<[EventKey, number, number]> = [
      ['akad', inviter.akadRemaining, waiting.akad],
      ['resepsi', inviter.resepsiRemaining, waiting.resepsi],
    ]
    for (const [event, remaining, waitingPax] of events) {
      if (remaining > 0 && waitingPax > 0) {
        offers.push({ inviterKey: inviter.inviterKey, side: inviter.side, event, remaining, waitingPax })
      }
    }
  }
  return offers
}
