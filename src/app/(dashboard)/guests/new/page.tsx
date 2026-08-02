import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { GuestForm } from './guest-form'

export default async function NewGuestPage() {
  const [profile, supabase] = await Promise.all([getCurrentProfile(), getServerSupabase()])
  const inviters = await listInviters(supabase)

  // An inviter-role user can read all 6 inviters (inviters_*_read RLS), but
  // guests_inviter_own only lets them INSERT under their own key. Offering the
  // other 5 in the dropdown is an affordance that can only ever fail, so don't
  // offer them. RLS is still the enforcement; this is just the UI matching it.
  const selectable =
    profile?.role === 'inviter' && profile.inviterKey
      ? inviters.filter((inviter) => inviter.key === profile.inviterKey)
      : inviters

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <GuestForm inviters={selectable} />
    </main>
  )
}
