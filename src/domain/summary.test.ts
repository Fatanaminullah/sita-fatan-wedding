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

describe('buildSummary invited against answered', () => {
  it('counts the pax invited, the pax coming, and what has been given back', () => {
    const summary = buildSummary(
      [
        // Answered yes, and with fewer than were kept for them: two seats back.
        guest({ id: 'trimmed', pax: 5, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 3 },
        ] }),
        // Answered yes for everyone kept.
        guest({ id: 'whole', pax: 2, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 },
        ] }),
        // Answered no: the whole party is back.
        guest({ id: 'no', pax: 4, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending', paxConfirmed: null },
        ] }),
        // Silent: still holding what was kept.
        guest({ id: 'silent', pax: 3, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending', paxConfirmed: null },
        ] }),
        // Waiting for a seat, so not invited at all yet.
        guest({ id: 'waiting', pax: 9, events: [
          { event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending', paxConfirmed: null },
        ] }),
      ],
      caps
    )
    expect(summary.answered.resepsi).toEqual({
      invitedPax: 14,
      attendingPax: 5,
      declinedPax: 4,
      pendingPax: 3,
      freedPax: 6,
    })
  })

  it('takes the answer at its word when a guest never said a number', () => {
    // An admin can mark a guest as coming without touching pax; the seats
    // kept for them are what they hold.
    const summary = buildSummary(
      [
        guest({ id: 'no-number', pax: 4, events: [
          { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: null },
        ] }),
      ],
      caps
    )
    expect(summary.answered.akad.attendingPax).toBe(4)
    expect(summary.answered.akad.freedPax).toBe(0)
  })

  it('reports both events apart, because a guest may answer one and not the other', () => {
    const summary = buildSummary(
      [
        guest({ id: 'half', pax: 2, events: [
          { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 },
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending', paxConfirmed: null },
        ] }),
      ],
      caps
    )
    expect(summary.answered.akad).toMatchObject({ attendingPax: 2, pendingPax: 0 })
    expect(summary.answered.resepsi).toMatchObject({ attendingPax: 0, pendingPax: 2 })
  })
})

describe('buildSummary answers per inviter', () => {
  it('says who gave a seat back, so the cascade can be read off it', () => {
    const summary = buildSummary(
      [
        guest({ id: 'a', inviterKey: 'Fatan', side: 'fatan', pax: 4, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending', paxConfirmed: null },
        ] }),
        guest({ id: 'b', inviterKey: 'Fatan', side: 'fatan', pax: 5, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 },
        ] }),
        guest({ id: 'c', inviterKey: 'Sita', side: 'sita', pax: 3, events: [
          { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending', paxConfirmed: null },
        ] }),
      ],
      caps
    )
    const fatan = summary.answeredByInviter.find((row) => row.inviterKey === 'Fatan')!
    expect(fatan.resepsi).toEqual({
      invitedPax: 9,
      attendingPax: 2,
      declinedPax: 4,
      pendingPax: 0,
      freedPax: 7,
    })
    const sita = summary.answeredByInviter.find((row) => row.inviterKey === 'Sita')!
    expect(sita.resepsi).toMatchObject({ invitedPax: 3, pendingPax: 3, freedPax: 0 })
  })

  it('keeps an inviter with nothing back in the list, at zero', () => {
    const summary = buildSummary([], caps)
    expect(summary.answeredByInviter.map((row) => row.inviterKey)).toEqual([
      'Fatan',
      'Mama Fatan',
      'Sita',
    ])
    expect(summary.answeredByInviter[0].akad.freedPax).toBe(0)
  })

  it('adds up to the wedding-wide figures', () => {
    const summary = buildSummary(
      [
        guest({ id: 'a', inviterKey: 'Fatan', side: 'fatan', pax: 2, events: [
          { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 },
        ] }),
        guest({ id: 'b', inviterKey: 'Sita', side: 'sita', pax: 3, events: [
          { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'not_attending', paxConfirmed: null },
        ] }),
      ],
      caps
    )
    const sum = (pick: (row: (typeof summary.answeredByInviter)[number]) => number) =>
      summary.answeredByInviter.reduce((total, row) => total + pick(row), 0)
    expect(sum((row) => row.akad.invitedPax)).toBe(summary.answered.akad.invitedPax)
    expect(sum((row) => row.akad.freedPax)).toBe(summary.answered.akad.freedPax)
  })
})

describe('scoping the answers per inviter', () => {
  const rows = () =>
    buildSummary(
      [
        guest({ id: 'a', inviterKey: 'Fatan', side: 'fatan', pax: 2 }),
        guest({ id: 'b', inviterKey: 'Sita', side: 'sita', pax: 2 }),
      ],
      caps
    )

  it('shows an inviter only their own row', () => {
    const scoped = scopeSummaryToInviter(rows(), 'Fatan')
    expect(scoped.answeredByInviter.map((row) => row.inviterKey)).toEqual(['Fatan'])
  })

  it('shows a side admin only that side', () => {
    const scoped = scopeSummaryToSide(rows(), 'sita')
    expect(scoped.answeredByInviter.map((row) => row.inviterKey)).toEqual(['Sita'])
  })
})

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

  /*
   * Three of Fatan's friends were invited for two and answered that only one
   * is coming. The meter read 12 of 9 and turned red, while the real number
   * expected through the door was nine: exactly the cap.
   *
   * A seat somebody has told us they will not use is not a seat. Holding it
   * overstates the room twice over, once by crying over-capacity when there is
   * none, and once by hiding space the waiting list could have had.
   */
  it('counts the answered number, not the invited one, once a guest has replied', () => {
    const partial = guest({
      pax: 2,
      events: [
        { event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 },
        { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 },
      ],
    })
    const summary = buildSummary([partial], caps)
    expect(summary.events.akad.used).toBe(1)
    expect(summary.events.resepsi.used).toBe(1)
  })

  it('still holds the whole invitation for a guest who has not answered', () => {
    const summary = buildSummary([guest({ pax: 2 })], caps)
    expect(summary.events.akad.used).toBe(2)
  })

  it('treats a yes with no number as everyone kept for them', () => {
    const yesNoNumber = guest({
      pax: 3,
      events: [{ event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: null }],
    })
    expect(buildSummary([yesNoNumber], caps).events.akad.used).toBe(3)
  })

  it('frees the seats per inviter too, not only for the wedding', () => {
    const partial = guest({
      pax: 2,
      events: [{ event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 }],
    })
    const summary = buildSummary([partial], caps)
    const fatan = summary.inviters.find((row) => row.inviterKey === 'Fatan')
    expect(fatan?.akadUsed).toBe(1)
    expect(summary.sides.find((row) => row.side === 'fatan')?.akadUsed).toBe(1)
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
    expect(summary.entryCounts).toEqual({
      akad: 2,
      resepsi: 2,
      akadOnly: 1,
      resepsiOnly: 1,
      both: 1,
      unique: 3,
    })
  })

  it('splits the entries into the three souvenir populations', () => {
    const summary = buildSummary(
      [
        guest({ id: 'both-1' }),
        guest({ id: 'both-2' }),
        guest({ id: 'akad-only', events: [{ event: 'akad', inviteStatus: 'confirmed', rsvpStatus: 'pending' }] }),
        resepsiOnly({ id: 'resepsi-1' }),
        resepsiOnly({ id: 'resepsi-2' }),
        resepsiOnly({ id: 'resepsi-3' }),
        // Waiting for a seat is not holding one, so no bag is packed for them.
        guest({
          id: 'waiting',
          events: [{ event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }],
        }),
      ],
      caps
    )
    expect(summary.entryCounts.akadOnly).toBe(1)
    expect(summary.entryCounts.resepsiOnly).toBe(3)
    expect(summary.entryCounts.both).toBe(2)
    // The three populations partition the unique entries exactly.
    expect(
      summary.entryCounts.akadOnly + summary.entryCounts.resepsiOnly + summary.entryCounts.both
    ).toBe(summary.entryCounts.unique)
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

  it('counts an inviter phone coverage over every entry they own, waitlisted included', () => {
    const summary = buildSummary(
      [
        guest({ id: 'a', hasPhone: true }),
        guest({ id: 'b', hasPhone: false }),
        guest({
          id: 'c',
          hasPhone: false,
          events: [{ event: 'resepsi', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }],
        }),
        guest({ id: 'd', hasPhone: true, inviterKey: 'Sita', side: 'sita' }),
      ],
      caps
    )
    // A waiting guest still needs a number: they are messaged the moment a
    // seat frees up, so they belong in the denominator. `guests` counts only
    // seated entries and cannot be that denominator.
    expect(summary.inviters.find((i) => i.inviterKey === 'Fatan')?.phone).toEqual({
      withPhone: 1,
      missing: 2,
      total: 3,
    })
    expect(summary.inviters.find((i) => i.inviterKey === 'Sita')?.phone).toEqual({
      withPhone: 1,
      missing: 0,
      total: 1,
    })
    expect(summary.inviters.find((i) => i.inviterKey === 'Mama Fatan')?.phone).toEqual({
      withPhone: 0,
      missing: 0,
      total: 0,
    })
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

describe('the RSVP sweep', () => {
  const answered = (event: 'akad' | 'resepsi', status: 'attending' | 'not_attending') => ({
    event,
    inviteStatus: 'confirmed' as const,
    rsvpStatus: status,
  })
  const unanswered = (event: 'akad' | 'resepsi') => ({
    event,
    inviteStatus: 'confirmed' as const,
    rsvpStatus: 'pending' as const,
  })

  it('counts a guest with no answer as unanswered', () => {
    const s = buildSummary([guest({ events: [unanswered('resepsi')] })], caps)
    expect(s.rsvp).toMatchObject({ unanswered: 1, answered: 0, total: 1 })
  })

  it('counts a guest who answered as answered', () => {
    const s = buildSummary([guest({ events: [answered('resepsi', 'attending')] })], caps)
    expect(s.rsvp).toMatchObject({ unanswered: 0, answered: 1, total: 1 })
  })

  it('counts a decline as answered', () => {
    // The sweep asks whether we know, not whether they are coming.
    const s = buildSummary([guest({ events: [answered('resepsi', 'not_attending')] })], caps)
    expect(s.rsvp.answered).toBe(1)
  })

  // The case a naive count misses: they will still be refused at the other door.
  it('counts a half-answered guest as unanswered', () => {
    const s = buildSummary(
      [guest({ events: [answered('akad', 'attending'), unanswered('resepsi')] })],
      caps
    )
    expect(s.rsvp).toMatchObject({ unanswered: 1, answered: 0 })
  })

  it('counts a guest answered on both events as answered', () => {
    const s = buildSummary(
      [guest({ events: [answered('akad', 'attending'), answered('resepsi', 'not_attending')] })],
      caps
    )
    expect(s.rsvp.answered).toBe(1)
  })

  // Otherwise the sweep is a number that can never reach zero.
  it('leaves a guest invited to nothing out of the sweep entirely', () => {
    const s = buildSummary([guest({ events: [] })], caps)
    expect(s.rsvp).toMatchObject({ unanswered: 0, answered: 0, total: 0, invitedToNothing: 1 })
  })

  it('still counts an unanswered waitlisted guest', () => {
    // They can be promoted, and then they need an answer like anyone else.
    const s = buildSummary(
      [guest({ events: [{ event: 'akad', inviteStatus: 'waitlisted', rsvpStatus: 'pending' }] })],
      caps
    )
    expect(s.rsvp.unanswered).toBe(1)
  })

  it('reports the headcount behind the unanswered entries', () => {
    // Forty entries can be a hundred people; the pax figure is what makes the
    // size of the remaining work legible.
    const s = buildSummary(
      [
        guest({ id: 'a', pax: 4, events: [unanswered('resepsi')] }),
        guest({ id: 'b', pax: 3, events: [unanswered('resepsi')] }),
        guest({ id: 'c', pax: 9, events: [answered('resepsi', 'attending')] }),
      ],
      caps
    )
    expect(s.rsvp.unanswered).toBe(2)
    expect(s.rsvp.unansweredPax).toBe(7)
  })

  it('attributes unanswered entries to the inviter who owns them', () => {
    const s = buildSummary(
      [
        guest({ id: 'a', inviterKey: 'Fatan', events: [unanswered('resepsi')] }),
        guest({ id: 'b', inviterKey: 'Fatan', events: [answered('resepsi', 'attending')] }),
        guest({ id: 'c', inviterKey: 'Mama Fatan', events: [unanswered('akad')] }),
      ],
      caps
    )
    const fatan = s.inviters.find((i) => i.inviterKey === 'Fatan')
    const mama = s.inviters.find((i) => i.inviterKey === 'Mama Fatan')
    expect(fatan?.unanswered).toBe(1)
    expect(mama?.unanswered).toBe(1)
    expect(s.inviters.find((i) => i.inviterKey === 'Sita')?.unanswered).toBe(0)
  })
})

describe('the sweep under scoping', () => {
  // The Unscoped Lookup Rule: `inviters` comes from a lookup table everyone
  // can read, so an out-of-scope inviter would otherwise render as a
  // legitimate-looking zero rather than being absent.
  it('shows an inviter only their own row', () => {
    const summary = buildSummary(
      [
        guest({
          id: 'a',
          inviterKey: 'Fatan',
          events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending' }],
        }),
      ],
      caps
    )
    const scoped = scopeSummaryToInviter(summary, 'Fatan')
    expect(scoped.inviters.map((i) => i.inviterKey)).toEqual(['Fatan'])
    expect(scoped.inviters[0].unanswered).toBe(1)
  })

  it('shows a side admin only their own side', () => {
    const summary = buildSummary(
      [
        guest({
          id: 'a',
          side: 'fatan',
          inviterKey: 'Fatan',
          events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending' }],
        }),
      ],
      caps
    )
    const scoped = scopeSummaryToSide(summary, 'fatan')
    expect(scoped.inviters.every((i) => i.side === 'fatan')).toBe(true)
    expect(scoped.inviters.some((i) => i.inviterKey === 'Sita')).toBe(false)
  })

  // The headline figure needs no scoping of its own: it is built from rows RLS
  // already filtered, the same way the phone coverage figure is. This pins
  // that, so nobody later "fixes" it by double-scoping and halving the count.
  it('leaves the headline count alone, because RLS already scoped the rows', () => {
    const summary = buildSummary(
      [
        guest({
          id: 'a',
          inviterKey: 'Fatan',
          events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'pending' }],
        }),
      ],
      caps
    )
    expect(scopeSummaryToInviter(summary, 'Fatan').rsvp).toEqual(summary.rsvp)
  })
})

describe('the delivery funnel', () => {
  const confirmed = (rsvpStatus: 'pending' | 'attending') => [
    { event: 'resepsi' as const, inviteStatus: 'confirmed' as const, rsvpStatus },
  ]

  it('counts nobody before the invitation goes out', () => {
    const s = buildSummary([guest({ events: confirmed('pending') })], caps)
    expect(s.funnel).toMatchObject({ sent: 0, opened: 0, answered: 0 })
  })

  // Otherwise the 97 guests with no phone look like people ignoring a message
  // that was never sent to them.
  it('measures only guests the invitation was actually sent to', () => {
    const s = buildSummary(
      [
        guest({ id: 'a', invitedAt: '2026-09-01T10:00:00+07:00', events: confirmed('pending') }),
        guest({ id: 'b', events: confirmed('pending') }),
      ],
      caps
    )
    expect(s.funnel.sent).toBe(1)
  })

  it('counts an open', () => {
    const s = buildSummary(
      [
        guest({
          invitedAt: '2026-09-01T10:00:00+07:00',
          firstOpenedAt: '2026-09-01T11:00:00+07:00',
          events: confirmed('pending'),
        }),
      ],
      caps
    )
    expect(s.funnel).toMatchObject({ sent: 1, opened: 1, sentNotOpened: 0 })
  })

  it('counts a guest who never opened it', () => {
    const s = buildSummary(
      [guest({ invitedAt: '2026-09-01T10:00:00+07:00', events: confirmed('pending') })],
      caps
    )
    expect(s.funnel).toMatchObject({ opened: 0, sentNotOpened: 1 })
  })

  // The row the whole funnel exists for.
  it('separates opened-but-silent from never-opened', () => {
    const s = buildSummary(
      [
        guest({
          id: 'looked',
          invitedAt: '2026-09-01T10:00:00+07:00',
          firstOpenedAt: '2026-09-01T11:00:00+07:00',
          events: confirmed('pending'),
        }),
        guest({
          id: 'ignored',
          invitedAt: '2026-09-01T10:00:00+07:00',
          events: confirmed('pending'),
        }),
      ],
      caps
    )
    expect(s.funnel.openedNotAnswered).toBe(1)
    expect(s.funnel.sentNotOpened).toBe(1)
  })

  it('stops counting someone once they answer', () => {
    const s = buildSummary(
      [
        guest({
          invitedAt: '2026-09-01T10:00:00+07:00',
          firstOpenedAt: '2026-09-01T11:00:00+07:00',
          events: confirmed('attending'),
        }),
      ],
      caps
    )
    expect(s.funnel.answered).toBe(1)
    expect(s.funnel.openedNotAnswered).toBe(0)
  })
})


describe('how far the invitation got, per guest', () => {
  /*
   * Five buckets, and every guest who was sent an invitation lands in exactly
   * one. A card whose rows do not add up is worse than no card, so this is a
   * partition rather than five overlapping questions.
   *
   * Precedence runs downwards from the strongest evidence: an answer settles
   * it however they arrived at it, then an opened link, then Meta's read
   * receipt, then delivery.
   */
  const sent = { invitedAt: '2026-09-22T13:00:00Z' }

  it('counts an answer above everything else, even without an open', () => {
    const answered = guest({
      ...sent,
      inviteStatus: 'delivered',
      firstOpenedAt: null,
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 }],
    })
    const p = buildSummary([answered], caps).invitationProgress
    expect(p.answered).toBe(1)
    expect(p.deliveredNotRead).toBe(0)
    expect(p.openedNotAnswered).toBe(0)
  })

  it('separates opened-and-silent from read-and-never-opened', () => {
    const opened = guest({
      ...sent,
      id: 'a',
      inviteStatus: 'delivered',
      firstOpenedAt: '2026-09-22T14:00:00Z',
    })
    const readOnly = guest({ ...sent, id: 'b', inviteStatus: 'read', firstOpenedAt: null })
    const p = buildSummary([opened, readOnly], caps).invitationProgress
    expect(p.openedNotAnswered).toBe(1)
    expect(p.readNotOpened).toBe(1)
  })

  /*
   * The bucket this exists to expose: delivered, no read receipt, never
   * opened. Nothing is known beyond the message arriving on the phone.
   */
  it('counts a guest stuck on delivered', () => {
    const stuck = guest({ ...sent, inviteStatus: 'delivered', firstOpenedAt: null })
    expect(buildSummary([stuck], caps).invitationProgress.deliveredNotRead).toBe(1)
  })

  it('keeps a message that has not arrived out of the delivered bucket', () => {
    const inFlight = guest({ ...sent, inviteStatus: 'sent', firstOpenedAt: null })
    const p = buildSummary([inFlight], caps).invitationProgress
    expect(p.notYetDelivered).toBe(1)
    expect(p.deliveredNotRead).toBe(0)
  })

  it('ignores a guest who was never sent one', () => {
    const neverSent = guest({ invitedAt: null, firstOpenedAt: null, inviteStatus: null })
    const p = buildSummary([neverSent], caps).invitationProgress
    expect(p.sent).toBe(0)
    expect(p.notYetDelivered).toBe(0)
  })

  it('adds up: every sent guest is in exactly one bucket', () => {
    const rows = [
      guest({ ...sent, id: 'a', inviteStatus: 'delivered', firstOpenedAt: null }),
      guest({ ...sent, id: 'b', inviteStatus: 'read', firstOpenedAt: null }),
      guest({ ...sent, id: 'c', inviteStatus: 'delivered', firstOpenedAt: '2026-09-22T14:00:00Z' }),
      guest({ ...sent, id: 'd', inviteStatus: 'sent', firstOpenedAt: null }),
      guest({
        ...sent,
        id: 'e',
        inviteStatus: 'read',
        firstOpenedAt: '2026-09-22T14:00:00Z',
        events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending' }],
      }),
      guest({ id: 'f', invitedAt: null, firstOpenedAt: null, inviteStatus: null }),
    ]
    const p = buildSummary(rows, caps).invitationProgress
    expect(p.sent).toBe(5)
    expect(
      p.answered + p.openedNotAnswered + p.readNotOpened + p.deliveredNotRead + p.notYetDelivered
    ).toBe(p.sent)
  })
})


describe('the most recent answers', () => {
  /*
   * "Who has just replied" is a question the couple ask constantly while a
   * wave is out, and the dashboard could only answer it in aggregate.
   */
  const at = (iso: string) => ({
    events: [
      { event: 'resepsi' as const, inviteStatus: 'confirmed' as const, rsvpStatus: 'attending' as const, paxConfirmed: 2, respondedAt: iso },
    ],
  })

  it('takes the newest first', () => {
    const rows = [
      guest({ id: 'old', name: 'Old', ...at('2026-09-20T10:00:00Z') }),
      guest({ id: 'new', name: 'New', ...at('2026-09-24T10:00:00Z') }),
      guest({ id: 'mid', name: 'Mid', ...at('2026-09-22T10:00:00Z') }),
    ]
    expect(buildSummary(rows, caps).latestAnswers.map((r) => r.guestId)).toEqual(['new', 'mid', 'old'])
  })

  it('keeps five at most', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      guest({ id: `g${i}`, name: `G${i}`, ...at(`2026-09-${10 + i}T10:00:00Z`) })
    )
    expect(buildSummary(rows, caps).latestAnswers).toHaveLength(5)
  })

  it('leaves out a guest who has not answered', () => {
    const silent = guest({ id: 'silent' })
    expect(buildSummary([silent], caps).latestAnswers).toHaveLength(0)
  })

  /* A decline is an answer, and often the one worth seeing soonest. */
  it('counts a no', () => {
    const declined = guest({
      id: 'no',
      events: [
        { event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending', respondedAt: '2026-09-24T10:00:00Z' },
      ],
    })
    const [row] = buildSummary([declined], caps).latestAnswers
    expect(row?.attending).toBe(false)
  })
})


describe('the VIP tier, answered against held', () => {
  /*
   * VIP is a tier inside the Resepsi, so a VIP guest's answer is their Resepsi
   * answer. The meter without this reads 32 of 50 and looks two thirds spent
   * while seven of those pax have actually said yes.
   */
  const vipGuest = (over = {}) =>
    guest({
      isVip: true,
      events: [{ event: 'resepsi' as const, inviteStatus: 'confirmed' as const, rsvpStatus: 'pending' as const }],
      ...over,
    })

  it('splits the tier by the Resepsi answer', () => {
    const coming = vipGuest({
      id: 'a',
      pax: 2,
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 }],
    })
    const silent = vipGuest({ id: 'b', pax: 3 })
    const v = buildSummary([coming, silent], caps).vipAnswered
    expect(v.attendingPax).toBe(2)
    expect(v.pendingPax).toBe(3)
  })

  it('honours a smaller yes, as the seat count does', () => {
    const partial = vipGuest({
      id: 'a',
      pax: 4,
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 1 }],
    })
    expect(buildSummary([partial], caps).vipAnswered.attendingPax).toBe(1)
  })

  it('leaves out a guest who is not VIP', () => {
    const ordinary = guest({
      isVip: false,
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'attending', paxConfirmed: 2 }],
    })
    expect(buildSummary([ordinary], caps).vipAnswered.attendingPax).toBe(0)
  })

  /* A decline is not held, so it is in neither half. */
  it('leaves out a guest who declined', () => {
    const declined = vipGuest({
      events: [{ event: 'resepsi', inviteStatus: 'confirmed', rsvpStatus: 'not_attending' }],
    })
    const v = buildSummary([declined], caps).vipAnswered
    expect(v.attendingPax + v.pendingPax).toBe(0)
  })
})
