import { describe, it, expect } from 'vitest'
import { seedLanguageFromName, HONORIFICS } from './language'

describe('seedLanguageFromName', () => {
  it('defaults to English, matching the invitation site', () => {
    expect(seedLanguageFromName('Budi Santoso')).toBe('en')
    expect(seedLanguageFromName('Sarah Wijaya')).toBe('en')
  })

  it('reads every listed honorific as Indonesian', () => {
    for (const title of HONORIFICS) {
      expect(seedLanguageFromName(`${title} Ahmad`)).toBe('id')
    }
  })

  it('ignores case and a trailing dot, both of which the sheet contains', () => {
    expect(seedLanguageFromName('pak Budi')).toBe('id')
    expect(seedLanguageFromName('Hj. Siti')).toBe('id')
    expect(seedLanguageFromName('BAPAK Ahmad')).toBe('id')
  })

  it('matches a whole word only, so a name that merely starts with one does not', () => {
    // These are the false positives a prefix check would produce.
    expect(seedLanguageFromName('Bunga Lestari')).toBe('en')
    expect(seedLanguageFromName('Omar Khalid')).toBe('en')
    expect(seedLanguageFromName('Ibunda Sejati')).toBe('en')
    expect(seedLanguageFromName('Paketan Ahmad')).toBe('en')
    expect(seedLanguageFromName('Hjalmar Nilsson')).toBe('en')
  })

  it('finds an honorific that is not the first word', () => {
    // The sheet holds entries like "Keluarga Bapak Ahmad".
    expect(seedLanguageFromName('Keluarga Bapak Ahmad')).toBe('id')
    expect(seedLanguageFromName('Ahmad dan Ibu Siti')).toBe('id')
  })

  it('survives the empty and whitespace cases without throwing', () => {
    expect(seedLanguageFromName('')).toBe('en')
    expect(seedLanguageFromName('   ')).toBe('en')
  })
})
