import { describe, expect, it } from 'vitest'
import { resolveScan, resolveSouvenirScan, type DoorGuest } from './checkin'

/** Invented names throughout: never a real guest row (CLAUDE.md). */
function guest(over: Partial<DoorGuest> = {}): DoorGuest {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Guest',
    pax: 2,
    isVip: false,
    inviterKey: 'Fatan',
    inviteStatus: 'confirmed',
    rsvpStatus: 'attending',
    paxConfirmed: 2,
    checkedInAt: null,
    checkedInByName: null,
    souvenirClaimedAt: null,
    souvenirClaimedVia: null,
    ...over,
  }
}

describe('resolveScan', () => {
  it('admits a confirmed guest who is attending', () => {
    const d = resolveScan({ guest: guest(), event: 'resepsi' })
    expect(d.outcome).toBe('admit')
    expect(d.canAdmit).toBe(true)
  })

  it('refuses to admit someone twice and names who let them in', () => {
    const d = resolveScan({
      guest: guest({ checkedInAt: '2026-10-10T19:42:00+07:00', checkedInByName: 'Azka' }),
      event: 'resepsi',
    })
    expect(d.outcome).toBe('already_in')
    expect(d.canAdmit).toBe(false)
  })

  it('flags a guest holding no invitation to this event', () => {
    const d = resolveScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.outcome).toBe('not_invited')
  })

  it('still lets an usher admit someone with no invitation to this event', () => {
    // Warn, allow, flag. A person at the door outranks a spreadsheet.
    const d = resolveScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.canAdmit).toBe(true)
  })

  it('flags a guest still on the waiting list, and admits them anyway', () => {
    const d = resolveScan({ guest: guest({ inviteStatus: 'waitlisted' }), event: 'akad' })
    expect(d.outcome).toBe('waitlisted')
    expect(d.canAdmit).toBe(true)
  })

  it('flags someone who declined and then turned up', () => {
    const d = resolveScan({ guest: guest({ rsvpStatus: 'not_attending' }), event: 'resepsi' })
    expect(d.outcome).toBe('declined')
    expect(d.canAdmit).toBe(true)
  })

  it('admits a guest who never answered the RSVP without comment', () => {
    const d = resolveScan({ guest: guest({ rsvpStatus: 'pending' }), event: 'resepsi' })
    expect(d.outcome).toBe('admit')
  })

  describe('precedence between overlapping problems', () => {
    it('puts no-invitation above already-in', () => {
      const d = resolveScan({
        guest: guest({ inviteStatus: null, checkedInAt: '2026-10-10T19:42:00+07:00' }),
        event: 'resepsi',
      })
      expect(d.outcome).toBe('not_invited')
    })

    it('puts already-in above waitlisted', () => {
      const d = resolveScan({
        guest: guest({ inviteStatus: 'waitlisted', checkedInAt: '2026-10-10T19:42:00+07:00' }),
        event: 'akad',
      })
      expect(d.outcome).toBe('already_in')
      expect(d.canAdmit).toBe(false)
    })

    it('puts already-in above declined', () => {
      const d = resolveScan({
        guest: guest({ rsvpStatus: 'not_attending', checkedInAt: '2026-10-10T19:42:00+07:00' }),
        event: 'resepsi',
      })
      expect(d.outcome).toBe('already_in')
    })

    it('puts waitlisted above declined', () => {
      const d = resolveScan({
        guest: guest({ inviteStatus: 'waitlisted', rsvpStatus: 'not_attending' }),
        event: 'akad',
      })
      expect(d.outcome).toBe('waitlisted')
    })
  })

  describe('suggested headcount', () => {
    it('offers what the guest confirmed', () => {
      const d = resolveScan({ guest: guest({ pax: 4, paxConfirmed: 2 }), event: 'resepsi' })
      expect(d.suggestedPax).toBe(2)
    })

    it('falls back to the invited size when they never answered', () => {
      const d = resolveScan({ guest: guest({ pax: 3, paxConfirmed: null }), event: 'resepsi' })
      expect(d.suggestedPax).toBe(3)
    })

    it('offers a confirmed count of one rather than treating it as missing', () => {
      // Guards the difference between `?? ` and `||`: a confirmed 1 is a real
      // answer, and `||` would silently replace it with the invited pax.
      const d = resolveScan({ guest: guest({ pax: 4, paxConfirmed: 1 }), event: 'resepsi' })
      expect(d.suggestedPax).toBe(1)
    })
  })

  describe('what the usher must notice', () => {
    it('carries VIP through every outcome', () => {
      const vip = guest({ isVip: true, inviteStatus: null })
      expect(resolveScan({ guest: vip, event: 'resepsi' }).vip).toBe(true)
    })

    it('reports a souvenir still owed', () => {
      const d = resolveScan({ guest: guest({ souvenirClaimedAt: null }), event: 'resepsi' })
      expect(d.souvenirDue).toBe(true)
    })

    it('reports a souvenir already collected', () => {
      const d = resolveScan({
        guest: guest({ souvenirClaimedAt: '2026-10-10T09:12:00+07:00', souvenirClaimedVia: 'akad_table' }),
        event: 'resepsi',
      })
      expect(d.souvenirDue).toBe(false)
    })

    it('still owes a souvenir to a guest who is already checked in', () => {
      const d = resolveScan({
        guest: guest({ checkedInAt: '2026-10-10T19:42:00+07:00', souvenirClaimedAt: null }),
        event: 'resepsi',
      })
      expect(d.souvenirDue).toBe(true)
    })
  })
})

describe('resolveSouvenirScan', () => {
  it('hands over a souvenir to a guest who has none', () => {
    const d = resolveSouvenirScan({ guest: guest(), event: 'resepsi' })
    expect(d.outcome).toBe('give')
    expect(d.canGive).toBe(true)
    expect(d.via).toBe('resepsi_scan')
  })

  it('refuses a second souvenir and says where the first went', () => {
    const d = resolveSouvenirScan({
      guest: guest({ souvenirClaimedAt: '2026-10-10T09:12:00+07:00', souvenirClaimedVia: 'akad_table' }),
      event: 'resepsi',
    })
    expect(d.outcome).toBe('already_claimed')
    expect(d.canGive).toBe(false)
    expect(d.claimedVia).toBe('akad_table')
  })

  it('does not care whether the guest was checked in at this event', () => {
    // The Akad-skipper arrives at the Resepsi souvenir table before the door.
    const d = resolveSouvenirScan({ guest: guest({ checkedInAt: null }), event: 'resepsi' })
    expect(d.canGive).toBe(true)
  })

  it('mentions a guest with no invitation here, without refusing them', () => {
    const d = resolveSouvenirScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.outcome).toBe('not_invited')
    expect(d.canGive).toBe(true)
  })

  it('carries VIP so the table can greet them properly', () => {
    const d = resolveSouvenirScan({ guest: guest({ isVip: true }), event: 'resepsi' })
    expect(d.vip).toBe(true)
  })
})
