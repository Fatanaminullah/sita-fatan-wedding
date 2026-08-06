import { describe, it, expect } from 'vitest'
import { buildDiff } from './audit'

describe('buildDiff', () => {
  it('logs every field as null -> value on create (before is null)', () => {
    const diff = buildDiff<{ name: string; pax: number }>(null, { name: 'Budi', pax: 2 }, ['name', 'pax'])
    expect(diff).toEqual({
      name: { old: null, new: 'Budi' },
      pax: { old: null, new: 2 },
    })
  })

  it('logs every field as value -> null on delete (after is null)', () => {
    const diff = buildDiff<{ name: string; pax: number }>({ name: 'Budi', pax: 2 }, null, ['name', 'pax'])
    expect(diff).toEqual({
      name: { old: 'Budi', new: null },
      pax: { old: 2, new: null },
    })
  })

  it('keeps only fields that actually changed on update', () => {
    const diff = buildDiff<{ name: string; pax: number }>(
      { name: 'Budi', pax: 2 },
      { name: 'Budi', pax: 3 },
      ['name', 'pax']
    )
    expect(diff).toEqual({ pax: { old: 2, new: 3 } })
  })

  it('returns an empty object when nothing changed', () => {
    const diff = buildDiff<{ name: string }>({ name: 'Budi' }, { name: 'Budi' }, ['name'])
    expect(diff).toEqual({})
  })
})
