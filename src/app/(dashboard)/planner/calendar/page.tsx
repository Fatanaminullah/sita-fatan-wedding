import { isValid, parseISO } from 'date-fns'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listTasksInRange, listSubtasksForTasks } from '@/server/repositories/planner-tasks-repository'
import { listEventsInRange } from '@/server/repositories/planner-events-repository'
import { addDayKeys, buildMonthGrid, expandMultiDaySpans, toDayKey, type PlannerItem } from '@/domain/planner'
import type { CalendarView } from '@/components/planner/calendar-nav'
import { CalendarSurface } from './calendar-surface'

function readView(value: string | undefined): CalendarView {
  return value === 'week' || value === 'day' || value === 'month' ? value : 'month'
}

/**
 * The shape check alone lets an impossible date like 2026-04-31 through,
 * which then throws a RangeError out of parseISO/format further down the
 * page. A bad or hostile ?date= should quietly fall back to today, the same
 * as a missing or malformed one.
 */
function readDateKey(value: string | undefined, todayKey: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayKey
  return isValid(parseISO(value)) ? value : todayKey
}

export default async function PlannerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  const params = await searchParams
  const todayKey = toDayKey(new Date())
  const view = readView(params.view)
  // The server-resolved `view` above always falls back to 'month', purely so
  // there is something to compute a fetch range from. Whether the URL
  // actually asked for a view is a separate fact `CalendarSurface` needs, so
  // it knows whether it is allowed to override that fallback with a
  // device-aware default (see the comment on `resolvedView` there).
  const viewWasExplicit = params.view === 'month' || params.view === 'week' || params.view === 'day'
  const dateKey = readDateKey(params.date, todayKey)
  const monthKey = dateKey.slice(0, 7)

  // The month grid always shows six rows, so fetch its real first and last day
  // rather than the calendar month, or trailing days render empty.
  //
  // When `?view=` is absent, `view` is the server's 'month' fallback, so a
  // phone that will actually resolve to `day` (see `CalendarSurface`) still
  // fetches this full six-row month range. That is an over-fetch, not a
  // correctness bug: `dateKey` (today, by default) always falls inside it.
  const grid = buildMonthGrid(monthKey)
  const rangeStart = view === 'month' ? grid[0][0] : addDayKeys(dateKey, -7)
  const rangeEnd = view === 'month' ? grid[5][6] : addDayKeys(dateKey, 7)

  const supabase = await getServerSupabase()
  const [tasks, events] = await Promise.all([
    listTasksInRange(supabase, rangeStart, rangeEnd),
    listEventsInRange(supabase, rangeStart, rangeEnd),
  ])
  const subtasksByTaskId = await listSubtasksForTasks(
    supabase,
    tasks.map((task) => task.id)
  )

  const items: PlannerItem[] = [
    ...tasks.map((task) => ({ kind: 'task' as const, ...task })),
    ...events.map((event) => ({ kind: 'event' as const, ...event })),
  ]
  const segments = expandMultiDaySpans(items, rangeStart, rangeEnd)

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      <CalendarSurface
        view={view}
        viewWasExplicit={viewWasExplicit}
        dateKey={dateKey}
        monthKey={monthKey}
        segments={segments}
        todayKey={todayKey}
        subtasksByTaskId={subtasksByTaskId}
      />
    </div>
  )
}
