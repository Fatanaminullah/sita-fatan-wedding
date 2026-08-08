import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, DayKey, PlannerSubtask, PlannerTask } from '@/domain/planner'

export type NewTaskInput = {
  title: string
  notes?: string | null
  dueDate?: DayKey | null
  dueEndDate?: DayKey | null
  assignee?: Assignee
  isFlagged?: boolean
}

type TaskRow = {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_end_date: string | null
  assignee: Assignee
  status: 'todo' | 'done'
  is_flagged: boolean
  completed_at: string | null
}

const TASK_COLUMNS = 'id, title, notes, due_date, due_end_date, assignee, status, is_flagged, completed_at'

function toTask(row: TaskRow): PlannerTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    dueEndDate: row.due_end_date,
    assignee: row.assignee,
    status: row.status,
    isFlagged: row.is_flagged,
    completedAt: row.completed_at,
  }
}

function toRow(input: Partial<NewTaskInput>) {
  const row: Record<string, unknown> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.notes !== undefined) row.notes = input.notes
  if (input.dueDate !== undefined) row.due_date = input.dueDate
  if (input.dueEndDate !== undefined) row.due_end_date = input.dueEndDate
  if (input.assignee !== undefined) row.assignee = input.assignee
  if (input.isFlagged !== undefined) row.is_flagged = input.isFlagged
  return row
}

/**
 * Overlap, not containment: a task whose block starts before the range and
 * ends inside it still belongs to the view. `due_end_date` is null for a
 * single-day task, so the second clause covers those.
 */
export async function listTasksInRange(
  supabase: SupabaseClient,
  startKey: DayKey,
  endKey: DayKey
): Promise<PlannerTask[]> {
  const { data, error } = await supabase
    .from('planner_tasks')
    .select(TASK_COLUMNS)
    .lte('due_date', endKey)
    .or(`due_end_date.gte.${startKey},and(due_end_date.is.null,due_date.gte.${startKey})`)
    .order('due_date', { ascending: true })
  if (error) throw new Error(`Failed to list planner tasks for ${startKey}..${endKey}: ${error.message}`)
  return (data as TaskRow[]).map(toTask)
}

export async function listAllTasks(supabase: SupabaseClient): Promise<PlannerTask[]> {
  const { data, error } = await supabase
    .from('planner_tasks')
    .select(TASK_COLUMNS)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Failed to list planner tasks: ${error.message}`)
  return (data as TaskRow[]).map(toTask)
}

export async function getTask(supabase: SupabaseClient, id: string): Promise<PlannerTask | null> {
  const { data, error } = await supabase.from('planner_tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load planner task ${id}: ${error.message}`)
  return data ? toTask(data as TaskRow) : null
}

export async function createTask(supabase: SupabaseClient, input: NewTaskInput): Promise<string> {
  const { data, error } = await supabase.from('planner_tasks').insert(toRow(input)).select('id').single()
  if (error || !data) throw new Error(`Failed to create planner task: ${error?.message}`)
  return data.id as string
}

export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  input: Partial<NewTaskInput>
): Promise<void> {
  const { error } = await supabase.from('planner_tasks').update(toRow(input)).eq('id', id)
  if (error) throw new Error(`Failed to update planner task ${id}: ${error.message}`)
}

/** completed_at and status move together; a check constraint enforces it. */
export async function setTaskStatus(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('planner_tasks')
    .update({ status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`Failed to set status on planner task ${id}: ${error.message}`)
}

export async function deleteTask(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_tasks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete planner task ${id}: ${error.message}`)
}

export async function listSubtasks(supabase: SupabaseClient, taskId: string): Promise<PlannerSubtask[]> {
  const { data, error } = await supabase
    .from('planner_subtasks')
    .select('id, task_id, title, is_done, position')
    .eq('task_id', taskId)
    .order('position', { ascending: true })
  if (error) throw new Error(`Failed to list subtasks for ${taskId}: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    title: row.title as string,
    isDone: row.is_done as boolean,
    position: row.position as number,
  }))
}

export async function createSubtask(supabase: SupabaseClient, taskId: string, title: string): Promise<void> {
  const existing = await listSubtasks(supabase, taskId)
  const { error } = await supabase
    .from('planner_subtasks')
    .insert({ task_id: taskId, title, position: existing.length })
  if (error) throw new Error(`Failed to create subtask for ${taskId}: ${error.message}`)
}

export async function setSubtaskDone(supabase: SupabaseClient, id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase.from('planner_subtasks').update({ is_done: isDone }).eq('id', id)
  if (error) throw new Error(`Failed to update subtask ${id}: ${error.message}`)
}

export async function deleteSubtask(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_subtasks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete subtask ${id}: ${error.message}`)
}
