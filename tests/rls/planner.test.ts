// tests/rls/planner.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getRemoteConfig,
  getAdminClient,
  createTestUser,
  cleanupTestUser,
  clientAs,
  type RemoteConfig,
  type CreateTestUserInput,
} from './setup'
import {
  createTask,
  listTasksInRange,
  setTaskStatus,
  deleteTask,
  createSubtask,
  listSubtasks,
} from '@/server/repositories/planner-tasks-repository'
import { createEvent, listEventsInRange, deleteEvent } from '@/server/repositories/planner-events-repository'

let config: RemoteConfig
let createdUserIds: string[] = []
let createdTaskIds: string[] = []
let createdEventIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
  for (const id of createdTaskIds) {
    await admin.from('planner_tasks').delete().eq('id', id)
  }
  createdTaskIds = []
  for (const id of createdEventIds) {
    await admin.from('planner_events').delete().eq('id', id)
  }
  createdEventIds = []
  for (const userId of createdUserIds) {
    await cleanupTestUser(admin, userId)
  }
  createdUserIds = []
})

async function makeTestUser(admin: SupabaseClient, input: CreateTestUserInput) {
  const user = await createTestUser(admin, input)
  createdUserIds.push(user.userId)
  return user
}

async function seedTask(admin: SupabaseClient, title = 'Seed task') {
  const { data, error } = await admin
    .from('planner_tasks')
    .insert({ title, due_date: '2026-08-20', assignee: 'both' })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to seed planner_task: ${error?.message}`)
  createdTaskIds.push(data.id)
  return data.id as string
}

describe('planner RLS', () => {
  it('lets an admin read and write planner_tasks', async () => {
    const admin = getAdminClient(config)
    const user = await makeTestUser(admin, { email: `planner-admin-${crypto.randomUUID()}@test.local`, role: 'superadmin' })
    const client = await clientAs(config, user.email, user.password)

    const { data: inserted, error: insertError } = await client
      .from('planner_tasks')
      .insert({ title: 'Book souvenir', due_date: '2026-08-15', assignee: 'fatan' })
      .select()
      .single()
    expect(insertError).toBeNull()
    expect(inserted?.title).toBe('Book souvenir')
    createdTaskIds.push(inserted!.id)

    const { data: rows, error: readError } = await client.from('planner_tasks').select('id')
    expect(readError).toBeNull()
    expect(rows!.length).toBeGreaterThan(0)
  })

  it('lets an admin read and write planner_subtasks', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin, 'Task for admin subtask access')
    const user = await makeTestUser(admin, { email: `planner-admin-${crypto.randomUUID()}@test.local`, role: 'superadmin' })
    const client = await clientAs(config, user.email, user.password)

    const { data: inserted, error: insertError } = await client
      .from('planner_subtasks')
      .insert({ task_id: taskId, title: 'Confirm caterer', position: 0 })
      .select()
      .single()
    expect(insertError).toBeNull()
    expect(inserted?.title).toBe('Confirm caterer')
    // Not tracked in a createdSubtaskIds array: deleting the parent task in
    // afterEach (via createdTaskIds) cascades to this row, as pinned by the
    // "cascades subtask deletion" test below.

    const { data: rows, error: readError } = await client.from('planner_subtasks').select('id').eq('task_id', taskId)
    expect(readError).toBeNull()
    expect(rows).toEqual([{ id: inserted!.id }])
  })

  it('denies an inviter every planner_tasks operation', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin)
    const user = await makeTestUser(admin, {
      email: `planner-inviter-${crypto.randomUUID()}@test.local`,
      role: 'inviter',
      inviterKey: 'Mama Fatan',
      side: 'fatan',
    })
    const client = await clientAs(config, user.email, user.password)

    const { data: rows } = await client.from('planner_tasks').select('id')
    expect(rows).toEqual([])

    const { error: insertError } = await client.from('planner_tasks').insert({ title: 'Nope' })
    expect(insertError).not.toBeNull()

    const { data: updated } = await client
      .from('planner_tasks')
      .update({ title: 'Hijacked' })
      .eq('id', taskId)
      .select()
    expect(updated ?? []).toEqual([])
  })

  it('denies an inviter every planner_subtasks operation', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin, 'Task with a subtask')
    const { error: subError } = await admin
      .from('planner_subtasks')
      .insert({ task_id: taskId, title: 'Confirm menu', position: 0 })
    if (subError) throw new Error(`Failed to seed planner_subtask: ${subError.message}`)

    const user = await makeTestUser(admin, {
      email: `planner-inviter-${crypto.randomUUID()}@test.local`,
      role: 'inviter',
      inviterKey: 'Mama Fatan',
      side: 'fatan',
    })
    const client = await clientAs(config, user.email, user.password)

    const { data: rows } = await client.from('planner_subtasks').select('id')
    expect(rows).toEqual([])

    const { error: insertError } = await client
      .from('planner_subtasks')
      .insert({ task_id: taskId, title: 'Nope', position: 1 })
    expect(insertError).not.toBeNull()
  })

  it('denies usher and viewer reads of planner_events', async () => {
    const admin = getAdminClient(config)
    const { data: seeded, error } = await admin
      .from('planner_events')
      .insert({
        title: 'First fitting',
        starts_at: '2026-09-02T03:00:00Z',
        ends_at: '2026-09-02T06:00:00Z',
        assignee: 'both',
      })
      .select()
      .single()
    if (error || !seeded) throw new Error(`Failed to seed planner_event: ${error?.message}`)
    createdEventIds.push(seeded.id)

    for (const role of ['usher', 'viewer'] as const) {
      const user = await makeTestUser(admin, { email: `planner-${role}-${crypto.randomUUID()}@test.local`, role })
      const client = await clientAs(config, user.email, user.password)
      const { data: rows } = await client.from('planner_events').select('id')
      expect(rows).toEqual([])
    }
  })

  it('cascades subtask deletion when its task is deleted', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin, 'Task with subtasks')
    const { error: subError } = await admin
      .from('planner_subtasks')
      .insert({ task_id: taskId, title: 'Confirm colour', position: 0 })
    expect(subError).toBeNull()

    await admin.from('planner_tasks').delete().eq('id', taskId)
    createdTaskIds = createdTaskIds.filter((id) => id !== taskId)

    const { data: orphans } = await admin.from('planner_subtasks').select('id').eq('task_id', taskId)
    expect(orphans).toEqual([])
  })

  it('rejects a due_end_date earlier than due_date', async () => {
    const admin = getAdminClient(config)
    const { error } = await admin
      .from('planner_tasks')
      .insert({ title: 'Backwards range', due_date: '2026-08-20', due_end_date: '2026-08-10' })
    expect(error).not.toBeNull()
  })
})

describe('planner repositories', () => {
  it('round-trips a task, its status and its subtasks', async () => {
    const admin = getAdminClient(config)

    const taskId = await createTask(admin, {
      title: 'Book Teazzi & Umaku',
      dueDate: '2026-08-14',
      dueEndDate: '2026-08-16',
      assignee: 'sita',
    })
    createdTaskIds.push(taskId)

    const inRange = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    const found = inRange.find((t) => t.id === taskId)
    expect(found).toMatchObject({
      title: 'Book Teazzi & Umaku',
      dueDate: '2026-08-14',
      dueEndDate: '2026-08-16',
      assignee: 'sita',
      status: 'todo',
      isFlagged: false,
    })

    await createSubtask(admin, taskId, 'Confirm pax')
    const subtasks = await listSubtasks(admin, taskId)
    expect(subtasks.map((s) => s.title)).toEqual(['Confirm pax'])

    await setTaskStatus(admin, taskId, true)
    const afterDone = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(afterDone.find((t) => t.id === taskId)?.status).toBe('done')
    expect(afterDone.find((t) => t.id === taskId)?.completedAt).not.toBeNull()

    await setTaskStatus(admin, taskId, false)
    const afterUndo = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(afterUndo.find((t) => t.id === taskId)?.completedAt).toBeNull()

    await deleteTask(admin, taskId)
    createdTaskIds = createdTaskIds.filter((id) => id !== taskId)
  })

  it('returns a task whose block only partially overlaps the range', async () => {
    const admin = getAdminClient(config)
    const taskId = await createTask(admin, { title: 'Straddles the edge', dueDate: '2026-07-30', dueEndDate: '2026-08-02' })
    createdTaskIds.push(taskId)

    const inRange = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(inRange.map((t) => t.id)).toContain(taskId)
  })

  it('round-trips an event', async () => {
    const admin = getAdminClient(config)
    const eventId = await createEvent(admin, {
      title: 'Prewedding shoot',
      startsAt: '2026-08-24T01:00:00.000Z',
      endsAt: '2026-08-24T09:00:00.000Z',
      location: 'Bandung',
      mapsUrl: 'https://maps.app.goo.gl/example',
      assignee: 'both',
    })
    createdEventIds.push(eventId)

    const inRange = await listEventsInRange(admin, '2026-08-01', '2026-08-31')
    expect(inRange.find((e) => e.id === eventId)).toMatchObject({
      title: 'Prewedding shoot',
      location: 'Bandung',
      mapsUrl: 'https://maps.app.goo.gl/example',
      allDay: false,
    })

    await deleteEvent(admin, eventId)
    createdEventIds = createdEventIds.filter((id) => id !== eventId)
  })
})
