import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadDashboardSummary } from '@/server/repositories/dashboard-repository'
import { countMissingPhone } from '@/server/repositories/guests-repository'

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  // An usher has no guests-table RLS access at all, so this page would render
  // an all-zero capacity table with no error — worse than saying nothing.
  if (profile?.role === 'usher') {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-600">Dashboard is not available for your role.</p>
      </main>
    )
  }

  const supabase = await getServerSupabase()
  const [fullSummary, missingPhoneCount] = await Promise.all([
    loadDashboardSummary(supabase),
    countMissingPhone(supabase),
  ])

  // RLS scopes an inviter's pax sum to their own guests, so every OTHER
  // inviter's row would come back "0 invited" — indistinguishable from a
  // genuinely empty inviter. Show them only the row that is actually true.
  const scoped =
    profile?.role === 'inviter' && profile.inviterKey
      ? fullSummary.filter((row) => row.inviterKey === profile.inviterKey)
      : fullSummary

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-gray-500">{missingPhoneCount} guests missing a phone number.</p>
      {profile?.role === 'inviter' ? (
        <p className="mb-4 text-sm text-gray-500">Showing your own invites only.</p>
      ) : null}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Inviter</th>
            <th className="py-2">Event</th>
            <th className="py-2">Invited</th>
            <th className="py-2">Cap</th>
          </tr>
        </thead>
        <tbody>
          {scoped.map((row) => (
            <tr key={`${row.inviterKey}-${row.event}`} className={`border-b ${row.overCap ? 'bg-red-50' : ''}`}>
              <td className="py-2">{row.inviterKey}</td>
              <td className="py-2 capitalize">{row.event}</td>
              <td className={`py-2 ${row.overCap ? 'font-semibold text-red-700' : ''}`}>{row.invited}</td>
              <td className="py-2">{row.cap}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
