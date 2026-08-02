export type WaitlistedGuest = {
  guestId: string
  inviterKey: string
  side: 'fatan' | 'sita'
  pax: number
  waitlistRank: number | null
}

export type CascadeTier = 'same_inviter' | 'same_side' | 'global'

export type CascadeOffer = {
  tier: CascadeTier
  guest: WaitlistedGuest
}

function byRankAscendingNullsLast(a: WaitlistedGuest, b: WaitlistedGuest): number {
  const rankA = a.waitlistRank ?? Number.MAX_SAFE_INTEGER
  const rankB = b.waitlistRank ?? Number.MAX_SAFE_INTEGER
  return rankA - rankB
}

export function buildCascade(
  pool: WaitlistedGuest[],
  context: { inviterKey: string; side: 'fatan' | 'sita' }
): CascadeOffer[] {
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

export type PromotionDecision = {
  allowed: true
  overCap: boolean
  remainingAfter: number
}

export function checkPromotion(remainingBefore: number, guestPax: number): PromotionDecision {
  const remainingAfter = remainingBefore - guestPax
  return { allowed: true, overCap: remainingAfter < 0, remainingAfter }
}
