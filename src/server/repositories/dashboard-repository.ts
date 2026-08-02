import type { SupabaseClient } from '@supabase/supabase-js'
import { checkQuota } from '@/domain/quota'
import { loadInviterCapacity } from './inviters-repository'

export type InviterSummary = {
  inviterKey: string
  event: 'akad' | 'resepsi'
  cap: number
  invited: number
  confirmed: number
  overCap: boolean
}

const EVENTS = ['akad', 'resepsi'] as const

export async function loadDashboardSummary(supabase: SupabaseClient): Promise<InviterSummary[]> {
  const { data: inviters, error } = await supabase.from('inviters').select('key')
  if (error) throw new Error(`Failed to load inviters for dashboard: ${error.message}`)

  const summaries: InviterSummary[] = []
  for (const inviter of inviters ?? []) {
    for (const event of EVENTS) {
      const state = await loadInviterCapacity(supabase, inviter.key, event)
      // confirmedPax already reflects invited-and-not-declined; Phase 1 has
      // no RSVP yet, so "invited" and "confirmed" are the same number here
      // by construction, not a stand-in for a feature that doesn't exist.
      const decision = checkQuota(state, 0)
      summaries.push({
        inviterKey: inviter.key,
        event,
        cap: state.cap,
        invited: state.confirmedPax,
        confirmed: state.confirmedPax,
        overCap: decision.overCap,
      })
    }
  }
  return summaries
}
