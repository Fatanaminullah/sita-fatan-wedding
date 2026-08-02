import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }
  return <div>{children}</div>
}
