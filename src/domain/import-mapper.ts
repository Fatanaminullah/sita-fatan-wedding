import { normalizePhone } from './phone'

export type SheetRow = Record<string, string>

export type Side = 'fatan' | 'sita'

export type MappedGuest = {
  guest: {
    name: string
    pax: number
    side: Side
    inviterKey: string
    type: 'family' | 'friend'
    note: string | null
    phone: string | null
    isVip: boolean
  }
  guestEvents: Array<{
    event: 'akad' | 'resepsi'
    inviteStatus: 'confirmed' | 'waitlisted'
  }>
}

export type MapRowResult =
  | { ok: true; row: MappedGuest; warnings: string[] }
  | { ok: false; errors: string[] }

export type MapOptions = {
  /** `inviters.key` to `inviters.side`, loaded live from the database. */
  inviterSides: Readonly<Record<string, Side>>
}

// Column names as the sheet actually writes them. `No` and `Note` are read
// when present but the import survives without them, so neither is required.
const REQUIRED_HEADERS = [
  'Nama', 'Pax', 'Undangan', 'Type', 'Akad', 'Resepsi', 'VIP', 'Whatsapp', 'Waiting List',
] as const

export function requiredHeaders(): readonly string[] {
  return REQUIRED_HEADERS
}

/** An exported sheet is padded with hundreds of empty rows. They are not anomalies. */
export function isBlankRow(row: SheetRow): boolean {
  return Object.values(row).every((value) => !String(value ?? '').trim())
}

type YesNo = { ok: true; value: boolean } | { ok: false; error: string }

function parseYesNo(raw: string | undefined, column: string): YesNo {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '') return { ok: true, value: false }
  if (value === 'yes' || value === 'y' || value === 'ya' || value === 'true') return { ok: true, value: true }
  if (value === 'no' || value === 'n' || value === 'tidak' || value === 'false') return { ok: true, value: false }
  return { ok: false, error: `${column} must be Yes or No, got "${raw}"` }
}

export function mapSheetRow(row: SheetRow, options: MapOptions): MapRowResult {
  const errors: string[] = []
  const warnings: string[] = []

  const name = (row['Nama'] ?? '').trim()
  if (!name) errors.push('Nama is required')

  // Blank Pax defaults rather than dropping the guest: a missing headcount is
  // fixable in-app, a guest who never got imported is one nobody remembers.
  const paxRaw = (row['Pax'] ?? '').trim()
  let pax = 1
  if (paxRaw === '') {
    warnings.push('Pax is blank, defaulted to 1')
  } else {
    const parsed = Number(paxRaw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.push(`Pax is not a positive whole number: "${paxRaw}"`)
    } else {
      pax = parsed
    }
  }

  // The sheet has no Side column. Side is a property of the inviter, so it is
  // derived from Undangan against the live inviters table, never guessed.
  const inviterKey = (row['Undangan'] ?? '').trim()
  let side: Side | undefined
  if (!inviterKey) {
    errors.push('Undangan is required')
  } else {
    side = options.inviterSides[inviterKey]
    if (!side) {
      errors.push(
        `Undangan "${inviterKey}" is not a known inviter (expected one of: ` +
          `${Object.keys(options.inviterSides).join(', ')})`
      )
    }
  }

  const typeRaw = (row['Type'] ?? '').trim().toLowerCase()
  let type: 'family' | 'friend' = 'friend'
  if (typeRaw === '') {
    warnings.push('Type is blank, defaulted to friend')
  } else if (typeRaw === 'family' || typeRaw === 'friend') {
    type = typeRaw
  } else {
    errors.push(`Type must be Family or Friend, got "${row['Type']}"`)
  }

  const akad = parseYesNo(row['Akad'], 'Akad')
  if (!akad.ok) errors.push(akad.error)
  const resepsi = parseYesNo(row['Resepsi'], 'Resepsi')
  if (!resepsi.ok) errors.push(resepsi.error)
  if (akad.ok && resepsi.ok && !akad.value && !resepsi.value) {
    errors.push('not invited to any event (both Akad and Resepsi are No)')
  }

  const vip = parseYesNo(row['VIP'], 'VIP')
  if (!vip.ok) errors.push(vip.error)
  const waitingList = parseYesNo(row['Waiting List'], 'Waiting List')
  if (!waitingList.ok) errors.push(waitingList.error)

  const { phone, warning: phoneWarning } = normalizePhone(row['Whatsapp'])
  if (phoneWarning) warnings.push(phoneWarning)

  if (errors.length > 0) return { ok: false, errors }

  // Narrowing for TypeScript: every one of these is guaranteed by the error
  // checks above, which returned already if any of them failed.
  if (!akad.ok || !resepsi.ok || !vip.ok || !waitingList.ok || !side) {
    return { ok: false, errors: ['unmappable row'] }
  }

  const inviteStatus = waitingList.value ? 'waitlisted' : 'confirmed'
  const guestEvents: MappedGuest['guestEvents'] = []
  if (akad.value) guestEvents.push({ event: 'akad', inviteStatus })
  if (resepsi.value) guestEvents.push({ event: 'resepsi', inviteStatus })

  return {
    ok: true,
    warnings,
    row: {
      guest: {
        name,
        pax,
        side,
        inviterKey,
        type,
        note: (row['Note'] ?? '').trim() || null,
        phone,
        isVip: vip.value,
      },
      guestEvents,
    },
  }
}
