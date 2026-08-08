import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAllTasks, listSubtasksForTasks } from '@/server/repositories/planner-tasks-repository'
import { listEventsInRange } from '@/server/repositories/planner-events-repository'
import { addDayKeys, bucketByHorizon, daysUntilWedding, toDayKey, type PlannerItem } from '@/domain/planner'
import { PlannerHomeCards } from './planner-home-cards'

export default async function PlannerHomePage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const todayKey = toDayKey(new Date())
  const supabase = await getServerSupabase()

  // Tasks come in whole because progress counts every task, dated or not.
  // Events only need the horizon the cards actually show.
  const [tasks, events] = await Promise.all([
    listAllTasks(supabase),
    listEventsInRange(supabase, addDayKeys(todayKey, -30), addDayKeys(todayKey, 60)),
  ])
  const subtasksByTaskId = await listSubtasksForTasks(
    supabase,
    tasks.map((task) => task.id)
  )

  const items: PlannerItem[] = [
    ...tasks.map((task) => ({ kind: 'task' as const, ...task })),
    ...events.map((event) => ({ kind: 'event' as const, ...event })),
  ]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Planner</h1>
        <Link
          href="/planner/calendar"
          className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
        >
          <CalendarDays className="size-4" />
          Calendar
        </Link>
      </div>

      <PlannerHomeCards
        buckets={bucketByHorizon(items, todayKey)}
        todayKey={todayKey}
        daysLeft={daysUntilWedding(todayKey)}
        subtasksByTaskId={subtasksByTaskId}
      />
    </div>
  )
}
