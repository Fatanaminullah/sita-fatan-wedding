import { describe, it, expect } from 'vitest'
import { buildCascade, checkPromotion, pickCascadeAnchor, type WaitlistedGuest } from './waitlist'

const guest = (over: Partial<WaitlistedGuest>): WaitlistedGuest => ({
  guestId: 'g1',
  inviterKey: 'Fatan',
  side: 'fatan',
  pax: 1,
  waitlistRank: null,
  ...over,
})

describe('buildCascade', () => {
  it('orders same-inviter before same-side before global', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'global', inviterKey: 'Papa Sita', side: 'sita' }),
      guest({ guestId: 'same-side', inviterKey: 'Mama Fatan', side: 'fatan' }),
      guest({ guestId: 'same-inviter', inviterKey: 'Fatan', side: 'fatan' }),
    ]

    const offers = buildCascade(pool, { inviterKey: 'Fatan', side: 'fatan' })

    expect(offers.map((o) => o.guest.guestId)).toEqual(['same-inviter', 'same-side', 'global'])
    expect(offers.map((o) => o.tier)).toEqual(['same_inviter', 'same_side', 'global'])
  })

  it('sorts within a tier by waitlistRank ascending, nulls last', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'no-rank', inviterKey: 'Fatan', waitlistRank: null }),
      guest({ guestId: 'rank-2', inviterKey: 'Fatan', waitlistRank: 2 }),
      guest({ guestId: 'rank-1', inviterKey: 'Fatan', waitlistRank: 1 }),
    ]

    const offers = buildCascade(pool, { inviterKey: 'Fatan', side: 'fatan' })

    expect(offers.map((o) => o.guest.guestId)).toEqual(['rank-1', 'rank-2', 'no-rank'])
  })

  it('an empty pool produces an empty cascade', () => {
    expect(buildCascade([], { inviterKey: 'Fatan', side: 'fatan' })).toEqual([])
  })
})

describe('pickCascadeAnchor', () => {
  it('picks the lowest waitlistRank as the anchor', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'rank-3', inviterKey: 'Papa Sita', side: 'sita', waitlistRank: 3 }),
      guest({ guestId: 'rank-1', inviterKey: 'Mama Fatan', side: 'fatan', waitlistRank: 1 }),
    ]

    expect(pickCascadeAnchor(pool)).toEqual({ inviterKey: 'Mama Fatan', side: 'fatan' })
  })

  it('treats an unranked guest as last, so a ranked one anchors', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'no-rank', inviterKey: 'Papa Sita', side: 'sita', waitlistRank: null }),
      guest({ guestId: 'rank-9', inviterKey: 'Fatan', side: 'fatan', waitlistRank: 9 }),
    ]

    expect(pickCascadeAnchor(pool)).toEqual({ inviterKey: 'Fatan', side: 'fatan' })
  })

  it('falls back to the first entry when nobody is ranked', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'a', inviterKey: 'Mama Sita', side: 'sita', waitlistRank: null }),
      guest({ guestId: 'b', inviterKey: 'Fatan', side: 'fatan', waitlistRank: null }),
    ]

    expect(pickCascadeAnchor(pool)).toEqual({ inviterKey: 'Mama Sita', side: 'sita' })
  })

  it('returns null for an empty pool', () => {
    expect(pickCascadeAnchor([])).toBeNull()
  })
})

describe('checkPromotion', () => {
  it('allows and reports remaining after when there is enough room', () => {
    const result = checkPromotion(10, 3)
    expect(result).toEqual({ allowed: true, overCap: false, remainingAfter: 7 })
  })

  it('still allows, but flags over-cap, when promoting exceeds remaining room', () => {
    const result = checkPromotion(2, 5)
    expect(result).toEqual({ allowed: true, overCap: true, remainingAfter: -3 })
  })
})
