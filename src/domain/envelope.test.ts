import { describe, expect, it } from 'vitest'
import { formatRupiah, normaliseEnvelopeCode, parseAmount } from './envelope'

describe('normaliseEnvelopeCode', () => {
  it('accepts the code as printed', () => {
    expect(normaliseEnvelopeCode('F-0142')).toBe('F-0142')
  })

  it('forgives lower case, a missing dash and missing zeros', () => {
    expect(normaliseEnvelopeCode('f142')).toBe('F-0142')
    expect(normaliseEnvelopeCode(' s 7 ')).toBe('S-0007')
    expect(normaliseEnvelopeCode('u-12')).toBe('U-0012')
  })

  it('keeps a number past four digits whole', () => {
    expect(normaliseEnvelopeCode('F12345')).toBe('F-12345')
  })

  it('refuses anything that is not a side letter and a number', () => {
    expect(normaliseEnvelopeCode('X-0001')).toBeNull()
    expect(normaliseEnvelopeCode('0142')).toBeNull()
    expect(normaliseEnvelopeCode('')).toBeNull()
  })
})

describe('parseAmount', () => {
  it('reads plain rupiah with or without separators', () => {
    expect(parseAmount('500000')).toBe(500000)
    expect(parseAmount('500.000')).toBe(500000)
    expect(parseAmount('1,250,000')).toBe(1250000)
    expect(parseAmount('Rp 300.000')).toBe(300000)
  })

  it('reads the shorthand people write on envelopes', () => {
    expect(parseAmount('500rb')).toBe(500000)
    expect(parseAmount('500 ribu')).toBe(500000)
    expect(parseAmount('500k')).toBe(500000)
    expect(parseAmount('1jt')).toBe(1000000)
    expect(parseAmount('1,5jt')).toBe(1500000)
    expect(parseAmount('2.5 juta')).toBe(2500000)
  })

  it('refuses what is not an amount', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-5000')).toBeNull()
  })

  it('allows zero, for an envelope that held something other than money', () => {
    expect(parseAmount('0')).toBe(0)
  })
})

describe('formatRupiah', () => {
  it('writes rupiah the Indonesian way', () => {
    expect(formatRupiah(500000)).toBe('Rp 500.000')
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000')
    expect(formatRupiah(0)).toBe('Rp 0')
  })
})
