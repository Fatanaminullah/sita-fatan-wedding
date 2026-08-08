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

export type DaySegment = {
  dayKey: DayKey
  item: PlannerItem
  /** True only when the item's real first day is inside the requested range. */
  isStart: boolean
  /** True only when the item's real last day is inside the requested range. */
  isEnd: boolean
  /** All-day items render in the strip above the hour grid. */
  isAllDay: boolean
}

function itemSpan(item: PlannerItem): { first: DayKey; last: DayKey; isAllDay: boolean } | null {
  if (item.kind === 'task') {
    if (!item.dueDate) return null
    return { first: item.dueDate, last: item.dueEndDate ?? item.dueDate, isAllDay: true }
  }
  return {
    first: toDayKey(new Date(item.startsAt)),
    last: toDayKey(new Date(item.endsAt)),
    isAllDay: item.allDay,
  }
}

export function expandMultiDaySpans(
  items: PlannerItem[],
  rangeStart: DayKey,
  rangeEnd: DayKey
): DaySegment[] {
  const segments: DaySegment[] = []

  for (const item of items) {
    const span = itemSpan(item)
    if (!span) continue
    if (span.last < rangeStart || span.first > rangeEnd) continue

    const from = span.first < rangeStart ? rangeStart : span.first
    const to = span.last > rangeEnd ? rangeEnd : span.last

    for (let dayKey = from; dayKey <= to; dayKey = addDayKeys(dayKey, 1)) {
      segments.push({
        dayKey,
        item,
        isStart: dayKey === span.first,
        isEnd: dayKey === span.last,
        isAllDay: span.isAllDay,
      })
    }
  }

  return segments
}
