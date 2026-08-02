import { describe, it, expect } from 'vitest'
import { mapSheetRow, requiredHeaders, type SheetRow } from './import-mapper'

function row(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    Name: 'Budi Santoso',
    Pax: '2',
    Side: 'fatan',
    Inviter: 'Mama Fatan',
    Type: 'family',
    Note: '',
    Whatsapp: '',
    VIP: '',
    'Waiting List': '',
    Akad: 'Yes',
    Resepsi: 'Yes',
    ...overrides,
  }
}

describe('requiredHeaders', () => {
  it('lists every header the mapper reads', () => {
    expect(requiredHeaders()).toEqual([
      'Name', 'Pax', 'Side', 'Inviter', 'Type', 'Whatsapp', 'VIP', 'Waiting List', 'Akad', 'Resepsi',
    ])
  })
})

describe('mapSheetRow', () => {
  it('maps a complete row invited to both events, confirmed', () => {
    const result = mapSheetRow(row())
    expect(result).toEqual({
      ok: true,
      row: {
        guest: {
          name: 'Budi Santoso',
          pax: 2,
          side: 'fatan',
          inviterKey: 'Mama Fatan',
          type: 'family',
          note: null,
          phone: null,
          isVip: false,
        },
        guestEvents: [
          { event: 'akad', inviteStatus: 'confirmed' },
          { event: 'resepsi', inviteStatus: 'confirmed' },
        ],
      },
    })
  })

  it('only creates a guest_events row for non-blank event columns', () => {
    const result = mapSheetRow(row({ Akad: '', Resepsi: 'Yes' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guestEvents).toEqual([{ event: 'resepsi', inviteStatus: 'confirmed' }])
    }
  })

  it('expands a guest-level Waiting List flag across every event that guest is invited to', () => {
    const result = mapSheetRow(row({ 'Waiting List': 'Yes' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guestEvents).toEqual([
        { event: 'akad', inviteStatus: 'waitlisted' },
        { event: 'resepsi', inviteStatus: 'waitlisted' },
      ])
    }
  })

  it('reads VIP and phone when present', () => {
    const result = mapSheetRow(row({ VIP: 'Yes', Whatsapp: '+6281234567890' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.isVip).toBe(true)
      expect(result.row.guest.phone).toBe('+6281234567890')
    }
  })

  it('reports an error for a missing name without throwing', () => {
    const result = mapSheetRow(row({ Name: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('Name is required')
    }
  })

  it('reports an error for non-numeric pax', () => {
    const result = mapSheetRow(row({ Pax: 'two' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/Pax is not a positive number/)
    }
  })

  it('reports an error for an unrecognized side, case-insensitively accepting valid ones', () => {
    const bad = mapSheetRow(row({ Side: 'north' }))
    expect(bad.ok).toBe(false)

    const good = mapSheetRow(row({ Side: 'FATAN' }))
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.row.guest.side).toBe('fatan')
  })

  it('two rows with the same name map independently, as two separate guests', () => {
    const first = mapSheetRow(row({ Name: 'Dian' }))
    const second = mapSheetRow(row({ Name: 'Dian', Pax: '1' }))
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.row.guest.pax).toBe(2)
      expect(second.row.guest.pax).toBe(1)
    }
  })
})
