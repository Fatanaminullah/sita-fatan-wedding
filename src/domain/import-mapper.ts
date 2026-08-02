export type SheetRow = Record<string, string>

export type MappedGuest = {
  guest: {
    name: string
    pax: number
    side: 'fatan' | 'sita'
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

export type MapRowResult = { ok: true; row: MappedGuest } | { ok: false; errors: string[] }

const REQUIRED_HEADERS = [
  'Name', 'Pax', 'Side', 'Inviter', 'Type', 'Whatsapp', 'VIP', 'Waiting List', 'Akad', 'Resepsi',
] as const

export function requiredHeaders(): readonly string[] {
  return REQUIRED_HEADERS
}

export function mapSheetRow(row: SheetRow): MapRowResult {
  const errors: string[] = []

  const name = row['Name']?.trim()
  if (!name) errors.push('Name is required')

  const paxRaw = row['Pax']?.trim()
  const pax = Number(paxRaw)
  if (!paxRaw || Number.isNaN(pax) || pax <= 0) {
    errors.push(`Pax is not a positive number: "${paxRaw ?? ''}"`)
  }

  const sideRaw = row['Side']?.trim().toLowerCase()
  if (sideRaw !== 'fatan' && sideRaw !== 'sita') {
    errors.push(`Side must be "fatan" or "sita", got "${row['Side'] ?? ''}"`)
  }

  const inviterKey = row['Inviter']?.trim()
  if (!inviterKey) errors.push('Inviter is required')

  const typeRaw = row['Type']?.trim().toLowerCase()
  if (typeRaw !== 'family' && typeRaw !== 'friend') {
    errors.push(`Type must be "family" or "friend", got "${row['Type'] ?? ''}"`)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const isWaitlisted = row['Waiting List']?.trim().toLowerCase() === 'yes'
  const isVip = row['VIP']?.trim().toLowerCase() === 'yes'
  const phone = row['Whatsapp']?.trim() || null
  const note = row['Note']?.trim() || null

  const guestEvents: MappedGuest['guestEvents'] = []
  if (row['Akad']?.trim()) {
    guestEvents.push({ event: 'akad', inviteStatus: isWaitlisted ? 'waitlisted' : 'confirmed' })
  }
  if (row['Resepsi']?.trim()) {
    guestEvents.push({ event: 'resepsi', inviteStatus: isWaitlisted ? 'waitlisted' : 'confirmed' })
  }

  return {
    ok: true,
    row: {
      guest: {
        name: name!,
        pax,
        side: sideRaw as 'fatan' | 'sita',
        inviterKey: inviterKey!,
        type: typeRaw as 'family' | 'friend',
        note,
        phone,
        isVip,
      },
      guestEvents,
    },
  }
}
