import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listGuests } from '@/server/repositories/guests-repository'
import { listInviters } from '@/server/repositories/inviters-repository'
import { GuestTable, type GuestListRow } from './guest-table'

type GuestEventRow = {
  event: 'akad' | 'resepsi'
  invite_status: 'confirmed' | 'waitlisted'
}

function statusOf(events: GuestEventRow[], event: 'akad' | 'resepsi'): GuestListRow['akad'] {
  return events.find((row) => row.event === event)?.invite_status ?? 'none'
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ missingPhone?: string; inviter?: string }>
}) {
  const { missingPhone, inviter: inviterParam } = await searchParams
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
  // own (guests_inviter_own). Offering the other five is an affordance that
  // can only ever fail, so the dialog gets the one key they can actually use.
  const selectableInviters = (
    profile?.role === 'inviter' && profile.inviterKey
      ? inviters.filter((inviter) => inviter.key === profile.inviterKey)
      : inviters
  ).map((inviter) => inviter.key as string)

  const rows: GuestListRow[] = guests.map((guest) => {
    const events = (guest.guest_events ?? []) as GuestEventRow[]
    const akad = statusOf(events, 'akad')
    const resepsi = statusOf(events, 'resepsi')
    return {
      id: guest.id,
      name: guest.name,
      pax: guest.pax,
      side: guest.side,
      inviterKey: guest.inviter_key,
      type: guest.type,
      isVip: guest.is_vip,
      note: guest.note,
      phone: guest.phone,
      akad,
      resepsi,
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
        initialMissingPhone={missingPhone === '1'}
        initialInviter={inviterParam}
        canWrite={profile?.role === 'admin' || profile?.role === 'inviter'}
      />
    </main>
  )
}
