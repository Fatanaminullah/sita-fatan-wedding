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
  MessageSquare,
  CalendarDays,
  ScanLine,
  ClipboardCheck,
  Send,
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
import { inviterLabel } from '@/lib/inviter-label'
import { Monogram } from '@/components/monogram'

type Profile = {
  role: 'superadmin' | 'admin' | 'inviter' | 'usher' | 'viewer'
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
    // The day-of screens. Shown to everyone who works a door, which is the one
    // thing an usher's account is for.
    {
      href: '/checkin',
      label: 'Scan',
      icon: ScanLine,
      show:
        profile.role === 'superadmin' || profile.role === 'admin' || profile.role === 'usher',
    },
    // The Akad's tick-list, and the Resepsi's repair tool. Separate entry
    // because the scan kiosk deliberately carries no navigation of its own:
    // it stands facing a guest for hours and must not offer a way into the
    // rest of the app.
    {
      href: '/checkin/list',
      label: 'Check-in',
      icon: ClipboardCheck,
      show:
        profile.role === 'superadmin' || profile.role === 'admin' || profile.role === 'usher',
    },
    { href: '/planner', label: 'Planner', icon: CalendarDays, show: profile.role === 'superadmin' },
    // Ushers have zero guests-table RLS access — hide the link rather than
    // send them to a page that would render an empty, misleading table.
    { href: '/guests', label: 'Guests', icon: Users, show: profile.role !== 'usher' },
    {
      href: '/waitlist',
      label: 'Waitlist',
      icon: ListOrdered,
      show: profile.role === 'superadmin' || profile.role === 'admin' || profile.role === 'inviter',
    },
    // Mirrors wa_messages RLS: superadmin sees every thread, an admin their
    // own side's guests plus every unresolved number. Nobody else has a policy.
    {
      href: '/inbox',
      label: 'Inbox',
      icon: MessageSquare,
      show: profile.role === 'superadmin' || profile.role === 'admin',
    },
    // The send console. Admin and above only: an inviter has no business
    // messaging the whole guest list.
    {
      href: '/messages',
      label: 'Messages',
      icon: Send,
      show: profile.role === 'superadmin' || profile.role === 'admin',
    },
    { href: '/caps', label: 'Caps', icon: SlidersHorizontal, show: profile.role === 'superadmin' },
    { href: '/users', label: 'Accounts', icon: KeyRound, show: profile.role === 'superadmin' },
    { href: '/audit', label: 'Audit', icon: History, show: profile.role === 'superadmin' },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Monogram size={32} />
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
              {profile.inviterKey ? ` · ${inviterLabel(profile.inviterKey)}` : ''}
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
