import { describe, it, expect } from 'vitest'
import {
  toDayKey,
  addDayKeys,
  daysUntilWedding,
  WEDDING_DATE,
  expandMultiDaySpans,
  buildMonthGrid,
  layoutTimedEvents,
  bucketByHorizon,
  type PlannerItem,
  type PlannerTask,
  type PlannerEvent,
} from './planner'

describe('date primitives', () => {
  it('formats a Date as a YYYY-MM-DD day key', () => {
    expect(toDayKey(new Date(2026, 7, 8))).toBe('2026-08-08')
  })

  it('pads single-digit months and days', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('adds days across a month boundary', () => {
    expect(addDayKeys('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('subtracts days with a negative offset', () => {
    expect(addDayKeys('2026-09-02', -3)).toBe('2026-08-30')
  })

  it('counts days until the wedding', () => {
    expect(daysUntilWedding('2026-08-08')).toBe(63)
    expect(daysUntilWedding(WEDDING_DATE)).toBe(0)
  })

  it('returns a negative count after the wedding', () => {
    expect(daysUntilWedding('2026-10-12')).toBe(-2)
  })
})

function task(overrides: Partial<PlannerTask> = {}): PlannerItem {
  return {
    kind: 'task',
    id: 't1',
    title: 'Souvenir',
    notes: null,
    dueDate: '2026-08-14',
    dueEndDate: null,
    assignee: 'both',
    status: 'todo',
    isFlagged: false,
    completedAt: null,
    ...overrides,
  }
}

function event(overrides: Partial<PlannerEvent> = {}): PlannerItem {
  return {
    kind: 'event',
    id: 'e1',
    title: 'First fitting',
    notes: null,
    startsAt: '2026-07-22T03:00:00+07:00',
    endsAt: '2026-07-22T06:00:00+07:00',
    allDay: false,
    location: 'Bandung',
    assignee: 'both',
    ...overrides,
  }
}

describe('expandMultiDaySpans', () => {
  it('emits one segment for a single-day task', () => {
    const segments = expandMultiDaySpans([task()], '2026-08-01', '2026-08-31')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ dayKey: '2026-08-14', isStart: true, isEnd: true, isAllDay: true })
  })

  it('emits one segment per day for a three-day block', () => {
    const segments = expandMultiDaySpans(
      [task({ dueDate: '2026-08-14', dueEndDate: '2026-08-16' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-14', '2026-08-15', '2026-08-16'])
    expect(segments.map((s) => s.isStart)).toEqual([true, false, false])
    expect(segments.map((s) => s.isEnd)).toEqual([false, false, true])
  })

  it('clips a span to the requested range', () => {
    const segments = expandMultiDaySpans(
      [task({ dueDate: '2026-07-30', dueEndDate: '2026-08-03' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    // The real start fell outside the range, so no segment claims to be the start.
    expect(segments[0].isStart).toBe(false)
    expect(segments[2].isEnd).toBe(true)
  })

  it('skips an unscheduled task entirely', () => {
    expect(expandMultiDaySpans([task({ dueDate: null })], '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('marks a timed event as not all-day', () => {
    const segments = expandMultiDaySpans([event()], '2026-07-01', '2026-07-31')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ dayKey: '2026-07-22', isAllDay: false })
  })

  it('spans an event that crosses midnight into two segments', () => {
    const segments = expandMultiDaySpans(
      [event({ startsAt: '2026-08-24T20:00:00+07:00', endsAt: '2026-08-25T01:00:00+07:00' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-24', '2026-08-25'])
  })
})

describe('buildMonthGrid', () => {
  it('always returns 6 rows of 7 days', () => {
    const grid = buildMonthGrid('2026-08')
    expect(grid).toHaveLength(6)
    for (const row of grid) expect(row).toHaveLength(7)
  })

  it('starts the first row on the Sunday on or before the 1st', () => {
    // 1 August 2026 is a Saturday, so the grid opens on Sunday 26 July.
    expect(buildMonthGrid('2026-08')[0][0]).toBe('2026-07-26')
  })

  it('contains every day of the month exactly once', () => {
    const flat = buildMonthGrid('2026-08').flat()
    for (let day = 1; day <= 31; day++) {
      const key = `2026-08-${String(day).padStart(2, '0')}`
      expect(flat.filter((d) => d === key)).toHaveLength(1)
    }
  })

  it('runs consecutively with no gaps', () => {
    const flat = buildMonthGrid('2026-10').flat()
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]).toBe(addDayKeys(flat[i - 1], 1))
    }
  })

  it('honours a Monday week start', () => {
    // 1 October 2026 is a Thursday, so a Monday grid opens on 28 September.
    expect(buildMonthGrid('2026-10', 1)[0][0]).toBe('2026-09-28')
  })
})

function timed(id: string, start: string, end: string): PlannerEvent {
  return {
    id,
    title: `Event ${id}`,
    notes: null,
    startsAt: `2026-08-24T${start}:00+07:00`,
    endsAt: `2026-08-24T${end}:00+07:00`,
    allDay: false,
    location: null,
    assignee: 'both',
  }
}

describe('layoutTimedEvents', () => {
  it('places a single event in one full-width lane', () => {
    const [layout] = layoutTimedEvents([timed('a', '09:00', '10:30')], '2026-08-24')
    expect(layout).toMatchObject({ laneIndex: 0, laneCount: 1, topMinutes: 540, heightMinutes: 90 })
  })

  it('gives two overlapping events one lane each', () => {
    const layouts = layoutTimedEvents([timed('a', '09:00', '11:00'), timed('b', '10:00', '12:00')], '2026-08-24')
    expect(layouts.map((l) => l.laneIndex)).toEqual([0, 1])
    expect(layouts.every((l) => l.laneCount === 2)).toBe(true)
  })

  it('reuses lane 0 for events that do not overlap', () => {
    const layouts = layoutTimedEvents([timed('a', '09:00', '10:00'), timed('b', '10:00', '11:00')], '2026-08-24')
    expect(layouts.map((l) => l.laneIndex)).toEqual([0, 0])
    expect(layouts.every((l) => l.laneCount === 1)).toBe(true)
  })

  it('enforces a 30 minute minimum height so a short event stays tappable', () => {
    const [layout] = layoutTimedEvents([timed('a', '09:00', '09:10')], '2026-08-24')
    expect(layout.heightMinutes).toBe(30)
  })

  it('clips an event that starts the previous day to midnight', () => {
    const overnight: PlannerEvent = {
      ...timed('a', '00:00', '02:00'),
      startsAt: '2026-08-23T22:00:00+07:00',
      endsAt: '2026-08-24T02:00:00+07:00',
    }
    const [layout] = layoutTimedEvents([overnight], '2026-08-24')
    expect(layout.topMinutes).toBe(0)
    expect(layout.heightMinutes).toBe(120)
  })

  it('excludes all-day events and events on another day', () => {
    const allDay: PlannerEvent = { ...timed('a', '09:00', '10:00'), allDay: true }
    expect(layoutTimedEvents([allDay], '2026-08-24')).toEqual([])
    expect(layoutTimedEvents([timed('b', '09:00', '10:00')], '2026-08-25')).toEqual([])
  })

  it('gives every event in a transitively-overlapping chain a laneCount that keeps their horizontal bands from overlapping', () => {
    const layouts = layoutTimedEvents(
      [
        timed('a', '09:00', '10:00'),
        timed('b', '09:30', '10:30'),
        timed('c', '10:00', '11:00'),
        timed('d', '10:15', '10:45'),
      ],
      '2026-08-24'
    )

    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i]
        const b = layouts[j]
        const timeOverlaps =
          a.topMinutes < b.topMinutes + b.heightMinutes && b.topMinutes < a.topMinutes + a.heightMinutes
        if (!timeOverlaps) continue

        const aStart = a.laneIndex / a.laneCount
        const aEnd = (a.laneIndex + 1) / a.laneCount
        const bStart = b.laneIndex / b.laneCount
        const bEnd = (b.laneIndex + 1) / b.laneCount
        const bandsOverlap = aStart < bEnd && bStart < aEnd

        expect(bandsOverlap).toBe(false)
      }
    }
  })
})

describe('bucketByHorizon', () => {
  const today = '2026-08-08'

  it('puts a past-due unfinished task in overdue', () => {
    const buckets = bucketByHorizon([task({ dueDate: '2026-08-01' })], today)
    expect(buckets.overdue.map((i) => i.id)).toEqual(['t1'])
  })

  it('never puts a completed task in overdue', () => {
    const done = task({ id: 't2', dueDate: '2026-08-01', status: 'done', completedAt: '2026-08-02T00:00:00Z' })
    expect(bucketByHorizon([done], today).overdue).toEqual([])
  })

  it('uses the block end date, so a block is not overdue until its last day passes', () => {
    const block = task({ dueDate: '2026-08-06', dueEndDate: '2026-08-10' })
    const buckets = bucketByHorizon([block], today)
    expect(buckets.overdue).toEqual([])
    expect(buckets.today.map((i) => i.id)).toEqual(['t1'])
  })

  it('separates today, the next seven days, and the rest of the month', () => {
    const items = [
      task({ id: 'a', dueDate: '2026-08-08' }),
      task({ id: 'b', dueDate: '2026-08-12' }),
      task({ id: 'c', dueDate: '2026-08-28' }),
      task({ id: 'd', dueDate: '2026-09-15' }),
    ]
    const buckets = bucketByHorizon(items, today)
    expect(buckets.today.map((i) => i.id)).toEqual(['a'])
    expect(buckets.next7.map((i) => i.id)).toEqual(['b'])
    expect(buckets.thisMonth.map((i) => i.id)).toEqual(['c'])
  })

  it('collects flagged unfinished tasks regardless of date', () => {
    const items = [
      task({ id: 'a', dueDate: null, isFlagged: true }),
      task({ id: 'b', dueDate: '2026-09-01', isFlagged: true }),
      task({ id: 'c', dueDate: '2026-09-01', isFlagged: true, status: 'done', completedAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(bucketByHorizon(items, today).flagged.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('collects undated unfinished tasks as unscheduled', () => {
    const buckets = bucketByHorizon([task({ dueDate: null })], today)
    expect(buckets.unscheduled.map((i) => i.id)).toEqual(['t1'])
  })

  it('counts progress across every task, dated or not', () => {
    const items = [
      task({ id: 'a', status: 'done', completedAt: '2026-08-01T00:00:00Z' }),
      task({ id: 'b' }),
      task({ id: 'c', dueDate: null }),
    ]
    const buckets = bucketByHorizon(items, today)
    expect(buckets.doneCount).toBe(1)
    expect(buckets.totalCount).toBe(3)
  })

  it('sorts every bucket by date ascending', () => {
    const items = [task({ id: 'late', dueDate: '2026-08-12' }), task({ id: 'early', dueDate: '2026-08-10' })]
    expect(bucketByHorizon(items, today).next7.map((i) => i.id)).toEqual(['early', 'late'])
  })

  it('puts a past event in no bucket at all, since events have no status to clear it', () => {
    const past = event({ id: 'e-past', startsAt: '2026-07-22T03:00:00+07:00', endsAt: '2026-07-22T06:00:00+07:00' })
    const buckets = bucketByHorizon([past], today)
    expect(buckets.overdue).toEqual([])
    expect(buckets.today).toEqual([])
    expect(buckets.next7).toEqual([])
    expect(buckets.thisMonth).toEqual([])
    expect(buckets.flagged).toEqual([])
    expect(buckets.unscheduled).toEqual([])
  })

  it('still buckets a currently-running event into today', () => {
    const current = event({ id: 'e-today', startsAt: '2026-08-08T03:00:00+07:00', endsAt: '2026-08-08T06:00:00+07:00' })
    const buckets = bucketByHorizon([current], today)
    expect(buckets.today.map((i) => i.id)).toEqual(['e-today'])
  })
})
