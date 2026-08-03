import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { listUsers } from '@/server/actions/user-actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UsersManager } from './users-manager'

export default async function UsersPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [users, inviters] = await Promise.all([listUsers(), listInviters(supabase)])

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Logins are created here and handed over. No self-signup, no magic link, no OTP.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">People with a login</CardTitle>
          <CardDescription>
            An inviter account only ever sees its own guests. Ushers get one account per device so the
            check-in log says who scanned. Password resets happen here, not by email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersManager
            users={users}
            inviters={inviters.map((inviter) => inviter.key as string)}
            currentUserId={profile.userId}
          />
        </CardContent>
      </Card>
    </main>
  )
}
