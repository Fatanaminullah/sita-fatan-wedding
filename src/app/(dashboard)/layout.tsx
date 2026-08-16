import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from './app-sidebar'
import { PageTitle } from './page-title'
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
          {/* Inset by margin, not by height. The Separator carries
              `data-vertical:self-stretch`, and Tailwind emits variant
              utilities after plain ones, so neither `h-5` nor `self-center`
              can win the align-self fight: the rule stretches, an explicit
              height then pins it to the top edge, and you get a short line
              hanging from the header's top. Letting it stretch and clipping
              it with vertical margin gives a centred 24px rule in a 56px
              header with nothing to override. */}
          <Separator orientation="vertical" className="my-4" />
          <PageTitle />
        </header>
        <div className="flex-1 bg-background">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
