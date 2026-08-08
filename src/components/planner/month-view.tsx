'use client'

import Link from 'next/link'
import { buildMonthGrid, type DayKey, type DaySegment, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * DESIGN.md's Two Densities Rule sets a 44px minimum interactive target for
 * every planner surface, and the day-number link and the "+N more" links
 * are both repeated across up to 42 cells. A literal 44px box would either
 * force "today"'s numeral into a bulky 44px filled square or grow every row
 * enough that six rows stop fitting on a phone, so the hit area is enlarged
 * instead of the visible box: an absolutely positioned `::before` extends
 * the tappable region 8px past the element on every side without adding a
 * single pixel to layout flow.
 *
 * That `::before` is clickable by design, and it is `position: relative` /
 * `absolute` while an `ItemChip` is `position: static`, so wherever the two
 * overlap the slop paints on top and CAPTURES the tap, regardless of DOM
 * order: positioned elements paint above non-positioned ones. It does not
 * just bleed visually, it steals the tap. Every use of this class must
 * therefore keep at least 8px of clear space, on the side(s) that matter,
 * between the slopped element and any other tappable neighbour, so the 8px
 * lands on empty padding instead of on a chip.
 */
const HIT_SLOP = "relative before:absolute before:-inset-2 before:content-['']"

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
              {/*
                mb-2 (8px), not mb-1: the day link's hit-slop bleeds 8px
                downward, so it needs a full 8px of clear space before the
                chip stack starts, or the slop lands on the first chip's top
                edge and steals its tap. See the HIT_SLOP comment above.
              */}
              <Link
                href={`/planner/calendar?view=day&date=${dayKey}`}
                className={`${HIT_SLOP} mb-2 flex size-7 items-center justify-center rounded-md font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
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
                {/*
                  mt-2 on top of the flex column's own gap-0.5: the "+more"
                  link's hit-slop bleeds 8px upward, so it needs 8px clear of
                  the chip above it, and gap-0.5 alone is only 2px. mt-2 adds
                  8px on its own, stacking with the gap (flex gap and margin
                  do not collapse) for 10px of real clearance. See the
                  HIT_SLOP comment above.
                */}
                {items.length > 2 ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className={`${HIT_SLOP} mt-2 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden`}
                  >
                    +{items.length - 2} more
                  </Link>
                ) : null}
                {items.length > limit ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className={`${HIT_SLOP} mt-2 hidden rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:block`}
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
