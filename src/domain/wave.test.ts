import { describe, expect, it } from 'vitest'
import {
  DAILY_RECIPIENT_CAP,
  MARKETING_CAP_ERROR,
  classifyFailure,
  planWave,
  takeBatch,
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
