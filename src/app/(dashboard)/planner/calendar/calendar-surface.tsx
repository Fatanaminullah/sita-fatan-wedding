'use client'

import { useState } from 'react'
import { MonthView } from '@/components/planner/month-view'
import { DayView } from '@/components/planner/day-view'
import { WeekView } from '@/components/planner/week-view'
import { CalendarNav, type CalendarView } from '@/components/planner/calendar-nav'
import { useIsMobile } from '@/hooks/use-mobile'
import type { DayKey, DaySegment, PlannerItem } from '@/domain/planner'

export function CalendarSurface({
  view,
  viewWasExplicit,
  dateKey,
  monthKey,
  segments,
  todayKey,
}: {
  view: CalendarView
  /** True when the URL's `?view=` was one of the three known values. False
   * when it was absent or malformed, in which case the server already fell
   * back to `month` (see `readView` in `page.tsx`) purely so it has
   * something to fetch a data range for; the actual default view is a
   * client-only decision, resolved below. */
  viewWasExplicit: boolean
  dateKey: DayKey
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)
  const isMobile = useIsMobile()
  // The server cannot know the viewport, so an unspecified view resolves
  // here. `useIsMobile` reports `false` on the server render and on the
  // first client render (it only corrects after mount), so both of those
  // passes agree on `month` when the view was not explicit, and hydration
  // stays silent. On an actual phone, the very next render (right after
  // mount) flips this to `day`, which is a deliberate, visible swap from the
  // month grid to the day view rather than a hydration bug.
  const resolvedView: CalendarView = viewWasExplicit ? view : isMobile ? 'day' : 'month'

  return (
    <>
      <CalendarNav view={resolvedView} dateKey={dateKey} />
      {resolvedView === 'month' ? (
        <MonthView monthKey={monthKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : resolvedView === 'day' ? (
        <DayView dayKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : (
        <WeekView anchorKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      )}
      {openItem ? (
        <p className="text-sm text-muted-foreground">Selected: {openItem.title}</p>
      ) : null}
    </>
  )
}
