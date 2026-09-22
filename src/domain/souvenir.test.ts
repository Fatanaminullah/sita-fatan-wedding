import { describe, expect, it } from 'vitest'
import { canClaim, claimChannel } from './souvenir'

describe('claimChannel', () => {
  it('records an Akad claim as coming from the tick-list table', () => {
    expect(claimChannel('akad')).toBe('akad_table')
  })

  it('records a Resepsi claim as coming from the scan station', () => {
    expect(claimChannel('resepsi')).toBe('resepsi_scan')
  })
})

describe('canClaim', () => {
  it('allows a first claim at the Akad', () => {
    expect(canClaim({ event: 'akad', existingClaim: null })).toEqual({
      allowed: true,
      via: 'akad_table',
    })
  })

  it('allows a first claim at the Resepsi', () => {
    expect(canClaim({ event: 'resepsi', existingClaim: null })).toEqual({
      allowed: true,
      via: 'resepsi_scan',
    })
  })

  // The Akad-skipper. Invited to both, did not come to the Akad, collects here.
  it('allows the Resepsi claim of a guest who skipped the Akad', () => {
    expect(canClaim({ event: 'resepsi', existingClaim: null })).toEqual({
      allowed: true,
      via: 'resepsi_scan',
    })
  })

  // The other half of the same rule: one souvenir per guest, not per event.
  it('refuses a second souvenir at the Resepsi to someone who collected at the Akad', () => {
    const decision = canClaim({
      event: 'resepsi',
      existingClaim: { claimedAt: '2026-10-10T09:12:00+07:00', claimedVia: 'akad_table' },
    })
    expect(decision).toEqual({
      allowed: false,
      reason: 'already_claimed',
      claimedAt: '2026-10-10T09:12:00+07:00',
      claimedVia: 'akad_table',
    })
  })

  it('reports where and when an earlier claim happened, so the table can say so', () => {
    const decision = canClaim({
      event: 'resepsi',
      existingClaim: { claimedAt: '2026-10-10T19:40:00+07:00', claimedVia: 'resepsi_scan' },
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.claimedVia).toBe('resepsi_scan')
      expect(decision.claimedAt).toBe('2026-10-10T19:40:00+07:00')
    }
  })

  it('does not care about party size: one entry is one souvenir', () => {
    // pax never enters the decision. This test exists to pin that down, because
    // "one per guest, not per pax" is the rule most likely to be misread later.
    const first = canClaim({ event: 'akad', existingClaim: null })
    expect(first).toEqual({ allowed: true, via: 'akad_table' })
  })
})
