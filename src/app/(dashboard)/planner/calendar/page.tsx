import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listTasksInRange } from '@/server/repositories/planner-tasks-repository'
import { listEventsInRange } from '@/server/repositories/planner-events-repository'
import { addDayKeys, buildMonthGrid, expandMultiDaySpans, toDayKey, type PlannerItem } from '@/domain/planner'
import { CalendarNav, type CalendarView } from '@/components/planner/calendar-nav'
import { CalendarSurface } from './calendar-surface'

function readView(value: string | undefined): CalendarView {
  return value === 'week' || value === 'day' || value === 'month' ? value : 'month'
}

export default async function PlannerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const todayKey = toDayKey(new Date())
  const view = readView(params.view)
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayKey
  const monthKey = dateKey.slice(0, 7)

  // The month grid always shows six rows, so fetch its real first and last day
  // rather than the calendar month, or trailing days render empty.
  const grid = buildMonthGrid(monthKey)
  const rangeStart = view === 'month' ? grid[0][0] : addDayKeys(dateKey, -7)
  const rangeEnd = view === 'month' ? grid[5][6] : addDayKeys(dateKey, 7)

  const supabase = await getServerSupabase()
  const [tasks, events] = await Promise.all([
    listTasksInRange(supabase, rangeStart, rangeEnd),
    listEventsInRange(supabase, rangeStart, rangeEnd),
  ])

  const items: PlannerItem[] = [
    ...tasks.map((task) => ({ kind: 'task' as const, ...task })),
    ...events.map((event) => ({ kind: 'event' as const, ...event })),
  ]
  const segments = expandMultiDaySpans(items, rangeStart, rangeEnd)

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      <CalendarNav view={view} dateKey={dateKey} />
      <CalendarSurface view={view} dateKey={dateKey} monthKey={monthKey} segments={segments} todayKey={todayKey} />
    </div>
  )
}
