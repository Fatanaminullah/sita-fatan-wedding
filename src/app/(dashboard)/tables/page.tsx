import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import {
  listSeatAssignments,
  listSeatingGuests,
  listVipTables,
} from '@/server/repositories/vip-tables-repository'
import { SeatingBoard } from './seating-board'

export default async function VipTablesPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role === 'usher') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [tables, assignments, guests] = await Promise.all([
    listVipTables(supabase),
    listSeatAssignments(supabase),
    listSeatingGuests(supabase),
  ])

  // Who this person seats. Everyone sees the whole plan; the couple seat
  // anyone, an admin their side, an inviter their own guests, the WO crew
  // nobody. RLS enforces the same (vip_seat_manageable).
  const manages =
    profile.role === 'superadmin'
      ? ({ kind: 'all' } as const)
      : profile.role === 'admin' && profile.side
        ? ({ kind: 'side', side: profile.side } as const)
        : profile.role === 'inviter' && profile.inviterKey
          ? ({ kind: 'inviter', inviterKey: profile.inviterKey } as const)
          : ({ kind: 'none' } as const)

  return (
    <main className="p-4 pb-28 md:p-6">
      <SeatingBoard
        tables={tables}
        guests={guests}
        assignments={assignments}
        manages={manages}
        canEditTables={profile.role === 'superadmin'}
      />
    </main>
  )
}
