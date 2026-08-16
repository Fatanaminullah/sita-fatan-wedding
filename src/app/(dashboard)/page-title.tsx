'use client'

import { usePathname } from 'next/navigation'

// The header used to read "Guest Management" on every route, including Caps,
// Accounts, Audit and the whole planner, where it is simply wrong. The chrome
// is the first place a first-timer looks to answer "where am I".
const TITLES: [prefix: string, title: string][] = [
  ['/planner/tasks', 'Planner · Tasks'],
  ['/planner/calendar', 'Planner · Calendar'],
  ['/planner', 'Planner'],
  ['/dashboard', 'Dashboard'],
  ['/guests', 'Guests'],
  ['/waitlist', 'Waitlist'],
  ['/caps', 'Caps'],
  ['/users', 'Accounts'],
  ['/audit', 'Audit'],
]

export function PageTitle() {
  const pathname = usePathname()
  // Longest prefixes first, so /planner/tasks is not swallowed by /planner.
  const match = TITLES.find(([prefix]) => pathname.startsWith(prefix))

  return (
    <span className="text-sm font-medium text-muted-foreground">
      {match ? match[1] : 'Guest Management'}
    </span>
  )
}
