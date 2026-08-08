import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

/** The whole product is single-timezone. Documented, not configurable. */
export const TIME_ZONE = 'Asia/Jakarta'
export const WEDDING_DATE: DayKey = '2026-10-10'

/** A calendar day with no time and no timezone, always `YYYY-MM-DD`. */
export type DayKey = string

export type Assignee = 'fatan' | 'sita' | 'both'

export type PlannerTask = {
  id: string
  title: string
  notes: string | null
  /** null = unscheduled backlog */
  dueDate: DayKey | null
  /** inclusive end of a multi-day block; null = single day */
  dueEndDate: DayKey | null
  assignee: Assignee
  status: 'todo' | 'done'
  isFlagged: boolean
  completedAt: string | null
}

export type PlannerSubtask = {
  id: string
  taskId: string
  title: string
  isDone: boolean
  position: number
}

export type PlannerEvent = {
  id: string
  title: string
  notes: string | null
  /** ISO 8601 instant */
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
  assignee: Assignee
}

export type PlannerItem =
  | ({ kind: 'task' } & PlannerTask)
  | ({ kind: 'event' } & PlannerEvent)

export function toDayKey(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd')
}

export function addDayKeys(dayKey: DayKey, days: number): DayKey {
  return toDayKey(addDays(parseISO(dayKey), days))
}

/** Positive before the wedding, zero on the day, negative after it. */
export function daysUntilWedding(todayKey: DayKey): number {
  return differenceInCalendarDays(parseISO(WEDDING_DATE), parseISO(todayKey))
}
