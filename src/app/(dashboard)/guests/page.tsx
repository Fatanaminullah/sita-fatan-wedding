import Link from 'next/link'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listGuests, countMissingPhone } from '@/server/repositories/guests-repository'

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ missingPhone?: string }>
}) {
  const { missingPhone } = await searchParams
  const supabase = await getServerSupabase()
  const [allGuests, missingPhoneCount] = await Promise.all([
    listGuests(supabase),
    countMissingPhone(supabase),
  ])
  const guests = missingPhone === '1' ? allGuests.filter((g) => !g.phone) : allGuests

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Guests</h1>
        <Link href="/guests/new" className="rounded bg-black px-3 py-2 text-sm text-white">
          Add guest
        </Link>
      </div>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span>{missingPhoneCount} missing phone</span>
        {missingPhone === '1' ? (
          <Link href="/guests" className="text-blue-600 underline">
            Clear filter
          </Link>
        ) : (
          <Link href="/guests?missingPhone=1" className="text-blue-600 underline">
            Show missing phone only
          </Link>
        )}
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Pax</th>
            <th className="py-2">Inviter</th>
            <th className="py-2">Phone</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id} className="border-b">
              <td className="py-2">{guest.name}</td>
              <td className="py-2">{guest.pax}</td>
              <td className="py-2">{guest.inviter_key}</td>
              <td className="py-2">{guest.phone ?? <span className="text-red-600">missing</span>}</td>
              <td className="py-2">
                <Link href={`/guests/${guest.id}/edit`} className="text-blue-600 underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
