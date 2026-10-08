import { describe, expect, it } from 'vitest'
import { DOOR_PAX_LIMIT, extraPax, resolveScan, resolveSouvenirScan, vipLabel, type DoorGuest } from './checkin'

/** Invented names throughout: never a real guest row (CLAUDE.md). */
function guest(over: Partial<DoorGuest> = {}): DoorGuest {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Guest',
    pax: 2,
    isVip: false,
    inviterKey: 'Fatan',
    side: 'fatan',
    note: null,
    inviteStatus: 'confirmed',
    rsvpStatus: 'attending',
    paxConfirmed: 2,
    checkedInAt: null,
    checkedInByName: null,
    souvenirClaimedAt: null,
    souvenirClaimedVia: null,
    checkedInPax: null,
    vipTableName: null,
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

  // Owner's decision, 2026-08-30: an invitation to this event is a hard
  // requirement. No role overrides it at the door; a wrong row is fixed in the
  // admin app and re-scanned.
  it('refuses someone with no invitation to this event', () => {
    const d = resolveScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.canAdmit).toBe(false)
  })

  it('refuses a guest still on the waiting list', () => {
    // A waiting-list place is not an invitation: they were never promoted, so
    // they were never sent a ticket in the first place.
    const d = resolveScan({ guest: guest({ inviteStatus: 'waitlisted' }), event: 'akad' })
    expect(d.outcome).toBe('waitlisted')
    expect(d.canAdmit).toBe(false)
  })

  it('refuses a guest invited only to the other event', () => {
    // Invited to the Akad, scanned at the Resepsi door: the RPC returns the
    // guest with a null invite_status for the event actually being scanned.
    const d = resolveScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.outcome).toBe('not_invited')
    expect(d.canAdmit).toBe(false)
  })

  // Only an explicit yes gets in, decided 2026-08-30. The couple resolve every
  // non-responder by hand before the day, so neither of these should exist at
  // a door on 10 October.
  it('refuses someone who declined and then turned up', () => {
    const d = resolveScan({ guest: guest({ rsvpStatus: 'not_attending' }), event: 'resepsi' })
    expect(d.outcome).toBe('declined')
    expect(d.canAdmit).toBe(false)
  })

  // Owner, 2026-10-08: a guest who never answered is let in and flagged,
  // not turned away. The outcome stays distinct so the screen can say so.
  it('admits a guest who never answered the RSVP, flagged as no_rsvp', () => {
    const d = resolveScan({ guest: guest({ rsvpStatus: 'pending' }), event: 'resepsi' })
    expect(d.outcome).toBe('no_rsvp')
    expect(d.canAdmit).toBe(true)
  })

  it('admits a guest with no RSVP recorded at all, flagged as no_rsvp', () => {
    // rsvpStatus is null when the row exists but nothing was ever written.
    const d = resolveScan({ guest: guest({ rsvpStatus: null }), event: 'resepsi' })
    expect(d.outcome).toBe('no_rsvp')
    expect(d.canAdmit).toBe(true)
  })

  it('admits only an explicit yes', () => {
    const d = resolveScan({ guest: guest({ rsvpStatus: 'attending' }), event: 'resepsi' })
    expect(d.outcome).toBe('admit')
    expect(d.canAdmit).toBe(true)
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

    it('refuses whichever of the blocking states wins', () => {
      // Every blocking outcome must actually block, whatever the precedence
      // order resolves to. This is the guard that matters if the order is ever
      // reshuffled again.
      const blocked = [
        guest({ inviteStatus: null }),
        guest({ inviteStatus: 'waitlisted' }),
        guest({ checkedInAt: '2026-10-10T19:42:00+07:00' }),
        guest({ rsvpStatus: 'not_attending' }),
        // A pending answer no longer blocks on its own, but it must not
        // soften any of the states above it.
        guest({ rsvpStatus: 'pending', inviteStatus: 'waitlisted' }),
        guest({ rsvpStatus: null, inviteStatus: null }),
      ]
      for (const g of blocked) {
        expect(resolveScan({ guest: g, event: 'resepsi' }).canAdmit).toBe(false)
      }
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

    it('puts declined above never-answered', () => {
      // "They told us no" is more useful to an usher than "we never heard".
      const d = resolveScan({ guest: guest({ rsvpStatus: 'not_attending' }), event: 'resepsi' })
      expect(d.outcome).toBe('declined')
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

  it('refuses a souvenir to someone with no invitation to this event', () => {
    // One souvenir per invited guest entry. No invitation here is no entry to
    // count, and they should not have got past the door either.
    const d = resolveSouvenirScan({ guest: guest({ inviteStatus: null }), event: 'resepsi' })
    expect(d.outcome).toBe('not_invited')
    expect(d.canGive).toBe(false)
  })

  it('still gives a souvenir to a waitlisted guest who is standing there', () => {
    // Deliberately not blocked. The door decides who gets in; if a waitlisted
    // guest was let in by a promotion the tablet has not seen yet, refusing
    // them a souvenir at the table helps nobody.
    const d = resolveSouvenirScan({ guest: guest({ inviteStatus: 'waitlisted' }), event: 'resepsi' })
    expect(d.canGive).toBe(true)
  })

  it('carries VIP so the table can greet them properly', () => {
    const d = resolveSouvenirScan({ guest: guest({ isVip: true }), event: 'resepsi' })
    expect(d.vip).toBe(true)
  })
})

describe('expectedPax and extraPax, the door count', () => {
  /*
   * Owner, 2026-10-08: the door is no longer capped at what was confirmed. A
   * party that confirmed 2 and arrives as 4 is let in as 4, and the 2 extra
   * are recorded so the couple can see who brought more than they said.
   */
  it('expects what they confirmed, not what they were invited for', () => {
    const d = resolveScan({ guest: guest({ pax: 3, paxConfirmed: 2 }), event: 'akad' })
    expect(d.expectedPax).toBe(2)
  })

  it('falls back to the invited size when nobody ever answered', () => {
    const d = resolveScan({
      guest: guest({ pax: 3, paxConfirmed: null, rsvpStatus: 'pending' }),
      event: 'akad',
    })
    expect(d.expectedPax).toBe(3)
  })

  it('never expects fewer than one', () => {
    const d = resolveScan({ guest: guest({ pax: 2, paxConfirmed: 0 }), event: 'akad' })
    expect(d.expectedPax).toBe(1)
  })

  it('agrees with the pre-filled count', () => {
    const d = resolveScan({ guest: guest({ pax: 5, paxConfirmed: 2 }), event: 'akad' })
    expect(d.suggestedPax).toBe(d.expectedPax)
  })

  it('counts the people above what was confirmed', () => {
    expect(extraPax(guest({ pax: 2, paxConfirmed: 2 }), 4)).toBe(2)
  })

  it('counts nothing extra at or below the confirmed number', () => {
    expect(extraPax(guest({ pax: 3, paxConfirmed: 2 }), 2)).toBe(0)
    expect(extraPax(guest({ pax: 3, paxConfirmed: 2 }), 1)).toBe(0)
  })

  it('measures a never-answered guest against their invitation', () => {
    expect(extraPax(guest({ pax: 2, paxConfirmed: null, rsvpStatus: 'pending' }), 3)).toBe(1)
  })

  it('has a sanity limit well above any real party', () => {
    expect(DOOR_PAX_LIMIT).toBeGreaterThanOrEqual(10)
  })
})

describe('vipLabel', () => {
  it('is nothing for a guest who is not VIP', () => {
    expect(vipLabel(guest({ isVip: false, vipTableName: 'VIP Table 2' }))).toBeNull()
  })

  it('is the table when the table already says VIP', () => {
    expect(vipLabel(guest({ isVip: true, vipTableName: 'VIP Table 5' }))).toBe('VIP Table 5')
  })

  it('names the tier in front of a table that does not', () => {
    expect(vipLabel(guest({ isVip: true, vipTableName: 'Table 3' }))).toBe('VIP · Table 3')
  })

  it('is just VIP when they are not seated', () => {
    expect(vipLabel(guest({ isVip: true, vipTableName: null }))).toBe('VIP')
  })
})
