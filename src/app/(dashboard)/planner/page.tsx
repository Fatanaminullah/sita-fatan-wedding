import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function PlannerHomePage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-medium">Planner</h1>
    </div>
  )
}
