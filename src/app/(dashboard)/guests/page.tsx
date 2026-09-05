import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listGuests } from '@/server/repositories/guests-repository'
import { listInviters } from '@/server/repositories/inviters-repository'
import { GuestTable, type GuestListRow } from './guest-table'

type GuestEventRow = {
  event: 'akad' | 'resepsi'
  invite_status: 'confirmed' | 'waitlisted'
  rsvp_status: 'pending' | 'attending' | 'not_attending'
  pax_confirmed?: number | null
}

type WaSendRow = {
  kind: string
  status: string
  sent_at: string | null
  error_message: string | null
}

/**
 * How far the invitation actually got.
 *
 * A guest can have several attempts. The furthest one is the truth: a failure
 * followed by a successful retry is delivered, not failed, and a failure that
 * was never retried is the whole story and must not be hidden behind an
 * earlier "sent". Ordering the states and taking the maximum says both.
 */
const DELIVERY_RANK = { failed: 0, sent: 1, delivered: 2, read: 3 } as const

function inviteDelivery(sends: WaSendRow[]): {
  status: 'none' | 'failed' | 'sent' | 'delivered' | 'read'
  at: string | null
  error: string | null
} {
  const invites = sends.filter((s) => s.kind === 'invite')
  if (invites.length === 0) return { status: 'none', at: null, error: null }

  const best = invites.reduce((furthest, candidate) => {
    const a = DELIVERY_RANK[candidate.status as keyof typeof DELIVERY_RANK] ?? -1
    const b = DELIVERY_RANK[furthest.status as keyof typeof DELIVERY_RANK] ?? -1
    return a > b ? candidate : furthest
  })

  const status = (
    best.status in DELIVERY_RANK ? best.status : 'sent'
  ) as 'failed' | 'sent' | 'delivered' | 'read'

  return {
    status,
    at: best.sent_at,
    error: status === 'failed' ? best.error_message : null,
  }
}

/** null when they hold no invitation to that event, so there is nothing to answer. */
function rsvpOf(events: GuestEventRow[], event: 'akad' | 'resepsi') {
  return events.find((row) => row.event === event)?.rsvp_status ?? null
}

function paxConfirmedOf(events: GuestEventRow[], event: 'akad' | 'resepsi') {
  return events.find((row) => row.event === event)?.pax_confirmed ?? null
}

function declined(events: GuestEventRow[], event: 'akad' | 'resepsi'): boolean {
  return events.find((row) => row.event === event)?.rsvp_status === 'not_attending'
}

function statusOf(events: GuestEventRow[], event: 'akad' | 'resepsi'): GuestListRow['akad'] {
  return events.find((row) => row.event === event)?.invite_status ?? 'none'
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ missingPhone?: string; inviter?: string; unanswered?: string }>
}) {
  const { missingPhone, inviter: inviterParam, unanswered } = await searchParams
  const [profile, supabase] = await Promise.all([getCurrentProfile(), getServerSupabase()])
  // An usher has no guests-table RLS access at all, so this page would render
  // an empty list that reads like "no guests exist" rather than "not for you".
  if (profile?.role === 'usher') {
    return (
      <main className="p-4 md:p-6">
        <h1 className="mb-2 text-xl font-semibold">Guests</h1>
        <p className="text-sm text-muted-foreground">The guest list is not available for your role.</p>
      </main>
    )
  }

  const [guests, inviters] = await Promise.all([listGuests(supabase), listInviters(supabase)])

  // An inviter can read all six inviter keys but may only write under their
  // own (guests_inviter_own). A side-scoped admin can write across their own
  // side but not the other one. Offering keys they cannot write is an
  // affordance that can only ever fail, so each role gets the keys it can use.
  const ownInviters =
    profile?.role === 'inviter' && profile.inviterKey
      ? inviters.filter((inviter) => inviter.key === profile.inviterKey)
      : profile?.role === 'admin' && profile.side
        ? inviters.filter((inviter) => inviter.side === profile.side)
        : inviters
  const selectableInviters = ownInviters.map((inviter) => inviter.key as string)

  // Same narrowing as the dialog, for the same reason: a scoped role's RLS
  // view of guests is narrower than its view of the inviters table, so every
  // inviter outside that scope would read zero used against a real cap. That
  // is indistinguishable from a genuinely empty inviter, so it looks like
  // unclaimed room, and it also puts the other side's caps on screen for
  // somebody who has no business acting on them.
  // Derived, not read off the profile: it is true for a side-scoped admin and
  // equally true for an inviter, whose one inviter row also sits on one side.
  const sidesInScope = new Set(ownInviters.map((inviter) => inviter.side as 'fatan' | 'sita'))
  const scopedSide = sidesInScope.size === 1 ? [...sidesInScope][0] : null

  const inviterCaps = ownInviters.map((inviter) => ({
    key: inviter.key as string,
    akadCap: inviter.akad_cap as number,
    resepsiCap: inviter.resepsi_cap as number,
  }))

  const rows: GuestListRow[] = guests.map((guest) => {
    const events = (guest.guest_events ?? []) as GuestEventRow[]
    const akad = statusOf(events, 'akad')
    const resepsi = statusOf(events, 'resepsi')
    const delivery = inviteDelivery((guest.wa_sends ?? []) as WaSendRow[])
    return {
      inviteDelivery: delivery.status,
      inviteSentAt: delivery.at,
      inviteError: delivery.error,
      firstOpenedAt: guest.first_opened_at ?? null,
      id: guest.id,
      name: guest.name,
      pax: guest.pax,
      side: guest.side,
      inviterKey: guest.inviter_key,
      type: guest.type,
      isVip: guest.is_vip,
      isPhysicalInvitation: guest.is_physical_invitation,
      candid: Boolean(guest.candid),
      note: guest.note,
      phone: guest.phone,
      language: guest.language,
      akad,
      resepsi,
      akadDeclined: declined(events, 'akad'),
      resepsiDeclined: declined(events, 'resepsi'),
      akadRsvp: rsvpOf(events, 'akad'),
      resepsiRsvp: rsvpOf(events, 'resepsi'),
      akadPaxConfirmed: paxConfirmedOf(events, 'akad'),
      resepsiPaxConfirmed: paxConfirmedOf(events, 'resepsi'),
      isWaitlisted: akad === 'waitlisted' || resepsi === 'waitlisted',
    }
  })

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guests</h1>
        <p className="text-sm text-muted-foreground">Every column the spreadsheet had, filterable.</p>
      </div>

      <GuestTable
        guests={rows}
        inviters={selectableInviters}
        inviterCaps={inviterCaps}
        initialMissingPhone={missingPhone === '1'}
        initialUnanswered={unanswered === '1'}
        initialInviter={inviterParam}
        canWrite={profile?.role === 'superadmin' || profile?.role === 'admin' || profile?.role === 'inviter'}
        // Answering for a guest is admin and above, which the
        // guard_guest_events_rsvp_columns trigger enforces regardless. An
        // inviter gets no control rather than one that would only fail.
        canAnswerRsvp={profile?.role === 'superadmin' || profile?.role === 'admin'}
        canSetCandid={profile?.role === 'superadmin'}
        scopedSide={scopedSide}
      />
    </main>
  )
}
