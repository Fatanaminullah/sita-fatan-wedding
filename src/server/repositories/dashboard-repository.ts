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
  const [guestsResult, invitersResult, sideCapsResult, physicalResult] = await Promise.all([
    supabase
      .from('guests')
      .select('id, pax, side, inviter_key, type, is_vip, phone, guest_events(event, invite_status, rsvp_status)'),
    supabase.from('inviters').select('key, side, akad_cap, resepsi_cap').order('key'),
    supabase.from('side_caps').select('side, vip_cap, physical_cap'),
    // Printed-card counts come from a definer function, not the guests query
    // above: the pool is shared by the whole side, and an inviter's RLS view
    // of guests is partial. See physical_invitation_counts() in migrations.
    supabase.rpc('physical_invitation_counts'),
  ])

  if (guestsResult.error) throw new Error(`Failed to load guests for dashboard: ${guestsResult.error.message}`)
  if (invitersResult.error) throw new Error(`Failed to load inviters for dashboard: ${invitersResult.error.message}`)
  if (sideCapsResult.error) throw new Error(`Failed to load side caps for dashboard: ${sideCapsResult.error.message}`)
  if (physicalResult.error)
    throw new Error(`Failed to load printed invitation counts: ${physicalResult.error.message}`)

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
    physicalCapBySide: Object.fromEntries(
      (sideCapsResult.data ?? []).map((row) => [row.side as Side, row.physical_cap as number])
    ) as Record<Side, number>,
    physicalUsedBySide: {
      fatan: 0,
      sita: 0,
      ...Object.fromEntries(
        ((physicalResult.data ?? []) as Array<{ side: Side; used: number }>).map((row) => [
          row.side,
          Number(row.used),
        ])
      ),
    },
  }

  return buildSummary(guests, caps)
}

/**
 * An inviter sees only their own guests through RLS, so every other inviter's
 * row would read "0 invited" — indistinguishable from a genuinely empty
 * inviter. Narrow the summary to the rows that are actually true for them.
 */
