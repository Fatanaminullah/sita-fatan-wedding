'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDayKeys, toDayKey, type DayKey } from '@/domain/planner'

export type CalendarView = 'month' | 'week' | 'day'

function shift(view: CalendarView, dateKey: DayKey, direction: 1 | -1): DayKey {
  if (view === 'day') return addDayKeys(dateKey, direction * 1)
  if (view === 'week') return addDayKeys(dateKey, direction * 7)
  const [year, month] = dateKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + direction, 1)
  return toDayKey(shifted)
}

function title(view: CalendarView, dateKey: DayKey): string {
  const date = new Date(`${dateKey}T00:00:00`)
  if (view === 'month') return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (view === 'day') return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
}

function href(view: CalendarView, dateKey: DayKey) {
  return `/planner/calendar?view=${view}&date=${dateKey}`
}

/**
 * Every control here is a primary control per DESIGN.md's Two Densities
 * Rule: the arrows, Today, and the view switcher are all touch density
 * (44px minimum), not ops density, even though this nav also serves the
 * desktop admin screen. The view switcher's segments are `h-11`, not the
 * `h-9` a desktop-only segmented control would use, because this same nav
 * renders on phone and touch density is chosen from the surface, never
 * from the device.
 */
export function CalendarNav({ view, dateKey }: { view: CalendarView; dateKey: DayKey }) {
  const todayKey = toDayKey(new Date())

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 py-2 backdrop-blur">
      <Link
        href={href(view, shift(view, dateKey, -1))}
        aria-label="Previous"
        className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <Link
        href={href(view, todayKey)}
        className="flex h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        Today
      </Link>
      <Link
        href={href(view, shift(view, dateKey, 1))}
        aria-label="Next"
        className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        <ChevronRight className="size-4" />
      </Link>

      <span className="ml-1 min-w-0 flex-1 truncate text-sm font-medium">{title(view, dateKey)}</span>

      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {(['day', 'week', 'month'] as const).map((option) => (
          <Link
            key={option}
            href={href(option, dateKey)}
            aria-current={option === view ? 'page' : undefined}
            className={`flex h-11 items-center rounded-md px-3 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
              option === view ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}
          </Link>
        ))}
      </div>
    </div>
  )
}
