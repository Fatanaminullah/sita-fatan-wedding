import { describe, it, expect } from 'vitest'
import {
  toDayKey,
  addDayKeys,
  daysUntilWedding,
  WEDDING_DATE,
  expandMultiDaySpans,
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
