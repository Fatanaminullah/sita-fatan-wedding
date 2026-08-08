'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import {
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  createSubtask,
  setSubtaskDone,
  deleteSubtask,
} from '../repositories/planner-tasks-repository'
import { createEvent, updateEvent, deleteEvent } from '../repositories/planner-events-repository'
import { toDayKey, type Assignee } from '@/domain/planner'

type ActionResult = { ok: true } | { error: string }

/**
 * RLS already denies every non-admin. This check exists so a non-admin gets a
 * sentence instead of a silent failure, matching caps-actions.ts.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') return null
  return profile
}

function revalidatePlanner() {
  revalidatePath('/planner')
  revalidatePath('/planner/calendar')
  revalidatePath('/planner/tasks')
}

function readAssignee(value: FormDataEntryValue | null): Assignee {
  return value === 'fatan' || value === 'sita' ? value : 'both'
}

function readOptional(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

/**
 * A map link is rendered as an `href`, so the scheme is a security boundary,
 * not a formatting preference: a `javascript:` URL stored here would be
 * stored XSS against the only two people who can read this planner. Only
 * http and https are accepted, and the database carries the same check as a
 * backstop in case a future write path forgets.
 */
function readHttpUrl(value: FormDataEntryValue | null): { url: string | null } | { error: string } {
  const text = readOptional(value)
  if (!text) return { url: null }
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { error: 'That map link is not a valid URL.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'A map link has to start with http or https.' }
  }
  return { url: parsed.toString() }
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CLOCK_TIME_PATTERN = /^\d{2}:\d{2}$/

/** The 1am path: one field, everything else defaulted. */
export async function quickCaptureTask(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const supabase = await getServerSupabase()
  await createTask(supabase, {
    title,
    dueDate: readOptional(formData.get('dueDate')) ?? toDayKey(new Date()),
    assignee: 'both',
  })

  revalidatePlanner()
  return { ok: true }
}

export async function saveTask(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const dueDate = readOptional(formData.get('dueDate'))
  const dueEndDate = readOptional(formData.get('dueEndDate'))
  if (dueEndDate && !dueDate) return { error: 'A date range needs a start date.' }
  if (dueDate && dueEndDate && dueEndDate < dueDate) return { error: 'The end date is before the start date.' }

  const input = {
    title,
    notes: readOptional(formData.get('notes')),
    dueDate,
    dueEndDate,
    assignee: readAssignee(formData.get('assignee')),
    isFlagged: formData.get('isFlagged') === 'on',
  }

  const supabase = await getServerSupabase()
  const id = readOptional(formData.get('id'))
  if (id) await updateTask(supabase, id, input)
  else await createTask(supabase, input)

  revalidatePlanner()
  return { ok: true }
}

export async function toggleTaskStatus(id: string, done: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await setTaskStatus(supabase, id, done)
  revalidatePlanner()
  return { ok: true }
}

export async function toggleTaskFlag(id: string, flagged: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await updateTask(supabase, id, { isFlagged: flagged })
  revalidatePlanner()
  return { ok: true }
}

export async function removeTask(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteTask(supabase, id)
  revalidatePlanner()
  return { ok: true }
}

/**
 * The form speaks in a local date plus two clock times; the database speaks in
 * instants. An all-day event covers 00:00:00 to 23:59:59 Asia/Jakarta,
 * inclusive, which is what the renderers assume.
 */
export async function saveEvent(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const date = readOptional(formData.get('date'))
  if (!date) return { error: 'An event needs a date.' }
  if (!DATE_KEY_PATTERN.test(date)) return { error: 'Enter the date in YYYY-MM-DD format.' }

  const allDay = formData.get('allDay') === 'on'
  const startTime = readOptional(formData.get('startTime')) ?? '09:00'
  const endTime = readOptional(formData.get('endTime')) ?? '10:00'
  if (!allDay && (!CLOCK_TIME_PATTERN.test(startTime) || !CLOCK_TIME_PATTERN.test(endTime))) {
    return { error: 'Enter start and end time in HH:MM format.' }
  }
  if (!allDay && endTime < startTime) return { error: 'The end time is before the start time.' }

  const startsAt = allDay ? `${date}T00:00:00+07:00` : `${date}T${startTime}:00+07:00`
  const endsAt = allDay ? `${date}T23:59:59+07:00` : `${date}T${endTime}:00+07:00`

  const mapsUrl = readHttpUrl(formData.get('mapsUrl'))
  if ('error' in mapsUrl) return { error: mapsUrl.error }

  const input = {
    title,
    notes: readOptional(formData.get('notes')),
    startsAt,
    endsAt,
    allDay,
    location: readOptional(formData.get('location')),
    mapsUrl: mapsUrl.url,
    assignee: readAssignee(formData.get('assignee')),
  }

  const supabase = await getServerSupabase()
  const id = readOptional(formData.get('id'))
  if (id) await updateEvent(supabase, id, input)
  else await createEvent(supabase, input)

  revalidatePlanner()
  return { ok: true }
}

export async function removeEvent(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteEvent(supabase, id)
  revalidatePlanner()
  return { ok: true }
}

export async function addSubtask(taskId: string, title: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const trimmed = title.trim()
  if (!trimmed) return { error: 'Give the subtask a title first.' }
  const supabase = await getServerSupabase()
  await createSubtask(supabase, taskId, trimmed)
  revalidatePlanner()
  return { ok: true }
}

export async function toggleSubtask(id: string, isDone: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await setSubtaskDone(supabase, id, isDone)
  revalidatePlanner()
  return { ok: true }
}

export async function removeSubtask(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteSubtask(supabase, id)
  revalidatePlanner()
  return { ok: true }
}
