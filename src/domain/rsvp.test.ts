import { describe, expect, it } from 'vitest'
import {
  decideRsvp,
  isFullyAnswered,
  paxFreed,
  type EventInvitation,
} from './rsvp'

function invitation(over: Partial<EventInvitation> = {}): EventInvitation {
  return { event: 'resepsi', inviteStatus: 'confirmed', invitedPax: 4, ...over }
}

describe('decideRsvp', () => {
  describe('attending', () => {
    it('accepts the full party', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: 4 })
      expect(d).toMatchObject({ allowed: true, status: 'attending', paxConfirmed: 4 })
    })

    it('accepts fewer than invited, and says so', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: 2 })
      expect(d.allowed).toBe(true)
      if (d.allowed) {
        expect(d.paxConfirmed).toBe(2)
        expect(d.flags).toContain('coming_with_fewer')
      }
    })

    it('accepts exactly one', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: 1 })
      expect(d.allowed).toBe(true)
    })

    // The rule this module exists for.
    it('refuses more than they were invited for', () => {
      const d = decideRsvp({ invitation: invitation({ invitedPax: 2 }), answer: 'attending', paxConfirmed: 3 })
      expect(d).toMatchObject({ allowed: false, reason: 'pax_too_high' })
    })

    it('tells them what the ceiling is rather than just refusing', () => {
      const d = decideRsvp({ invitation: invitation({ invitedPax: 2 }), answer: 'attending', paxConfirmed: 5 })
      if (!d.allowed) expect(d.message).toContain('2')
    })

    it('refuses a party of zero, and points at the other answer', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: 0 })
      expect(d).toMatchObject({ allowed: false, reason: 'pax_not_positive' })
      if (!d.allowed) expect(d.message).toMatch(/not attending/i)
    })

    it('refuses a negative party', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: -1 })
      expect(d).toMatchObject({ allowed: false, reason: 'pax_not_positive' })
    })

    it('refuses half a person', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: 2.5 })
      expect(d).toMatchObject({ allowed: false, reason: 'pax_not_positive' })
    })

    it('asks for a number when none was given', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'attending', paxConfirmed: null })
      expect(d).toMatchObject({ allowed: false, reason: 'pax_missing' })
    })

    it('flags someone accepting a place they were only waitlisted for', () => {
      const d = decideRsvp({
        invitation: invitation({ inviteStatus: 'waitlisted' }),
        answer: 'attending',
        paxConfirmed: 2,
      })
      expect(d.allowed).toBe(true)
      if (d.allowed) expect(d.flags).toContain('attending_while_waitlisted')
    })
  })

  describe('not attending', () => {
    it('records the decline without a headcount', () => {
      const d = decideRsvp({ invitation: invitation(), answer: 'not_attending', paxConfirmed: null })
      expect(d).toMatchObject({ allowed: true, status: 'not_attending', paxConfirmed: null })
    })

    it('ignores a headcount typed alongside a decline', () => {
      // Two questions answered at once; only one of them counts.
      const d = decideRsvp({ invitation: invitation(), answer: 'not_attending', paxConfirmed: 3 })
      expect(d.allowed).toBe(true)
      if (d.allowed) expect(d.paxConfirmed).toBeNull()
    })

    it('flags a waitlisted guest declining', () => {
      const d = decideRsvp({
        invitation: invitation({ inviteStatus: 'waitlisted' }),
        answer: 'not_attending',
        paxConfirmed: null,
      })
      if (d.allowed) expect(d.flags).toContain('declined_while_waitlisted')
    })
  })

  it('refuses any answer for an event they were never invited to', () => {
    const d = decideRsvp({
      invitation: invitation({ inviteStatus: null }),
      answer: 'attending',
      paxConfirmed: 1,
    })
    expect(d).toMatchObject({ allowed: false, reason: 'not_invited' })
  })

  it('refuses a decline for an event they were never invited to', () => {
    const d = decideRsvp({
      invitation: invitation({ inviteStatus: null }),
      answer: 'not_attending',
      paxConfirmed: null,
    })
    expect(d.allowed).toBe(false)
  })
})

describe('paxFreed', () => {
  it('frees the whole invitation when they decline', () => {
    const inv = invitation({ invitedPax: 4 })
    const d = decideRsvp({ invitation: inv, answer: 'not_attending', paxConfirmed: null })
    expect(paxFreed(inv, d)).toBe(4)
  })

  it('frees the difference when fewer come', () => {
    const inv = invitation({ invitedPax: 4 })
    const d = decideRsvp({ invitation: inv, answer: 'attending', paxConfirmed: 1 })
    expect(paxFreed(inv, d)).toBe(3)
  })

  it('frees nothing when the whole party comes', () => {
    const inv = invitation({ invitedPax: 4 })
    const d = decideRsvp({ invitation: inv, answer: 'attending', paxConfirmed: 4 })
    expect(paxFreed(inv, d)).toBe(0)
  })

  it('frees nothing from a refused answer', () => {
    const inv = invitation({ invitedPax: 2 })
    const d = decideRsvp({ invitation: inv, answer: 'attending', paxConfirmed: 9 })
    expect(paxFreed(inv, d)).toBe(0)
  })
})

describe('isFullyAnswered', () => {
  const akad = invitation({ event: 'akad', invitedPax: 2 })
  const resepsi = invitation({ event: 'resepsi', invitedPax: 2 })

  it('is false when nothing has been answered', () => {
    expect(
      isFullyAnswered([akad, resepsi], [
        { event: 'akad', status: 'pending' },
        { event: 'resepsi', status: 'pending' },
      ])
    ).toBe(false)
  })

  // The case the sweep would otherwise miss: half-answered still fails at one
  // of the two doors.
  it('is false when only one of two events is answered', () => {
    expect(
      isFullyAnswered([akad, resepsi], [
        { event: 'akad', status: 'attending' },
        { event: 'resepsi', status: 'pending' },
      ])
    ).toBe(false)
  })

  it('is true when both are answered, including a decline', () => {
    expect(
      isFullyAnswered([akad, resepsi], [
        { event: 'akad', status: 'attending' },
        { event: 'resepsi', status: 'not_attending' },
      ])
    ).toBe(true)
  })

  it('ignores events they hold no invitation to', () => {
    const notInvited = invitation({ event: 'akad', inviteStatus: null })
    expect(
      isFullyAnswered([notInvited, resepsi], [{ event: 'resepsi', status: 'attending' }])
    ).toBe(true)
  })

  it('is false for a guest invited to nothing at all', () => {
    // Nothing to answer is not the same as answered, and such a guest is
    // refused at every door.
    const none = invitation({ event: 'akad', inviteStatus: null })
    expect(isFullyAnswered([none], [])).toBe(false)
  })

  it('treats a missing answer row as unanswered', () => {
    expect(isFullyAnswered([akad, resepsi], [{ event: 'akad', status: 'attending' }])).toBe(false)
  })
})
