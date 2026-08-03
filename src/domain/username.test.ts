import { describe, it, expect } from 'vitest'
import { checkUsername, looksLikeEmail, normalizeUsername } from './username'

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Sita  ')).toBe('sita')
    expect(normalizeUsername('MamaFatan')).toBe('mamafatan')
  })

  it('handles a missing value', () => {
    expect(normalizeUsername(null)).toBe('')
    expect(normalizeUsername(undefined)).toBe('')
  })
})

describe('looksLikeEmail', () => {
  it('treats anything with an @ as an email', () => {
    expect(looksLikeEmail('sita@gmail.com')).toBe(true)
    expect(looksLikeEmail(' Sita@Gmail.com ')).toBe(true)
  })

  it('treats a bare handle as a username', () => {
    expect(looksLikeEmail('sita')).toBe(false)
    expect(looksLikeEmail('mama.fatan')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
  })
})

describe('checkUsername', () => {
  it('accepts the handles we hand out', () => {
    expect(checkUsername('fatan')).toEqual({ ok: true, username: 'fatan' })
    expect(checkUsername(' Mama_Fatan ')).toEqual({ ok: true, username: 'mama_fatan' })
    expect(checkUsername('papa.sita')).toEqual({ ok: true, username: 'papa.sita' })
    expect(checkUsername('usher-1')).toEqual({ ok: true, username: 'usher-1' })
  })

  it('rejects a blank username', () => {
    expect(checkUsername('   ')).toEqual({ ok: false, error: 'Username is required.' })
  })

  it('rejects an email, so the login field can tell the two apart', () => {
    const result = checkUsername('sita@gmail.com')
    expect(result.ok).toBe(false)
  })

  it('rejects out-of-range lengths', () => {
    expect(checkUsername('s').ok).toBe(false)
    expect(checkUsername('s'.repeat(33)).ok).toBe(false)
    expect(checkUsername('s'.repeat(32)).ok).toBe(true)
  })

  it('rejects characters that are awkward to say out loud or type', () => {
    expect(checkUsername('mama fatan').ok).toBe(false)
    expect(checkUsername('sita!').ok).toBe(false)
    expect(checkUsername('.sita').ok).toBe(false)
    expect(checkUsername('sita-').ok).toBe(false)
  })
})
