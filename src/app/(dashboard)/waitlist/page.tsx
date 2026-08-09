import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getCascadeForEvent } from '@/server/actions/waitlist-actions'
import { Button } from '@/components/ui/button'
import { WaitlistCascade, type EventCascade } from './waitlist-cascade'

const EVENTS = ['akad', 'resepsi'] as const

export default async function WaitlistPage() {
  const profile = await getCurrentProfile()
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    redirect('/dashboard')
  }

  // Ordered by the slot-fill cascade rather than raw query order, so the list
  // clusters by inviter then side instead of arriving shuffled.
  const cascades: EventCascade[] = await Promise.all(
    EVENTS.map(async (event) => ({ event, ...(await getCascadeForEvent(event)) }))
  )

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
          <p className="text-sm text-muted-foreground">Slot-fill cascade, per event.</p>
        </div>
        <Button render={<a href="/waitlist" />} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      <WaitlistCascade cascades={cascades} />
    </main>
  )
}
