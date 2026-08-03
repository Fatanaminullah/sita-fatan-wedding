import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSummary, type Summary, type SummaryCaps, type SummaryGuest, type Side } from '@/domain/summary'

export type { Summary }

type GuestEventRow = {
  event: 'akad' | 'resepsi'
  invite_status: 'confirmed' | 'waitlisted'
  rsvp_status: 'pending' | 'attending' | 'not_attending'
}

type GuestRow = {
  id: string
  pax: number
  side: Side
  inviter_key: string
  type: 'family' | 'friend'
  is_vip: boolean
  phone: string | null
  guest_events: GuestEventRow[] | null
}

/**
 * One round trip for the guest list, one each for the two cap tables. The
 * previous shape ran two queries per inviter per event; every figure on the
 * dashboard now comes off the same snapshot, so no two cards can disagree.
 *
 * RLS scopes the guests query by role automatically — an inviter's summary
 * counts their own rows only. Do not add a manual inviter_key filter here.
 */
export async function loadDashboardSummary(supabase: SupabaseClient): Promise<Summary> {
  const [guestsResult, invitersResult, sideCapsResult] = await Promise.all([
    supabase
      .from('guests')
      .select('id, pax, side, inviter_key, type, is_vip, phone, guest_events(event, invite_status, rsvp_status)'),
    supabase.from('inviters').select('key, side, akad_cap, resepsi_cap').order('key'),
    supabase.from('side_caps').select('side, vip_cap'),
  ])

  if (guestsResult.error) throw new Error(`Failed to load guests for dashboard: ${guestsResult.error.message}`)
  if (invitersResult.error) throw new Error(`Failed to load inviters for dashboard: ${invitersResult.error.message}`)
  if (sideCapsResult.error) throw new Error(`Failed to load side caps for dashboard: ${sideCapsResult.error.message}`)

  const guests: SummaryGuest[] = ((guestsResult.data ?? []) as unknown as GuestRow[]).map((row) => ({
    id: row.id,
    pax: row.pax,
    side: row.side,
    inviterKey: row.inviter_key,
    type: row.type,
    isVip: row.is_vip,
    hasPhone: Boolean(row.phone),
    events: (row.guest_events ?? []).map((event) => ({
      event: event.event,
      inviteStatus: event.invite_status,
      rsvpStatus: event.rsvp_status,
    })),
  }))

  const caps: SummaryCaps = {
    inviters: (invitersResult.data ?? []).map((row) => ({
      key: row.key as string,
      side: row.side as Side,
      akadCap: row.akad_cap as number,
      resepsiCap: row.resepsi_cap as number,
    })),
    vipCapBySide: Object.fromEntries(
      (sideCapsResult.data ?? []).map((row) => [row.side as Side, row.vip_cap as number])
    ) as Record<Side, number>,
  }

  return buildSummary(guests, caps)
}

/**
 * An inviter sees only their own guests through RLS, so every other inviter's
 * row would read "0 invited" — indistinguishable from a genuinely empty
 * inviter. Narrow the summary to the rows that are actually true for them.
 */
export function scopeSummaryToInviter(summary: Summary, inviterKey: string): Summary {
  const inviters = summary.inviters.filter((row) => row.inviterKey === inviterKey)
  const side = inviters[0]?.side
  return {
    ...summary,
    inviters,
    sides: side ? summary.sides.filter((row) => row.side === side) : summary.sides,
    waitlist: {
      ...summary.waitlist,
      byInviter: summary.waitlist.byInviter.filter((row) => row.inviterKey === inviterKey),
    },
  }
}
