/**
 * Who a WhatsApp wave reaches, and when.
 *
 * The one place in this system that can put a message on a real phone, so the
 * rules live here where they can be tested rather than inside a click handler.
 *
 * Three separate limits are at work and they are easy to confuse:
 *
 *   The daily cap    250 unique recipients in 24 hours, because this WhatsApp
 *                    account is unverified. Counted per NUMBER, not per guest.
 *   The person cap   roughly two marketing messages per person per 24 hours,
 *                    across every business on WhatsApp, not just this one.
 *                    Breaching it returns 131049 and is nobody's fault.
 *   The wave itself  one send per guest per kind, enforced by a unique
 *                    constraint in the database.
 */

export type WaveKind = 'invite' | 'reminder' | 'qr_checkin'

/** Meta's rejection when a person has had their fill of marketing today. */
export const MARKETING_CAP_ERROR = 131049

/** Unique recipients per 24 hours on an unverified account. */
export const DAILY_RECIPIENT_CAP = 250

export type WaveCandidate = {
  guestId: string
  name: string
  /** E.164, or null when nobody has filled one in. */
  phone: string | null
  /**
   * True when they hold at least one CONFIRMED invitation. A waitlisted-only
   * guest is excluded: docs/PRD.md says the waiting list receives no messages
   * at all, not the invitation and not the QR, until somebody promotes them.
   */
  hasConfirmedInvite: boolean
  /** A send of this kind already recorded, whatever its outcome. */
  sentAt: string | null
  /** The code the last attempt came back with, if it failed. */
  lastErrorCode: string | null
  /** When that last attempt happened. */
  lastAttemptAt: string | null
  /**
   * Which batch this guest belongs to, or null when nobody has put them in one.
   *
   * Unassigned is not a batch. A guest with no batch is never swept up by a
   * batch send, because the whole reason batches exist is that somebody chose
   * who hears first.
   */
  batch?: 1 | 2 | null
}

export type Excluded = {
  guestId: string
  name: string
  reason: 'no_phone' | 'waitlisted' | 'already_sent' | 'other_batch' | 'no_batch'
}

export type WavePlan = {
  /** Ready to send right now, in order. */
  ready: WaveCandidate[]
  /** Rejected earlier and not yet worth retrying, because the day has not rolled. */
  waitingForTomorrow: WaveCandidate[]
  excluded: Excluded[]
  /**
   * Guests who share a phone number with another guest in `ready`.
   *
   * Two guests listed separately who live at one number is normal — a couple,
   * a household. But both messages land on one person, and two marketing
   * messages in a day is exactly the person cap, so the second is likely to
   * come back 131049. Naming them lets a wave spread them across days instead
   * of discovering it as a failure.
   */
  sharingANumber: WaveCandidate[]
  /** Distinct numbers in `ready`, which is what the daily cap counts. */
  distinctRecipients: number
}

function dayKey(iso: string, timeZone = 'Asia/Jakarta'): string {
  // The cap rolls on Meta's clock, not ours, but a local day boundary is the
  // closest honest approximation and errs toward waiting rather than retrying
  // too early.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone })
}

/**
 * Decide who this wave can reach right now.
 *
 * `now` is passed in rather than read, so the day-rollover rule is testable.
 */
export function planWave(
  candidates: WaveCandidate[],
  now: Date,
  /** When set, only this batch is eligible and everyone else is named as such. */
  batch: 1 | 2 | null = null
): WavePlan {
  const ready: WaveCandidate[] = []
  const waitingForTomorrow: WaveCandidate[] = []
  const excluded: Excluded[] = []
  const today = dayKey(now.toISOString())

  for (const candidate of candidates) {
    if (batch !== null) {
      if (candidate.batch === null || candidate.batch === undefined) {
        excluded.push({ guestId: candidate.guestId, name: candidate.name, reason: 'no_batch' })
        continue
      }
      if (candidate.batch !== batch) {
        excluded.push({ guestId: candidate.guestId, name: candidate.name, reason: 'other_batch' })
        continue
      }
    }

    if (!candidate.hasConfirmedInvite) {
      excluded.push({ guestId: candidate.guestId, name: candidate.name, reason: 'waitlisted' })
      continue
    }
    if (!candidate.phone) {
      excluded.push({ guestId: candidate.guestId, name: candidate.name, reason: 'no_phone' })
      continue
    }

    // A successful send is final: the unique constraint would refuse a second
    // row anyway, and this is what makes the wave resumable.
    if (candidate.sentAt) {
      excluded.push({ guestId: candidate.guestId, name: candidate.name, reason: 'already_sent' })
      continue
    }

    // Rejected by the person cap earlier today. Retrying now would fail the
    // same way and burn an attempt for nothing.
    const cappedToday =
      candidate.lastErrorCode === String(MARKETING_CAP_ERROR) &&
      candidate.lastAttemptAt !== null &&
      dayKey(candidate.lastAttemptAt) === today

    if (cappedToday) {
      waitingForTomorrow.push(candidate)
      continue
    }

    ready.push(candidate)
  }

  const numberCounts = new Map<string, number>()
  for (const candidate of ready) {
    const phone = candidate.phone!
    numberCounts.set(phone, (numberCounts.get(phone) ?? 0) + 1)
  }

  return {
    ready,
    waitingForTomorrow,
    excluded,
    sharingANumber: ready.filter((c) => (numberCounts.get(c.phone!) ?? 0) > 1),
    distinctRecipients: numberCounts.size,
  }
}

/**
 * Trim a plan to what may actually go out in one run.
 *
 * `alreadySentToday` is how many distinct numbers this account has already
 * reached in the current 24 hours, so a second run on the same day does not
 * blow through the cap the first one left room under.
 *
 * Guests sharing a number are never split across the same batch: sending both
 * halves of a household at once wastes one of them on the person cap.
 */
export function takeBatch(
  plan: WavePlan,
  options: { limit?: number; alreadySentToday?: number } = {}
): WaveCandidate[] {
  const capRemaining = Math.max(0, DAILY_RECIPIENT_CAP - (options.alreadySentToday ?? 0))
  const wanted = Math.min(options.limit ?? plan.ready.length, plan.ready.length)

  const batch: WaveCandidate[] = []
  const numbersUsed = new Set<string>()

  for (const candidate of plan.ready) {
    if (batch.length >= wanted) break
    const phone = candidate.phone!
    if (numbersUsed.has(phone)) continue
    if (numbersUsed.size >= capRemaining) break
    numbersUsed.add(phone)
    batch.push(candidate)
  }

  return batch
}

/**
 * How a failed attempt should be treated.
 *
 * The distinction that matters: a person cap rejection is a delay, and
 * anything else is a fault worth a human looking at. Recording them the same
 * way would either hide real problems or make an ordinary Tuesday look like an
 * outage.
 */
export function classifyFailure(code: number | null): 'retry_tomorrow' | 'needs_attention' {
  return code === MARKETING_CAP_ERROR ? 'retry_tomorrow' : 'needs_attention'
}
