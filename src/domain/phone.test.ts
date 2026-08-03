import { describe, it, expect } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('returns null for a blank cell', () => {
    expect(normalizePhone('')).toEqual({ phone: null })
    expect(normalizePhone('   ')).toEqual({ phone: null })
    expect(normalizePhone(undefined)).toEqual({ phone: null })
  })

  it('normalizes the sheet 62 8xx-xxxx-xxxx shape to E.164', () => {
    expect(normalizePhone('62 878-8022-2055')).toEqual({ phone: '+6287880222055' })
  })

  it('strips the bidi control characters Google Sheets wraps phone cells in', () => {
    // U+202A LEFT-TO-RIGHT EMBEDDING ... U+202C POP DIRECTIONAL FORMATTING,
    // with U+2011 NON-BREAKING HYPHEN between groups. Real cells look like this.
    expect(normalizePhone('‪+62 888‑0878‑9652‬')).toEqual({
      phone: '+6288808789652',
    })
  })

  it('accepts a local 08xx number and an 8xx number missing its country code', () => {
    expect(normalizePhone('0812-3456-7890')).toEqual({ phone: '+6281234567890' })
    expect(normalizePhone('812 3456 7890')).toEqual({ phone: '+6281234567890' })
  })

  it('accepts an already-normalized number unchanged', () => {
    expect(normalizePhone('+6281234567890')).toEqual({ phone: '+6281234567890' })
  })

  it('drops separators, parentheses and non-breaking spaces', () => {
    expect(normalizePhone('(0812) 345 - 6789')).toEqual({ phone: '+628123456789' })
  })

  it('keeps a non-Indonesian country code as given', () => {
    expect(normalizePhone('+60 12-345 6789')).toEqual({ phone: '+60123456789' })
  })

  it('returns null and a warning for a cell that is not a phone number at all', () => {
    const result = normalizePhone('Undangan Fisik')
    expect(result.phone).toBeNull()
    expect(result.warning).toMatch(/not a phone number/i)
  })

  it('keeps an implausibly short or long number but warns about it', () => {
    const short = normalizePhone('62 812-345')
    expect(short.phone).toBe('+62812345')
    expect(short.warning).toMatch(/length/i)

    const long = normalizePhone('62 812-3456-7890-1234')
    expect(long.phone).toBe('+62812345678901234')
    expect(long.warning).toMatch(/length/i)
  })

  it('warns when an Indonesian number is not a mobile number', () => {
    const result = normalizePhone('62 21-1234-5678')
    expect(result.phone).toBe('+622112345678')
    expect(result.warning).toMatch(/mobile/i)
  })
})
