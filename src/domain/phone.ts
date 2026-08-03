export type NormalizedPhone = {
  /** E.164, e.g. `+6281234567890`. Null when the cell holds no usable number. */
  phone: string | null
  /** Set when the value was kept but is worth a human look. */
  warning?: string
}

// Google Sheets wraps phone cells in bidi controls (LRE/PDF/LRM and friends),
// and its autoformatting uses U+2011 NON-BREAKING HYPHEN. Both survive a copy
// into .xlsx and both break a naive digit strip, so remove them explicitly.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

// Indonesian mobile numbers are 62 + 8xx + subscriber, 9 to 13 digits after
// the country code. Anything outside that is kept but flagged, never dropped.
const ID_NATIONAL_MIN = 9
const ID_NATIONAL_MAX = 13

export function normalizePhone(raw: string | null | undefined): NormalizedPhone {
  const cleaned = (raw ?? '').replace(INVISIBLE, '').trim()
  if (!cleaned) return { phone: null }

  const digits = cleaned.replace(/\D/g, '')
  if (!digits) {
    return { phone: null, warning: `"${cleaned}" is not a phone number, imported with no phone` }
  }

  const explicitCountryCode = cleaned.replace(/[^\d+]/g, '').startsWith('+')

  let e164: string
  if (explicitCountryCode) {
    e164 = `+${digits}`
  } else if (digits.startsWith('62')) {
    e164 = `+${digits}`
  } else if (digits.startsWith('0')) {
    e164 = `+62${digits.slice(1)}`
  } else if (digits.startsWith('8')) {
    e164 = `+62${digits}`
  } else {
    return {
      phone: `+${digits}`,
      warning: `"${cleaned}" has no recognizable country code, stored as +${digits}`,
    }
  }

  if (!e164.startsWith('+62')) return { phone: e164 }

  const national = e164.slice(3)
  if (national.length < ID_NATIONAL_MIN || national.length > ID_NATIONAL_MAX) {
    return {
      phone: e164,
      warning: `"${cleaned}" has an implausible length for an Indonesian number (${national.length} digits after +62)`,
    }
  }
  if (!national.startsWith('8')) {
    return { phone: e164, warning: `"${cleaned}" is not an Indonesian mobile number, WhatsApp may not reach it` }
  }

  return { phone: e164 }
}
