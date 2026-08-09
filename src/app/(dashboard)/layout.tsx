import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from './app-sidebar'
import { CountdownStrip } from '@/components/planner/countdown-strip'
import { toDayKey } from '@/domain/planner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }

  return (
    <SidebarProvider>
      <AppSidebar profile={profile} />
      <SidebarInset>
        {profile.role === 'superadmin' ? <CountdownStrip todayKey={toDayKey(new Date())} /> : null}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-muted-foreground">Guest Management</span>
        </header>
        <div className="flex-1 bg-background">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
