import { describe, it, expect } from 'vitest'
import { checkQuota } from './quota'

describe('checkQuota', () => {
  it('allows and reports remaining capacity when comfortably under cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 10 }, 5)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 25, overBy: 0 })
  })

  it('allows and reports zero remaining when landing exactly on cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 35 }, 5)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 0, overBy: 0 })
  })

  it('still allows, but flags over-cap, when the addition exceeds cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 38 }, 5)
    expect(result).toEqual({ allowed: true, overCap: true, remaining: -3, overBy: 3 })
  })

  it('flags over-cap when the state was already over before this write', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 65 }, 0)
    expect(result).toEqual({ allowed: true, overCap: true, remaining: -25, overBy: 25 })
  })

  it('a negative addingPax (a decline freeing pax) always reports allowed and never over', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 42 }, -10)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 8, overBy: 0 })
  })
})
