/**
 * Gift envelopes: the code on the label, and the amount counted after.
 *
 * The code is assigned by the database (F-0142, S-0007, U-0012). These are the
 * forgiving readers for what a person types while counting a pile of
 * envelopes late at night: lower case, no dash, no leading zeros, "500rb".
 */

const CODE = /^([FSU])\s*-?\s*(\d{1,6})$/

/** The canonical code for what was typed, or null when it cannot be one. */
export function normaliseEnvelopeCode(input: string): string | null {
  const match = CODE.exec(input.trim().toUpperCase())
  if (!match) return null
  return `${match[1]}-${match[2].padStart(4, '0')}`
}

const MULTIPLIER: Array<[RegExp, number]> = [
  [/\s*(jt|juta)$/, 1_000_000],
  [/\s*(rb|ribu|k)$/, 1_000],
]

/**
 * Rupiah from what was typed. Separators are dots or commas, both of which
 * Indonesians use for thousands; with a "jt" or "rb" suffix the one separator
 * is a decimal point instead ("1,5jt" is one and a half million).
 */
export function parseAmount(input: string): number | null {
  let text = input.trim().toLowerCase().replace(/^rp\.?\s*/, '')
  if (!text) return null

  let multiplier = 1
  for (const [suffix, value] of MULTIPLIER) {
    if (suffix.test(text)) {
      text = text.replace(suffix, '')
      multiplier = value
      break
    }
  }

  if (multiplier === 1) {
    if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) return null
    return Number(text.replace(/[.,]/g, ''))
  }

  if (!/^\d+([.,]\d+)?$/.test(text)) return null
  return Math.round(Number(text.replace(',', '.')) * multiplier)
}

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
