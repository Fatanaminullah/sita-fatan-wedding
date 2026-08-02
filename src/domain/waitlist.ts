export type WaitlistedGuest = {
  guestId: string
  inviterKey: string
  side: 'fatan' | 'sita'
  pax: number
  waitlistRank: number | null
}

export type CascadeTier = 'same_inviter' | 'same_side' | 'global'

export type CascadeOffer<T extends WaitlistedGuest = WaitlistedGuest> = {
  tier: CascadeTier
  guest: T
}

export type CascadeContext = { inviterKey: string; side: 'fatan' | 'sita' }

function byRankAscendingNullsLast(a: WaitlistedGuest, b: WaitlistedGuest): number {
  const rankA = a.waitlistRank ?? Number.MAX_SAFE_INTEGER
  const rankB = b.waitlistRank ?? Number.MAX_SAFE_INTEGER
  return rankA - rankB
}

// Generic over the pool element so callers can carry their own extra fields
// (guestEventId, name) through the cascade without a second lookup.
export function buildCascade<T extends WaitlistedGuest>(
  pool: T[],
  context: CascadeContext
): CascadeOffer<T>[] {
  const sameInviter = pool
    .filter((g) => g.inviterKey === context.inviterKey)
    .sort(byRankAscendingNullsLast)
  const sameSide = pool
    .filter((g) => g.inviterKey !== context.inviterKey && g.side === context.side)
    .sort(byRankAscendingNullsLast)
  const global = pool
    .filter((g) => g.side !== context.side)
    .sort(byRankAscendingNullsLast)

  return [
    ...sameInviter.map((guest) => ({ tier: 'same_inviter' as const, guest })),
    ...sameSide.map((guest) => ({ tier: 'same_side' as const, guest })),
    ...global.map((guest) => ({ tier: 'global' as const, guest })),
  ]
}

/**
 * The admin waitlist screen is a global view, so "same inviter as whom?" has
 * no caller-supplied answer. Anchor on the guest who is next in line for the
 * event (lowest waitlist_rank, unranked last): the cascade from that anchor is
 * the order a freed slot would actually be offered in.
 */
export function pickCascadeAnchor(pool: WaitlistedGuest[]): CascadeContext | null {
  if (pool.length === 0) return null
  const first = [...pool].sort(byRankAscendingNullsLast)[0]
  return { inviterKey: first.inviterKey, side: first.side }
}

export type PromotionDecision = {
  allowed: true
  overCap: boolean
  remainingAfter: number
}

export function checkPromotion(remainingBefore: number, guestPax: number): PromotionDecision {
  const remainingAfter = remainingBefore - guestPax
  return { allowed: true, overCap: remainingAfter < 0, remainingAfter }
}
