import { describe, it, expect } from 'vitest'
import { checkQuota, heldPax } from './quota'

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

describe('heldPax', () => {
  const invite = (over: Partial<Parameters<typeof heldPax>[0]> = {}) => ({
    inviteStatus: 'confirmed' as const,
    rsvpStatus: 'pending' as const,
    paxConfirmed: null,
    ...over,
  })

  it('holds the whole invitation until they answer', () => {
    expect(heldPax(invite(), 2)).toBe(2)
  })

  it('holds only the confirmed number once they said yes with fewer', () => {
    expect(heldPax(invite({ rsvpStatus: 'attending', paxConfirmed: 1 }), 2)).toBe(1)
  })

  it('holds the invitation for a yes with no number', () => {
    expect(heldPax(invite({ rsvpStatus: 'attending', paxConfirmed: null }), 2)).toBe(2)
  })

  it('never holds more than the invitation, even if pax was lowered after the answer', () => {
    expect(heldPax(invite({ rsvpStatus: 'attending', paxConfirmed: 3 }), 2)).toBe(2)
  })

  it('holds nothing for a decline', () => {
    expect(heldPax(invite({ rsvpStatus: 'not_attending' }), 2)).toBe(0)
  })

  it('holds nothing for a waitlisted or missing invitation', () => {
    expect(heldPax(invite({ inviteStatus: 'waitlisted' }), 2)).toBe(0)
    expect(heldPax(null, 2)).toBe(0)
  })
})
