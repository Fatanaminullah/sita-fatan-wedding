import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAllTasks, listSubtasksForTasks } from '@/server/repositories/planner-tasks-repository'
import { toDayKey } from '@/domain/planner'
import { TasksList } from './tasks-list'

export default async function PlannerTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string; hideDone?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  const params = await searchParams
  const assignee = params.assignee === 'fatan' || params.assignee === 'sita' ? params.assignee : 'all'
  const hideDone = params.hideDone === '1'

  const supabase = await getServerSupabase()
  const tasks = await listAllTasks(supabase)
  const subtasksByTaskId = await listSubtasksForTasks(
    supabase,
    tasks.map((task) => task.id)
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-24">
      <h1 className="text-xl font-medium">All tasks</h1>
      <TasksList
        tasks={tasks}
        todayKey={toDayKey(new Date())}
        hideDone={hideDone}
        assignee={assignee}
        subtasksByTaskId={subtasksByTaskId}
      />
    </div>
  )
}
