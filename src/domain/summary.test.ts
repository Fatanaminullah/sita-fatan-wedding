import { describe, it, expect } from 'vitest'
import {
  buildSummary,
  scopeSummaryToInviter,
  scopeSummaryToSide,
  slotOpportunities,
  type SummaryGuest,
  type SummaryCaps,
} from './summary'

const caps: SummaryCaps = {
  inviters: [
    { key: 'Fatan', side: 'fatan', akadCap: 20, resepsiCap: 90 },
    { key: 'Mama Fatan', side: 'fatan', akadCap: 40, resepsiCap: 80 },
    { key: 'Sita', side: 'sita', akadCap: 20, resepsiCap: 90 },
  ],
  vipCapBySide: { fatan: 25, sita: 25 },
  physicalCapBySide: { fatan: 25, sita: 25 },
  physicalUsedBySide: { fatan: 0, sita: 0 },
}

function guest(overrides: Partial<SummaryGuest> = {}): SummaryGuest {
  return {
    id: 'g1',
    pax: 2,
    side: 'fatan',
    inviterKey: 'Fatan',
    type: 'friend',
    isVip: false,
    hasPhone: true,
    events: [
      { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'pending' },
      { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending' },
    ],
    ...overrides,
  }
}

function resepsiOnly(overrides: Partial<SummaryGuest> = {}): SummaryGuest {
  return guest({
    events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending' }],
    ...overrides,
  })
}

describe('buildSummary event capacity', () => {
  it('sums confirmed pax per event and compares against the summed inviter caps', () => {
    const summary = buildSummary([guest({ pax: 3 }), resepsiOnly({ pax: 5 })], caps)
    expect(summary.events.akad).toEqual({ event: 'akad', used: 3, cap: 80, remaining: 77, overCap: false })
    expect(summary.events.resepsi).toEqual({ event: 'resepsi', used: 8, cap: 260, remaining: 252, overCap: false })
  })

  it('marks an event over cap when used exceeds the cap', () => {
    const overloaded = Array.from({ length: 11 }, (_, i) => guest({ id: `g${i}`, pax: 8 }))
    const summary = buildSummary(overloaded, caps)
    expect(summary.events.akad.used).toBe(88)
    expect(summary.events.akad.remaining).toBe(-8)
    expect(summary.events.akad.overCap).toBe(true)
  })

  it('excludes waitlisted pax from used capacity, counting them as waitlist instead', () => {
    const waitlisted = guest({
      pax: 4,
      events: [
        { event: 'akad', inviteStatus: 'waitlisted', rsvpStatus: 'pending' },
        { event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending' },
      ],
    })
    const summary = buildSummary([guest({ pax: 2 }), waitlisted], caps)
    expect(summary.events.akad.used).toBe(2)
    expect(summary.waitlist.totalPax).toBe(4)
    expect(summary.waitlist.bySide.fatan).toBe(4)
    expect(summary.waitlist.byInviter[0]).toMatchObject({ inviterKey: 'Fatan', akad: 4, resepsi: 4 })
  })

  it('excludes guests who declined, since a declined seat is a free seat', () => {
    const declined = guest({
      pax: 4,
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending' }],
    })
    const summary = buildSummary([resepsiOnly({ pax: 2 }), declined], caps)
    expect(summary.events.resepsi.used).toBe(2)
  })

  it('counts VIP as a tier on Resepsi, capped per side', () => {
    const summary = buildSummary(
      [
        resepsiOnly({ pax: 3, isVip: true }),
        resepsiOnly({ id: 'g2', pax: 2, isVip: true, side: 'sita', inviterKey: 'Sita' }),
        resepsiOnly({ id: 'g3', pax: 9 }),
      ],
      caps
    )
    expect(summary.events.vip).toEqual({ event: 'vip', used: 5, cap: 50, remaining: 45, overCap: false })
    expect(summary.sides.find((s) => s.side === 'fatan')?.vipUsed).toBe(3)
    expect(summary.sides.find((s) => s.side === 'sita')?.vipUsed).toBe(2)
  })

  it('does not count a VIP who is only invited to Akad', () => {
    const akadOnlyVip = guest({
      pax: 3,
      isVip: true,
      events: [{ event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'pending' }],
    })
    expect(buildSummary([akadOnlyVip], caps).events.vip.used).toBe(0)
  })
})

describe('buildSummary breakdowns', () => {
  it('splits capacity by side, summing the caps of that side\'s inviters', () => {
    const summary = buildSummary([guest({ pax: 2 }), resepsiOnly({ id: 'g2', pax: 4, side: 'sita', inviterKey: 'Sita' })], caps)
    const fatan = summary.sides.find((s) => s.side === 'fatan')!
    expect(fatan).toMatchObject({ akadUsed: 2, akadCap: 60, resepsiUsed: 2, resepsiCap: 170, vipCap: 25 })
    const sita = summary.sides.find((s) => s.side === 'sita')!
    expect(sita).toMatchObject({ akadUsed: 0, akadCap: 20, resepsiUsed: 4, resepsiCap: 90 })
  })

  it('reports every inviter, including one with no guests at all', () => {
    const summary = buildSummary([guest({ pax: 2 })], caps)
    expect(summary.inviters.map((i) => i.inviterKey)).toEqual(['Fatan', 'Mama Fatan', 'Sita'])
    const empty = summary.inviters.find((i) => i.inviterKey === 'Mama Fatan')!
    expect(empty).toMatchObject({ akadUsed: 0, akadCap: 40, resepsiUsed: 0, resepsiCap: 80, invitedPax: 0, guests: 0 })
  })

  it('counts invited pax per inviter once, however many events the guest attends', () => {
    const summary = buildSummary([guest({ pax: 2 }), resepsiOnly({ id: 'g2', pax: 3 })], caps)
    const fatan = summary.inviters.find((i) => i.inviterKey === 'Fatan')!
    expect(fatan.invitedPax).toBe(5)
    expect(fatan.guests).toBe(2)
    expect(fatan.akadUsed).toBe(2)
    expect(fatan.resepsiUsed).toBe(5)
  })

  it('splits pax by family and friend across every guest holding a seat', () => {
    const summary = buildSummary(
      [guest({ pax: 2, type: 'family' }), resepsiOnly({ id: 'g2', pax: 3, type: 'friend' })],
      caps
    )
    expect(summary.byType).toEqual({ family: 2, friend: 3 })
  })

  it('leaves a fully waitlisted guest out of the family/friend split', () => {
    const waiting = guest({
      id: 'waiting',
      pax: 4,
      type: 'friend',
      events: [{ event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }],
    })
    const summary = buildSummary([resepsiOnly({ pax: 3, type: 'friend' }), waiting], caps)
    expect(summary.byType.friend).toBe(3)
    expect(summary.totalPax).toBe(7)
  })

  it('counts entries, not pax, for souvenir prep', () => {
    const summary = buildSummary(
      [
        guest({ id: 'both' }),
        guest({ id: 'akad-only', events: [{ event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'pending' }] }),
        resepsiOnly({ id: 'resepsi-only' }),
      ],
      caps
    )
    expect(summary.entryCounts).toEqual({ akad: 2, resepsi: 2, both: 1, unique: 3 })
  })

  it('counts missing phones per inviter, so each parent sees only their own gap', () => {
    const summary = buildSummary(
      [
        guest({ id: 'a', hasPhone: false }),
        guest({ id: 'b', hasPhone: false }),
        guest({ id: 'c', hasPhone: true }),
        guest({ id: 'd', hasPhone: false, inviterKey: 'Mama Fatan' }),
      ],
      caps
    )
    expect(summary.inviters.find((i) => i.inviterKey === 'Fatan')?.missingPhone).toBe(2)
    expect(summary.inviters.find((i) => i.inviterKey === 'Mama Fatan')?.missingPhone).toBe(1)
    expect(summary.inviters.find((i) => i.inviterKey === 'Sita')?.missingPhone).toBe(0)
  })

  it('reports phone coverage', () => {
    const summary = buildSummary(
      [guest({ hasPhone: true }), guest({ id: 'g2', hasPhone: false }), guest({ id: 'g3', hasPhone: false })],
      caps
    )
    expect(summary.phone).toEqual({ withPhone: 1, missing: 2, total: 3 })
  })

  it('returns zeroed totals and every inviter row for an empty guest list', () => {
    const summary = buildSummary([], caps)
    expect(summary.events.akad).toEqual({ event: 'akad', used: 0, cap: 80, remaining: 80, overCap: false })
    expect(summary.totalPax).toBe(0)
    expect(summary.guestCount).toBe(0)
    expect(summary.inviters).toHaveLength(3)
    expect(summary.waitlist.totalPax).toBe(0)
  })

  it('ignores a guest whose inviter is not in the caps list rather than inventing a row', () => {
    const summary = buildSummary([guest({ inviterKey: 'Om Budi' })], caps)
    expect(summary.inviters.map((i) => i.inviterKey)).toEqual(['Fatan', 'Mama Fatan', 'Sita'])
    // Side and event totals still count the guest: the seat is real either way.
    expect(summary.events.akad.used).toBe(2)
  })
})

describe('buildSummary printed invitations', () => {
  it('carries the provided per-side used and cap onto the side rows', () => {
    const summary = buildSummary([guest()], {
      ...caps,
      physicalUsedBySide: { fatan: 12, sita: 3 },
    })
    const fatan = summary.sides.find((s) => s.side === 'fatan')!
    expect(fatan.physicalUsed).toBe(12)
    expect(fatan.physicalCap).toBe(25)
    expect(fatan.physicalRemaining).toBe(13)
    const sita = summary.sides.find((s) => s.side === 'sita')!
    expect(sita.physicalUsed).toBe(3)
    expect(sita.physicalRemaining).toBe(22)
  })

  it('goes negative when a side printed more than its cap', () => {
    const summary = buildSummary([], { ...caps, physicalUsedBySide: { fatan: 26, sita: 0 } })
    expect(summary.sides.find((s) => s.side === 'fatan')!.physicalRemaining).toBe(-1)
  })

  it('keeps the numbers on the scoped side row for an inviter', () => {
    const summary = buildSummary([guest()], { ...caps, physicalUsedBySide: { fatan: 7, sita: 0 } })
    const scoped = scopeSummaryToInviter(summary, 'Fatan')
    expect(scoped.sides).toHaveLength(1)
    expect(scoped.sides[0].physicalUsed).toBe(7)
    expect(scoped.sides[0].physicalCap).toBe(25)
  })
})

describe('scopeSummaryToInviter', () => {
  function twoInviterPool(): SummaryGuest[] {
    return [
      guest({ id: 'f1', pax: 3 }),
      guest({ id: 'f2', pax: 2, isVip: true }),
      guest({ id: 'm1', pax: 6, inviterKey: 'Mama Fatan' }),
      guest({ id: 's1', pax: 4, side: 'sita', inviterKey: 'Sita' }),
    ]
  }

  it('rebuilds the event totals from that inviter own usage and caps', () => {
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan')
    expect(scoped.events.akad).toEqual({ event: 'akad', used: 5, cap: 20, remaining: 15, overCap: false })
    expect(scoped.events.resepsi).toEqual({ event: 'resepsi', used: 5, cap: 90, remaining: 85, overCap: false })
  })

  it('flags over cap against the inviter cap even when the event-wide cap still has room', () => {
    // 25 pax on Akad: over Fatan's cap of 20, well under the event-wide 80.
    const scoped = scopeSummaryToInviter(buildSummary([guest({ pax: 25 })], caps), 'Fatan')
    expect(scoped.events.akad.overCap).toBe(true)
    expect(scoped.events.akad.remaining).toBe(-5)
  })

  it('measures VIP as the whole side against the shared side cap, not the inviter own pax', () => {
    // VIP is the one cap that is per side, so pairing this inviter's own 2 pax
    // with the side's cap of 25 would report 23 left when the side may have
    // none. The side-wide figure is supplied by the caller because an
    // inviter's own RLS view cannot see the other inviters' guests.
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan', 26)
    expect(scoped.events.vip).toEqual({ event: 'vip', used: 26, cap: 25, remaining: -1, overCap: true })
  })

  it('keeps the inviter own VIP pax alongside the side total', () => {
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan', 26)
    expect(scoped.ownVipUsed).toBe(2)
  })

  it('marks the VIP total unknown when the side figure is unavailable', () => {
    // The caller could not reach the side-wide aggregate. Reporting the
    // inviter's own pax against the side cap would be the original defect, so
    // the flag lets the screen decline to draw a meter it cannot justify.
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan', null)
    expect(scoped.vipTotalKnown).toBe(false)
    expect(scoped.ownVipUsed).toBe(2)
  })

  it('reports the VIP total as known once the side figure is supplied', () => {
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan', 26)
    expect(scoped.vipTotalKnown).toBe(true)
  })

  it('keeps only that inviter rows and their side', () => {
    const scoped = scopeSummaryToInviter(buildSummary(twoInviterPool(), caps), 'Fatan')
    expect(scoped.inviters.map((i) => i.inviterKey)).toEqual(['Fatan'])
    expect(scoped.sides.map((s) => s.side)).toEqual(['fatan'])
    expect(scoped.waitlist.byInviter.map((r) => r.inviterKey)).toEqual(['Fatan'])
  })

  it('leaves the summary untouched for an unknown inviter key', () => {
    const summary = buildSummary(twoInviterPool(), caps)
    const scoped = scopeSummaryToInviter(summary, 'Om Budi')
    expect(scoped.events).toEqual(summary.events)
    expect(scoped.sides).toEqual(summary.sides)
    expect(scoped.inviters).toEqual([])
  })
})

describe('scopeSummaryToSide', () => {
  function bothSidesPool(): SummaryGuest[] {
    return [
      guest({ id: 'f1', pax: 3 }),
      guest({ id: 'f2', pax: 2, isVip: true, inviterKey: 'Mama Fatan' }),
      guest({ id: 's1', pax: 4, side: 'sita', inviterKey: 'Sita' }),
    ]
  }

  it('keeps only that side row and that side inviters', () => {
    const scoped = scopeSummaryToSide(buildSummary(bothSidesPool(), caps), 'fatan')
    expect(scoped.sides.map((s) => s.side)).toEqual(['fatan'])
    expect(scoped.inviters.map((i) => i.inviterKey)).toEqual(['Fatan', 'Mama Fatan'])
    expect(scoped.waitlist.byInviter.map((r) => r.inviterKey)).toEqual(['Fatan', 'Mama Fatan'])
  })

  it('rebuilds event totals from the side caps and usage', () => {
    const scoped = scopeSummaryToSide(buildSummary(bothSidesPool(), caps), 'fatan')
    // fatan akad cap 20 + 40, used 5; resepsi cap 90 + 80, used 5.
    expect(scoped.events.akad).toEqual({ event: 'akad', used: 5, cap: 60, remaining: 55, overCap: false })
    expect(scoped.events.resepsi).toEqual({ event: 'resepsi', used: 5, cap: 170, remaining: 165, overCap: false })
    expect(scoped.events.vip).toEqual({ event: 'vip', used: 2, cap: 25, remaining: 23, overCap: false })
  })

  it('flags over cap against the side cap even when the venue-wide cap has room', () => {
    // 70 pax on fatan akad: over the side's 60, under the venue's 80.
    const scoped = scopeSummaryToSide(buildSummary([guest({ pax: 70 })], caps), 'fatan')
    expect(scoped.events.akad.overCap).toBe(true)
    expect(scoped.events.akad.remaining).toBe(-10)
  })

  it('leaves the summary untouched for an unknown side', () => {
    const summary = buildSummary(bothSidesPool(), caps)
    const scoped = scopeSummaryToSide(summary, 'unknown' as never)
    expect(scoped.events).toEqual(summary.events)
    expect(scoped.sides).toEqual(summary.sides)
    expect(scoped.inviters).toEqual([])
  })
})

describe('slotOpportunities', () => {
  function withWaitlist(): SummaryGuest[] {
    return [
      // Fatan: 2 pax seated on both events, 4 pax waiting on Resepsi only.
      guest({ id: 'seated', pax: 2 }),
      guest({
        id: 'waiting',
        pax: 4,
        events: [{ event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }],
      }),
    ]
  }

  it('reports an inviter and event with both room left and somebody waiting', () => {
    const offers = slotOpportunities(buildSummary(withWaitlist(), caps))
    expect(offers).toEqual([
      { inviterKey: 'Fatan', side: 'fatan', event: 'resepsi', remaining: 88, waitingPax: 4 },
    ])
  })

  it('stays silent when the pool is empty', () => {
    expect(slotOpportunities(buildSummary([guest()], caps))).toEqual([])
  })

  it('stays silent when the inviter is over cap, since there is no slot to fill', () => {
    const overloaded = [
      ...Array.from({ length: 12 }, (_, i) => guest({ id: `g${i}`, pax: 8 })),
      guest({
        id: 'waiting',
        pax: 2,
        events: [{ event: 'akad', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }],
      }),
    ]
    const summary = buildSummary(overloaded, caps)
    expect(summary.inviters.find((i) => i.inviterKey === 'Fatan')?.akadRemaining).toBeLessThan(0)
    expect(slotOpportunities(summary).filter((offer) => offer.event === 'akad')).toEqual([])
  })
})
