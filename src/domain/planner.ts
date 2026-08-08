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

/**
 * Six rows always, so the grid never changes height between months and the
 * layout does not jump when you page through October.
 */
export function buildMonthGrid(monthKey: string, weekStartsOn: 0 | 1 = 0): DayKey[][] {
  const firstOfMonth = parseISO(`${monthKey}-01`)
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7
  let cursor = addDayKeys(toDayKey(firstOfMonth), -offset)

  const grid: DayKey[][] = []
  for (let row = 0; row < 6; row++) {
    const week: DayKey[] = []
    for (let col = 0; col < 7; col++) {
      week.push(cursor)
      cursor = addDayKeys(cursor, 1)
    }
    grid.push(week)
  }
  return grid
}

export type TimedLayout = {
  event: PlannerEvent
  laneIndex: number
  laneCount: number
  /** Minutes from local midnight of the rendered day. */
  topMinutes: number
  heightMinutes: number
}

const MINUTES_IN_DAY = 24 * 60
const MIN_HEIGHT_MINUTES = 30

function minutesFromMidnight(instant: Date, dayKey: DayKey): number {
  const midnight = parseISO(`${dayKey}T00:00:00`)
  return Math.round((instant.getTime() - midnight.getTime()) / 60000)
}

/**
 * Greedy lane packing: walk events in start order and drop each into the first
 * lane whose last event has already ended. Events connected by a chain of
 * pairwise overlaps (A overlaps B, B overlaps C, even if A and C do not
 * directly overlap) form one cluster and share a single laneCount, the
 * highest laneIndex used anywhere in that cluster plus one. Sharing the
 * denominator across the whole cluster, not just an event's direct
 * neighbours, is what keeps every pair of concurrent events' horizontal
 * bands from overlapping.
 */
export function layoutTimedEvents(events: PlannerEvent[], dayKey: DayKey): TimedLayout[] {
  const onThisDay = events
    .filter((event) => !event.allDay)
    .map((event) => {
      const start = new Date(event.startsAt)
      const end = new Date(event.endsAt)
      const rawTop = minutesFromMidnight(start, dayKey)
      const rawBottom = minutesFromMidnight(end, dayKey)
      return { event, rawTop, rawBottom }
    })
    .filter(({ rawTop, rawBottom }) => rawBottom > 0 && rawTop < MINUTES_IN_DAY)
    .map(({ event, rawTop, rawBottom }) => {
      const top = Math.max(0, rawTop)
      const bottom = Math.min(MINUTES_IN_DAY, rawBottom)
      return { event, top, height: Math.max(MIN_HEIGHT_MINUTES, bottom - top) }
    })
    .sort((a, b) => a.top - b.top || a.height - b.height)

  const laneEnds: number[] = []
  const placed = onThisDay.map((entry) => {
    const end = entry.top + entry.height
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= entry.top)
    if (laneIndex === -1) {
      laneIndex = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[laneIndex] = end
    }
    return { ...entry, laneIndex, end }
  })

  // Union-find over `placed` indices: union any pair that overlaps in time,
  // so events joined only transitively (via a shared neighbour) still end up
  // in the same component.
  const parent = placed.map((_, index) => index)
  function find(index: number): number {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootA] = rootB
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (placed[i].top < placed[j].end && placed[j].top < placed[i].end) {
        union(i, j)
      }
    }
  }

  const laneCountByRoot = new Map<number, number>()
  placed.forEach((entry, index) => {
    const root = find(index)
    const highest = laneCountByRoot.get(root) ?? 0
    laneCountByRoot.set(root, Math.max(highest, entry.laneIndex + 1))
  })

  return placed.map((entry, index) => ({
    event: entry.event,
    laneIndex: entry.laneIndex,
    laneCount: laneCountByRoot.get(find(index))!,
    topMinutes: entry.top,
    heightMinutes: entry.height,
  }))
}
