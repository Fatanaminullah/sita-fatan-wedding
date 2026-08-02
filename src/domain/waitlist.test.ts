import { describe, it, expect } from 'vitest'
import { buildCascade, checkPromotion, type WaitlistedGuest } from './waitlist'

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
