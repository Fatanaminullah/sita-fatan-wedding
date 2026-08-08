import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, DayKey, PlannerEvent } from '@/domain/planner'

export type NewEventInput = {
  title: string
  notes?: string | null
  startsAt: string
  endsAt: string
  allDay?: boolean
  location?: string | null
  assignee?: Assignee
}

type EventRow = {
  id: string
  title: string
  notes: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  location: string | null
  assignee: Assignee
}

const EVENT_COLUMNS = 'id, title, notes, starts_at, ends_at, all_day, location, assignee'

function toEvent(row: EventRow): PlannerEvent {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    assignee: row.assignee,
  }
}

function toRow(input: Partial<NewEventInput>) {
  const row: Record<string, unknown> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.notes !== undefined) row.notes = input.notes
  if (input.startsAt !== undefined) row.starts_at = input.startsAt
  if (input.endsAt !== undefined) row.ends_at = input.endsAt
  if (input.allDay !== undefined) row.all_day = input.allDay
  if (input.location !== undefined) row.location = input.location
  if (input.assignee !== undefined) row.assignee = input.assignee
  return row
}

/**
 * The range is inclusive of both ends in Asia/Jakarta (+07:00), which is the
 * only timezone this product has.
 */
export async function listEventsInRange(
  supabase: SupabaseClient,
  startKey: DayKey,
  endKey: DayKey
): Promise<PlannerEvent[]> {
  const { data, error } = await supabase
    .from('planner_events')
    .select(EVENT_COLUMNS)
    .lte('starts_at', `${endKey}T23:59:59+07:00`)
    .gte('ends_at', `${startKey}T00:00:00+07:00`)
    .order('starts_at', { ascending: true })
  if (error) throw new Error(`Failed to list planner events for ${startKey}..${endKey}: ${error.message}`)
  return (data as EventRow[]).map(toEvent)
}

export async function getEvent(supabase: SupabaseClient, id: string): Promise<PlannerEvent | null> {
  const { data, error } = await supabase.from('planner_events').select(EVENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load planner event ${id}: ${error.message}`)
  return data ? toEvent(data as EventRow) : null
}

export async function createEvent(supabase: SupabaseClient, input: NewEventInput): Promise<string> {
  const { data, error } = await supabase.from('planner_events').insert(toRow(input)).select('id').single()
  if (error || !data) throw new Error(`Failed to create planner event: ${error?.message}`)
  return data.id as string
}

export async function updateEvent(
  supabase: SupabaseClient,
  id: string,
  input: Partial<NewEventInput>
): Promise<void> {
  const { error } = await supabase.from('planner_events').update(toRow(input)).eq('id', id)
  if (error) throw new Error(`Failed to update planner event ${id}: ${error.message}`)
}

export async function deleteEvent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_events').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete planner event ${id}: ${error.message}`)
}
