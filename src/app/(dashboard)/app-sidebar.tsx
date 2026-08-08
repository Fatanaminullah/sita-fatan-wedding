'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ListOrdered,
  SlidersHorizontal,
  KeyRound,
  History,
  LogOut,
  CalendarDays,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  useSidebar,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { signOut } from '@/server/actions/auth-actions'

type Profile = {
  role: 'admin' | 'inviter' | 'usher' | 'viewer'
  inviterKey: string | null
}

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  /**
   * On phone the sidebar is a sheet over the page, so following a link leaves
   * it covering the destination it just navigated to. Desktop keeps its
   * sidebar open on purpose, hence the `isMobile` guard rather than closing
   * unconditionally.
   */
  function closeOnMobileNav() {
    if (isMobile) setOpenMobile(false)
  }

  const items = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/planner', label: 'Planner', icon: CalendarDays, show: profile.role === 'admin' },
    // Ushers have zero guests-table RLS access — hide the link rather than
    // send them to a page that would render an empty, misleading table.
    { href: '/guests', label: 'Guests', icon: Users, show: profile.role !== 'usher' },
    { href: '/waitlist', label: 'Waitlist', icon: ListOrdered, show: profile.role === 'admin' },
    { href: '/caps', label: 'Caps', icon: SlidersHorizontal, show: profile.role === 'admin' },
    { href: '/users', label: 'Accounts', icon: KeyRound, show: profile.role === 'admin' },
    { href: '/audit', label: 'Audit', icon: History, show: profile.role === 'admin' },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            SF
          </div>
          <span className="truncate font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Sita &amp; Fatan
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items
                .filter((item) => item.show)
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} onClick={closeOnMobileNav} />}
                      isActive={item.href === '/planner' ? pathname.startsWith('/planner') : pathname === item.href}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-1 text-xs text-muted-foreground capitalize group-data-[collapsible=icon]:hidden">
              {profile.role}
              {profile.inviterKey ? ` · ${profile.inviterKey}` : ''}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton type="submit" tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
