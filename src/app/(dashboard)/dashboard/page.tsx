import { getServerSupabase } from '@/server/supabase/server-client'
import { loadDashboardSummary } from '@/server/repositories/dashboard-repository'
import { countMissingPhone } from '@/server/repositories/guests-repository'

export default async function DashboardPage() {
  const supabase = await getServerSupabase()
  const [summary, missingPhoneCount] = await Promise.all([
    loadDashboardSummary(supabase),
    countMissingPhone(supabase),
  ])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-gray-500">{missingPhoneCount} guests missing a phone number.</p>
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
          {summary.map((row) => (
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
