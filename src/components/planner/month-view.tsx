'use client'

import Link from 'next/link'
import { buildMonthGrid, type DayKey, type DaySegment, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Phone shows 2 chips then a count; desktop shows 3. Tapping a day navigates
 * to the day view rather than opening a popover, which is unusable on a phone.
 */
export function MonthView({
  monthKey,
  segments,
  todayKey,
  onOpen,
}: {
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
}) {
  const grid = buildMonthGrid(monthKey)

  const byDay = new Map<DayKey, PlannerItem[]>()
  for (const segment of segments) {
    const existing = byDay.get(segment.dayKey) ?? []
    existing.push(segment.item)
    byDay.set(segment.dayKey, existing)
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-7 border-b bg-card">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
            <span className="md:hidden">{day.slice(0, 1)}</span>
            <span className="hidden md:inline">{day}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.flat().map((dayKey) => {
          const items = byDay.get(dayKey) ?? []
          const inMonth = dayKey.startsWith(monthKey)
          const isToday = dayKey === todayKey
          const limit = 3

          return (
            <div
              key={dayKey}
              className={`min-h-24 border-r border-b p-1 last:border-r-0 md:min-h-32 ${
                inMonth ? 'bg-card' : 'bg-muted/40'
              }`}
            >
              <Link
                href={`/planner/calendar?view=day&date=${dayKey}`}
                className={`mb-1 flex size-7 items-center justify-center rounded-md font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {Number(dayKey.slice(-2))}
              </Link>

              <div className="flex flex-col gap-0.5">
                {items.slice(0, 2).map((item) => (
                  <ItemChip key={`${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
                ))}
                <div className="hidden md:contents">
                  {items.slice(2, limit).map((item) => (
                    <ItemChip key={`${dayKey}-${item.id}-md`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
                  ))}
                </div>
                {items.length > 2 ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className="px-2 text-xs text-muted-foreground hover:text-foreground md:hidden"
                  >
                    +{items.length - 2} more
                  </Link>
                ) : null}
                {items.length > limit ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className="hidden px-2 text-xs text-muted-foreground hover:text-foreground md:block"
                  >
                    +{items.length - limit} more
                  </Link>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
