import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile, signOut } from '@/server/actions/auth-actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }

  return (
    <div>
      <nav className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-4 p-4 text-sm">
          <Link href="/dashboard" className="font-medium hover:underline">
            Dashboard
          </Link>
          <Link href="/guests" className="font-medium hover:underline">
            Guests
          </Link>
          {profile.role === 'admin' ? (
            <Link href="/waitlist" className="font-medium hover:underline">
              Waitlist
            </Link>
          ) : null}
          <span className="ml-auto text-gray-500">
            {profile.role}
            {profile.inviterKey ? ` (${profile.inviterKey})` : ''}
          </span>
          <form action={signOut}>
            <button type="submit" className="rounded border px-2 py-1 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      {children}
    </div>
  )
}
