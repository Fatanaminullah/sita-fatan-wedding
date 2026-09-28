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
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'viewer')) redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [tables, assignments] = await Promise.all([listVipTables(supabase), listSeatAssignments(supabase)])
  const guests = await listSeatingGuests(
    supabase,
    assignments.map((a) => a.guestId)
  )

  return (
    <main className="p-4 pb-28 md:p-6">
      <SeatingBoard
        tables={tables}
        guests={guests}
        assignments={assignments}
        readOnly={profile.role !== 'superadmin'}
      />
    </main>
  )
}
