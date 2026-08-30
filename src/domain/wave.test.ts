import { describe, expect, it } from 'vitest'
import {
  DAILY_RECIPIENT_CAP,
  MARKETING_CAP_ERROR,
  classifyFailure,
  planWave,
  takeBatch,
  ticketReadiness,
  type WaveCandidate,
} from './wave'

const NOW = new Date('2026-09-15T10:00:00+07:00')

let seq = 0
function candidate(over: Partial<WaveCandidate> = {}): WaveCandidate {
  seq += 1
  return {
    guestId: `g${seq}`,
    name: `Guest ${seq}`,
    phone: `+62811000${String(seq).padStart(4, '0')}`,
    hasConfirmedInvite: true,
    sentAt: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    ...over,
  }
}

describe('planWave', () => {
  it('includes a guest with a number and a confirmed invitation', () => {
    const plan = planWave([candidate()], NOW)
    expect(plan.ready).toHaveLength(1)
    expect(plan.excluded).toHaveLength(0)
  })

  it('excludes a guest with no phone number', () => {
    const plan = planWave([candidate({ phone: null })], NOW)
    expect(plan.ready).toHaveLength(0)
    expect(plan.excluded[0].reason).toBe('no_phone')
  })

  // docs/PRD.md: the waiting list receives no messages at all until promoted.
  it('excludes a waitlisted-only guest even though they have a number', () => {
    const plan = planWave([candidate({ hasConfirmedInvite: false })], NOW)
    expect(plan.ready).toHaveLength(0)
    expect(plan.excluded[0].reason).toBe('waitlisted')
  })

  it('puts waitlisted ahead of no-phone when both are true', () => {
    // Reported as waitlisted, because promoting them is the action; filling in
    // a number for someone who is not invited yet is not.
    const plan = planWave([candidate({ hasConfirmedInvite: false, phone: null })], NOW)
    expect(plan.excluded[0].reason).toBe('waitlisted')
  })

  it('excludes a guest already sent to', () => {
    const plan = planWave([candidate({ sentAt: '2026-09-14T09:00:00+07:00' })], NOW)
    expect(plan.ready).toHaveLength(0)
    expect(plan.excluded[0].reason).toBe('already_sent')
  })

  describe('the person cap', () => {
    it('holds back someone rejected earlier the same day', () => {
      const plan = planWave(
        [
          candidate({
            lastErrorCode: String(MARKETING_CAP_ERROR),
            lastAttemptAt: '2026-09-15T08:00:00+07:00',
          }),
        ],
        NOW
      )
      expect(plan.ready).toHaveLength(0)
      expect(plan.waitingForTomorrow).toHaveLength(1)
    })

    it('retries someone rejected yesterday', () => {
      const plan = planWave(
        [
          candidate({
            lastErrorCode: String(MARKETING_CAP_ERROR),
            lastAttemptAt: '2026-09-14T23:00:00+07:00',
          }),
        ],
        NOW
      )
      expect(plan.ready).toHaveLength(1)
      expect(plan.waitingForTomorrow).toHaveLength(0)
    })

    it('retries a different failure immediately', () => {
      // Only the person cap is a delay. Anything else may well be a real fault,
      // and holding it for a day hides it.
      const plan = planWave(
        [candidate({ lastErrorCode: '131026', lastAttemptAt: '2026-09-15T08:00:00+07:00' })],
        NOW
      )
      expect(plan.ready).toHaveLength(1)
    })

    it('uses Jakarta days, not UTC', () => {
      // 2026-09-14T18:30Z is already the 15th in Jakarta, so this counts as
      // today and must wait. Under UTC it would look like yesterday and retry
      // straight into another rejection.
      const plan = planWave(
        [
          candidate({
            lastErrorCode: String(MARKETING_CAP_ERROR),
            lastAttemptAt: '2026-09-14T18:30:00Z',
          }),
        ],
        NOW
      )
      expect(plan.waitingForTomorrow).toHaveLength(1)
    })
  })

  describe('two guests, one number', () => {
    it('names both of them', () => {
      const shared = '+628110001111'
      const plan = planWave(
        [candidate({ phone: shared }), candidate({ phone: shared }), candidate()],
        NOW
      )
      expect(plan.sharingANumber).toHaveLength(2)
    })

    it('counts the number once toward the daily cap', () => {
      const shared = '+628110002222'
      const plan = planWave([candidate({ phone: shared }), candidate({ phone: shared })], NOW)
      expect(plan.ready).toHaveLength(2)
      expect(plan.distinctRecipients).toBe(1)
    })

    it('names nobody when every number is its own', () => {
      const plan = planWave([candidate(), candidate()], NOW)
      expect(plan.sharingANumber).toHaveLength(0)
    })
  })
})

describe('takeBatch', () => {
  it('takes everyone when nothing limits it', () => {
    const plan = planWave([candidate(), candidate(), candidate()], NOW)
    expect(takeBatch(plan)).toHaveLength(3)
  })

  it('takes only the few asked for', () => {
    const plan = planWave([candidate(), candidate(), candidate()], NOW)
    expect(takeBatch(plan, { limit: 2 })).toHaveLength(2)
  })

  it('stops at the daily cap', () => {
    const many = Array.from({ length: DAILY_RECIPIENT_CAP + 40 }, () => candidate())
    const plan = planWave(many, NOW)
    expect(takeBatch(plan)).toHaveLength(DAILY_RECIPIENT_CAP)
  })

  it('leaves room for what the account already sent today', () => {
    const many = Array.from({ length: 60 }, () => candidate())
    const plan = planWave(many, NOW)
    expect(takeBatch(plan, { alreadySentToday: DAILY_RECIPIENT_CAP - 10 })).toHaveLength(10)
  })

  it('sends nothing once the cap is spent', () => {
    const plan = planWave([candidate()], NOW)
    expect(takeBatch(plan, { alreadySentToday: DAILY_RECIPIENT_CAP })).toHaveLength(0)
  })

  // Sending both halves of a household at once spends one of them on the
  // person cap for nothing.
  it('never puts two guests sharing a number in the same batch', () => {
    const shared = '+628110003333'
    const plan = planWave([candidate({ phone: shared }), candidate({ phone: shared })], NOW)
    const batch = takeBatch(plan)
    expect(batch).toHaveLength(1)
  })

  it('still reaches the second of a shared number on a later run', () => {
    const shared = '+628110004444'
    const first = candidate({ phone: shared })
    const second = candidate({ phone: shared })

    const batchOne = takeBatch(planWave([first, second], NOW))
    expect(batchOne).toHaveLength(1)

    // The first is recorded as sent; the second is now alone on that number.
    const later = planWave([{ ...first, sentAt: NOW.toISOString() }, second], NOW)
    expect(takeBatch(later)).toHaveLength(1)
    expect(takeBatch(later)[0].guestId).toBe(second.guestId)
  })
})

describe('classifyFailure', () => {
  it('treats the person cap as a delay', () => {
    expect(classifyFailure(MARKETING_CAP_ERROR)).toBe('retry_tomorrow')
  })

  it('treats anything else as worth a look', () => {
    expect(classifyFailure(131026)).toBe('needs_attention')
    expect(classifyFailure(null)).toBe('needs_attention')
  })
})

describe('batches', () => {
  it('ignores batches entirely when none is asked for', () => {
    const plan = planWave([candidate({ batch: 1 }), candidate({ batch: null })], NOW)
    expect(plan.ready).toHaveLength(2)
  })

  it('takes only the batch asked for', () => {
    const plan = planWave([candidate({ batch: 1 }), candidate({ batch: 2 })], NOW, 1)
    expect(plan.ready).toHaveLength(1)
    expect(plan.excluded[0].reason).toBe('other_batch')
  })

  // Unassigned is not a batch. Sweeping them in would defeat the point of
  // choosing who hears first.
  it('never sweeps up an unassigned guest', () => {
    const plan = planWave([candidate({ batch: null })], NOW, 1)
    expect(plan.ready).toHaveLength(0)
    expect(plan.excluded[0].reason).toBe('no_batch')
  })

  it('still applies every other rule inside a batch', () => {
    const plan = planWave(
      [
        candidate({ batch: 1, phone: null }),
        candidate({ batch: 1, hasConfirmedInvite: false }),
        candidate({ batch: 1 }),
      ],
      NOW,
      1
    )
    expect(plan.ready).toHaveLength(1)
    expect(plan.excluded.map((e) => e.reason).sort()).toEqual(['no_phone', 'waitlisted'])
  })
})

describe('ticketReadiness', () => {
  const coming = { answered: true, attending: true }
  const declined = { answered: true, attending: false }
  const silent = { answered: false, attending: false }

  it('is ready when everyone has answered and somebody is coming', () => {
    expect(ticketReadiness([coming, declined])).toEqual({ ready: true, recipients: 1 })
  })

  // The rule this exists for: a guest still unanswered gets no ticket, and the
  // door has no override on the day.
  it('refuses while anyone is unanswered', () => {
    const result = ticketReadiness([coming, silent])
    expect(result).toMatchObject({ ready: false, reason: 'unanswered', unanswered: 1 })
  })

  it('counts how many are still unanswered, so the number is actionable', () => {
    const result = ticketReadiness([silent, silent, coming])
    if (!result.ready) expect(result.unanswered).toBe(2)
  })

  it('still reports who would receive one, so the wave can be sized', () => {
    const result = ticketReadiness([coming, coming, silent])
    if (!result.ready) expect(result.recipients).toBe(2)
  })

  it('refuses when everyone answered and nobody is coming', () => {
    expect(ticketReadiness([declined, declined])).toMatchObject({
      ready: false,
      reason: 'nobody_attending',
    })
  })

  it('names the unanswered ahead of an empty guest list', () => {
    // Both are true here. Unanswered is the one somebody can act on.
    expect(ticketReadiness([silent])).toMatchObject({ reason: 'unanswered' })
  })

  it('refuses an empty list rather than claiming readiness', () => {
    expect(ticketReadiness([])).toMatchObject({ ready: false, reason: 'nobody_attending' })
  })
})
