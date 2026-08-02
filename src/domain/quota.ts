export type QuotaState = {
  cap: number
  confirmedPax: number
}

export type QuotaDecision = {
  allowed: true
  overCap: boolean
  remaining: number
  overBy: number
}

export function checkQuota(state: QuotaState, addingPax: number): QuotaDecision {
  const projected = state.confirmedPax + addingPax
  const remaining = state.cap - projected
  const overCap = remaining < 0
  return {
    allowed: true,
    overCap,
    remaining,
    overBy: overCap ? -remaining : 0,
  }
}
