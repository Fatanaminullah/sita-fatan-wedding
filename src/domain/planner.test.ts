import { describe, it, expect } from 'vitest'
import { toDayKey, addDayKeys, daysUntilWedding, WEDDING_DATE } from './planner'

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
