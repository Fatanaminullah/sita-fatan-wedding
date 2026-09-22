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

/**
 * The batches a guest can be put in.
 *
 * Six, not two. The split was never forced by the daily cap (the whole list
 * fits under it); it exists so the couple can release the invitation in steps
 * they can watch. Two steps turned out to be coarser than they wanted.
 *
 * Widening this is safe on its own: a batch is chosen by a person, never
 * computed, so no guest moves because the ceiling moved.
 */
export const BATCH_NUMBERS = [1, 2, 3, 4, 5, 6] as const
export type BatchNumber = (typeof BATCH_NUMBERS)[number]

export function isBatchNumber(value: unknown): value is BatchNumber {
  return (BATCH_NUMBERS as readonly unknown[]).includes(value)
}

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
  batch?: BatchNumber | null
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
  batch: BatchNumber | null = null
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

export type RunPlan = {
  /** How many guests this press will actually reach. */
  willSend: number
  /** How many were eligible before any limit applied. */
  audience: number
  /** Eligible, not going out on this run. */
  heldBack: number
  /** What did the holding back, so the screen can say it in words. */
  reason: 'daily_cap' | 'limit' | null
}

/**
 * What one press will really do.
 *
 * `takeBatch` already truncates a run at the daily cap, silently. That made the
 * button lie: it read "Everyone left · 300", 250 went out, and the difference
 * appeared only in the outcome card afterwards. On the one screen in this app
 * that reaches real phones, the number on the button has to be the number that
 * will be sent. This computes it, and names what shortened it.
 */
export function planRun(
  plan: WavePlan,
  options: { limit?: number; alreadySentToday?: number } = {}
): RunPlan {
  const audience = plan.ready.length
  const willSend = takeBatch(plan, options).length
  const heldBack = audience - willSend
  if (heldBack === 0) return { willSend, audience, heldBack: 0, reason: null }

  // The cap is named ahead of the operator's own limit when both bite: one is a
  // choice they just made and remember, the other is a constraint they cannot
  // see and would otherwise discover as a shortfall.
  const capRemaining = Math.max(0, DAILY_RECIPIENT_CAP - (options.alreadySentToday ?? 0))
  const reason = willSend >= capRemaining ? 'daily_cap' : 'limit'
  return { willSend, audience, heldBack, reason }
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

/* ------------------------------------------------------------ the ticket */

/**
 * Whether the QR wave may run at all.
 *
 * The ticket is the moment that separates "gets in" from "turned away at the
 * door", because check-in admits only a confirmed `attending` and no role can
 * override it on the day. A guest still unanswered when this goes out receives
 * nothing, and finding that out on 10 October is too late for anybody to fix.
 *
 * So the wave refuses to run while the sweep is unfinished. That is a rule
 * about the whole guest list rather than about one guest, which is why it
 * lives here and not in the per-guest eligibility above.
 */
export type TicketReadiness = {
  /** There is at least one person to send a ticket to. The only real blocker. */
  canSend: boolean
  /** Answered yes: the actual audience for the ticket. */
  recipients: number
  /**
   * Never answered, so they receive no ticket and would be refused at the door.
   *
   * Advisory. This used to stop the whole wave, which meant a handful of people
   * who never reply could withhold every ticket from the people who did, on the
   * one date in this project that cannot move. It is a number to put in front of
   * somebody, not a reason to refuse.
   */
  unanswered: number
}

export type TicketCandidate = {
  /** Every invited event has an answer on file. */
  answered: boolean
  /** At least one of those answers was yes. */
  attending: boolean
}

export function ticketReadiness(guests: TicketCandidate[]): TicketReadiness {
  return {
    recipients: guests.filter((g) => g.answered && g.attending).length,
    unanswered: guests.filter((g) => !g.answered).length,
    canSend: guests.some((g) => g.answered && g.attending),
  }
}
