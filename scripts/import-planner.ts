/**
 * One-time seed of the planner from the vault's Wedding To-Do List.md.
 * Idempotent by title: a re-run skips anything already present, so a partial
 * failure is safe to retry. After this runs, the vault note is history and the
 * app is the source of truth.
 *
 * Run: npx tsx scripts/import-planner.ts
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { getAdminSupabase } from '../src/server/supabase/admin-client'
import { createTask } from '../src/server/repositories/planner-tasks-repository'
import { createEvent } from '../src/server/repositories/planner-events-repository'
import type { NewTaskInput } from '../src/server/repositories/planner-tasks-repository'
import type { NewEventInput } from '../src/server/repositories/planner-events-repository'

const TASKS: Array<NewTaskInput & { done?: boolean }> = [
  { title: 'Submit SIMKAH', dueDate: '2026-07-10', assignee: 'both', done: true },
  { title: 'KUA', dueDate: '2026-07-10', assignee: 'both', done: true },
  { title: 'Istiqlal', dueDate: '2026-07-13', assignee: 'both', done: true },
  { title: 'Feedback for Michelle Dekorasi', dueDate: '2026-07-18', assignee: 'sita', done: true },
  { title: 'Moodboard prewedding', dueDate: '2026-07-19', assignee: 'both', done: true },
  { title: 'Book Dekorasi Akad', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both', done: true },
  { title: 'Book Teazzi & Umaku', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both' },
  { title: 'Attire prewedding', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both' },
  {
    title: "Parents' attire: vendor stock taken",
    notes:
      'Vendor said stock was plentiful back in January and they could pick later. By the 22 Jul fitting the stock was gone: 10 Oct is a popular date and other couples booked ahead. Need a new plan for both mothers and both fathers.',
    dueDate: null,
    isFlagged: true,
    assignee: 'both',
  },
  { title: 'Souvenir', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both' },
  { title: 'Pesan cincin kawin', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both', done: true },
  { title: 'Undangan', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both' },
  { title: 'Mahar', dueDate: '2026-08-29', dueEndDate: '2026-08-31', assignee: 'fatan' },
  { title: 'Last fitting with family', dueDate: '2026-09-01', dueEndDate: '2026-09-03', assignee: 'both' },
  { title: 'Book Sesoul Massage & Spa', dueDate: '2026-09-14', dueEndDate: '2026-09-16', assignee: 'sita' },
  { title: 'Seserahan', dueDate: '2026-09-28', dueEndDate: '2026-09-30', assignee: 'both' },
]

const EVENTS: NewEventInput[] = [
  {
    title: 'First meeting with WO (Ohana Enterprise)',
    startsAt: '2026-07-13T18:00:00+07:00',
    endsAt: '2026-07-13T20:00:00+07:00',
    assignee: 'both',
  },
  {
    title: 'First fitting + Casa de Eunoia survey',
    startsAt: '2026-07-22T09:00:00+07:00',
    endsAt: '2026-07-22T17:00:00+07:00',
    location: 'Bandung',
    assignee: 'both',
  },
  {
    title: 'Prewedding shoot',
    startsAt: '2026-08-24T00:00:00+07:00',
    endsAt: '2026-08-24T23:59:59+07:00',
    allDay: true,
    assignee: 'both',
  },
  {
    title: 'Wedding day',
    startsAt: '2026-10-10T00:00:00+07:00',
    endsAt: '2026-10-10T23:59:59+07:00',
    allDay: true,
    assignee: 'both',
  },
]

async function main() {
  const supabase = getAdminSupabase()

  const { data: existingTasks } = await supabase.from('planner_tasks').select('title')
  const seenTasks = new Set((existingTasks ?? []).map((row) => row.title as string))

  for (const { done, ...task } of TASKS) {
    if (seenTasks.has(task.title)) {
      console.log(`skip task: ${task.title}`)
      continue
    }
    const id = await createTask(supabase, task)
    if (done) {
      await supabase
        .from('planner_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', id)
    }
    console.log(`task: ${task.title}${done ? ' (done)' : ''}`)
  }

  const { data: existingEvents } = await supabase.from('planner_events').select('title')
  const seenEvents = new Set((existingEvents ?? []).map((row) => row.title as string))

  for (const event of EVENTS) {
    if (seenEvents.has(event.title)) {
      console.log(`skip event: ${event.title}`)
      continue
    }
    await createEvent(supabase, event)
    console.log(`event: ${event.title}`)
  }

  console.log('done')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
