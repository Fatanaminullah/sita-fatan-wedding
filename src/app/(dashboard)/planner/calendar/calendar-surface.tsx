'use client'

import { useState } from 'react'
import { MonthView } from '@/components/planner/month-view'
import { DayView } from '@/components/planner/day-view'
import type { CalendarView } from '@/components/planner/calendar-nav'
import type { DayKey, DaySegment, PlannerItem } from '@/domain/planner'

export function CalendarSurface({
  view,
  dateKey,
  monthKey,
  segments,
  todayKey,
}: {
  view: CalendarView
  dateKey: DayKey
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)

  return (
    <>
      {view === 'month' ? (
        <MonthView monthKey={monthKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : view === 'day' ? (
        <DayView dayKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : (
        <p className="text-sm text-muted-foreground">
          The week view arrives in the next task. Showing {segments.length} items around {dateKey}.
        </p>
      )}
      {openItem ? (
        <p className="text-sm text-muted-foreground">Selected: {openItem.title}</p>
      ) : null}
    </>
  )
}
