import { describe, it, expect } from 'vitest'
import { mapSheetRow, requiredHeaders, isBlankRow, type SheetRow } from './import-mapper'

// The six seeded inviter keys, exactly as `inviters.key` stores them. The
// script passes the live table; tests pass this copy.
const inviterSides = {
  Fatan: 'fatan',
  'Mama Fatan': 'fatan',
  'Papa Fatan': 'fatan',
  Sita: 'sita',
  'Mama Sita': 'sita',
  'Papa Sita': 'sita',
} as const

function row(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    No: '',
    Nama: 'Budi Santoso',
    Pax: '2',
    Undangan: 'Mama Fatan',
    Type: 'Family',
    Akad: 'Yes',
    Resepsi: 'Yes',
    VIP: '',
    Note: '',
    Whatsapp: '',
    'Waiting List': 'No',
    ...overrides,
  }
}

function map(overrides: Partial<SheetRow> = {}) {
  return mapSheetRow(row(overrides), { inviterSides })
}

describe('requiredHeaders', () => {
  it('lists the sheet columns the mapper cannot work without', () => {
    expect(requiredHeaders()).toEqual([
      'Nama', 'Pax', 'Undangan', 'Type', 'Akad', 'Resepsi', 'VIP', 'Whatsapp', 'Waiting List',
    ])
  })
})

describe('isBlankRow', () => {
  it('is true for the empty padding rows an exported sheet ends with', () => {
    expect(isBlankRow({ No: '', Nama: '', Pax: '', Undangan: '' })).toBe(true)
    expect(isBlankRow({ No: '', Nama: '   ', Pax: '' })).toBe(true)
  })

  it('is false for a row with any content, even only a name', () => {
    expect(isBlankRow({ No: '', Nama: 'Dian', Pax: '' })).toBe(false)
  })
})

describe('mapSheetRow', () => {
  it('maps a complete row invited to both events, confirmed', () => {
    const result = map()
    expect(result).toEqual({
      ok: true,
      warnings: [],
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

  it('derives side from the Undangan column, since the sheet has no Side column', () => {
    const result = map({ Undangan: 'Papa Sita' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.side).toBe('sita')
      expect(result.row.guest.inviterKey).toBe('Papa Sita')
    }
  })

  it('rejects an inviter that is not one of the seeded keys', () => {
    const result = map({ Undangan: 'Om Budi' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/Undangan "Om Budi" is not a known inviter/)
  })

  it('only creates a guest_events row where the event column says Yes', () => {
    // "No" is the sheet's way of saying not invited. Treating any non-blank
    // value as invited would invite every "No" row to that event.
    const notInvitedToAkad = map({ Akad: 'No', Resepsi: 'Yes' })
    expect(notInvitedToAkad.ok).toBe(true)
    if (notInvitedToAkad.ok) {
      expect(notInvitedToAkad.row.guestEvents).toEqual([{ event: 'resepsi', inviteStatus: 'confirmed' }])
    }

    const blankAkad = map({ Akad: '', Resepsi: 'Yes' })
    expect(blankAkad.ok).toBe(true)
    if (blankAkad.ok) {
      expect(blankAkad.row.guestEvents).toEqual([{ event: 'resepsi', inviteStatus: 'confirmed' }])
    }
  })

  it('rejects a row invited to no event at all', () => {
    const result = map({ Akad: 'No', Resepsi: 'No' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/not invited to any event/)
  })

  it('reads Yes/No columns case-insensitively and treats blank as No', () => {
    const result = map({ VIP: 'YES', 'Waiting List': '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.isVip).toBe(true)
      expect(result.row.guestEvents.every((e) => e.inviteStatus === 'confirmed')).toBe(true)
    }
  })

  it('rejects a Yes/No column holding something that is neither', () => {
    const result = map({ VIP: 'maybe' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/VIP must be Yes or No/)
  })

  it('expands a guest-level Waiting List flag across every event that guest is invited to', () => {
    const result = map({ 'Waiting List': 'Yes' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guestEvents).toEqual([
        { event: 'akad', inviteStatus: 'waitlisted' },
        { event: 'resepsi', inviteStatus: 'waitlisted' },
      ])
    }
  })

  it('normalizes the Whatsapp column to E.164', () => {
    const result = map({ Whatsapp: '62 878-8022-2055' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.row.guest.phone).toBe('+6287880222055')
  })

  it('imports with a null phone and a warning when Whatsapp holds free text', () => {
    const result = map({ Whatsapp: 'Undangan Fisik' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.phone).toBeNull()
      expect(result.warnings[0]).toMatch(/not a phone number/i)
    }
  })

  it('reads the Note column when present and leaves it null when blank', () => {
    const withNote = map({ Note: 'Kel. Uti' })
    expect(withNote.ok && withNote.row.guest.note).toBe('Kel. Uti')
    const withoutNote = map({ Note: '' })
    expect(withoutNote.ok && withoutNote.row.guest.note).toBeNull()
  })

  it('reports an error for a missing name without throwing', () => {
    const result = map({ Nama: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('Nama is required')
  })

  it('defaults a blank Pax to 1 and warns, rather than dropping the guest', () => {
    const result = map({ Pax: '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.pax).toBe(1)
      expect(result.warnings[0]).toMatch(/Pax is blank, defaulted to 1/)
    }
  })

  it('reports an error for a Pax that is filled in but not a positive number', () => {
    expect(map({ Pax: 'two' }).ok).toBe(false)
    expect(map({ Pax: '0' }).ok).toBe(false)
    expect(map({ Pax: '-1' }).ok).toBe(false)
  })

  it('defaults a blank Type to friend and warns', () => {
    const result = map({ Type: '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.type).toBe('friend')
      expect(result.warnings[0]).toMatch(/Type is blank, defaulted to friend/)
    }
  })

  it('reports an error for a Type that is filled in but unrecognized', () => {
    const result = map({ Type: 'colleague' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/Type must be Family or Friend/)
  })

  it('two rows with the same name map independently, as two separate guests', () => {
    const first = map({ Nama: 'Dian' })
    const second = map({ Nama: 'Dian', Pax: '1' })
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.row.guest.pax).toBe(2)
      expect(second.row.guest.pax).toBe(1)
    }
  })
})
