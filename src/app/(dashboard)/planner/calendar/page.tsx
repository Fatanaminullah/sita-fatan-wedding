import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function PlannerCalendarPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <h1 className="text-xl font-medium">Calendar</h1>
    </div>
  )
}
