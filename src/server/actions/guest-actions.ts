'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '../supabase/server-client'
import {
  insertGuest,
  updateGuest as updateGuestRepo,
  deleteGuest as deleteGuestRepo,
  getGuest,
  updateGuestPhone as updateGuestPhoneRepo,
  setGuestCandid as setGuestCandidRepo,
} from '../repositories/guests-repository'
import { setGuestEvents, type EventInvite } from '../repositories/guest-events-repository'
import { checkQuota } from '@/domain/quota'
import { normalizePhone } from '@/domain/phone'
import { loadInviterCapacity, listInviters } from '../repositories/inviters-repository'
import { getCurrentProfile } from './auth-actions'
import { buildDiff } from '@/domain/audit'
import { decideRsvp } from '@/domain/rsvp'
import { clearRsvp, listGuestInvitations, recordRsvp } from '../repositories/guest-events-repository'
import { insertAuditLog } from '../repositories/audit-log-repository'

export type GuestFormResult = { error: string } | { guestId: string; flags: string[] }

type ParsedGuest = {
  name: string
  pax: number
  inviterKey: string
  type: 'family' | 'friend'
  phone: string | null
  phoneWarning?: string
  isVip: boolean
  isPhysicalInvitation: boolean
  note: string | null
  invites: EventInvite[]
}

function parseInviteStatus(value: FormDataEntryValue | null): EventInvite['inviteStatus'] {
  const raw = String(value ?? 'none')
  return raw === 'confirmed' || raw === 'waitlisted' ? raw : 'none'
}

function parseGuestForm(formData: FormData): { error: string } | ParsedGuest {
  const name = String(formData.get('name') ?? '').trim()
  const pax = Number(formData.get('pax'))
  const inviterKey = String(formData.get('inviterKey') ?? '').trim()
  const type = String(formData.get('type') ?? '') as 'family' | 'friend'

  if (!name) return { error: 'Name is required.' }
  if (!Number.isInteger(pax) || pax <= 0) return { error: 'Pax must be a whole number above zero.' }
  if (!inviterKey) return { error: 'Inviter is required.' }
  if (type !== 'family' && type !== 'friend') return { error: 'Type must be family or friend.' }

  const invites: EventInvite[] = [
    { event: 'akad', inviteStatus: parseInviteStatus(formData.get('akad')) },
    { event: 'resepsi', inviteStatus: parseInviteStatus(formData.get('resepsi')) },
  ]
  if (invites.every((invite) => invite.inviteStatus === 'none')) {
    return { error: 'A guest has to be invited to at least one event.' }
  }

  // Same normalizer the import uses, so a number typed as "0812 3456 7890"
  // is stored in the one shape the WhatsApp gateway will accept.
  const { phone, warning } = normalizePhone(String(formData.get('phone') ?? ''))

  return {
    name,
    pax,
    inviterKey,
    type,
    phone,
    phoneWarning: warning,
    isVip: formData.get('isVip') === 'on',
    isPhysicalInvitation: formData.get('isPhysicalInvitation') === 'on',
    note: String(formData.get('note') ?? '').trim() || null,
    invites,
  }
}

type GuestSnapshot = {
  name: string
  pax: number
  side: string
  inviter_key: string
  type: string
  phone: string | null
  is_vip: boolean
  is_physical_invitation: boolean
  note: string | null
  akad_invite_status: string | null
  resepsi_invite_status: string | null
}

const GUEST_SNAPSHOT_FIELDS: readonly (keyof GuestSnapshot)[] = [
  'name',
  'pax',
  'side',
  'inviter_key',
  'type',
  'phone',
  'is_vip',
  'is_physical_invitation',
  'note',
  'akad_invite_status',
  'resepsi_invite_status',
]

function snapshotFromExisting(row: {
  name: string
  pax: number
  side: string
  inviter_key: string
  type: string
  phone: string | null
  is_vip: boolean
  is_physical_invitation: boolean
  note: string | null
  guest_events?: Array<{ event: 'akad' | 'resepsi'; invite_status: string }> | null
}): GuestSnapshot {
  const events = row.guest_events ?? []
  const statusFor = (event: 'akad' | 'resepsi') => events.find((e) => e.event === event)?.invite_status ?? null
  return {
    name: row.name,
    pax: row.pax,
    side: row.side,
    inviter_key: row.inviter_key,
    type: row.type,
    phone: row.phone,
    is_vip: row.is_vip,
    is_physical_invitation: row.is_physical_invitation,
    note: row.note,
    akad_invite_status: statusFor('akad'),
    resepsi_invite_status: statusFor('resepsi'),
  }
}

function snapshotFromParsed(parsed: ParsedGuest, side: 'fatan' | 'sita'): GuestSnapshot {
  const statusFor = (event: 'akad' | 'resepsi') => {
    const invite = parsed.invites.find((i) => i.event === event)
    return invite && invite.inviteStatus !== 'none' ? invite.inviteStatus : null
  }
  return {
    name: parsed.name,
    pax: parsed.pax,
    side,
    inviter_key: parsed.inviterKey,
    type: parsed.type,
    phone: parsed.phone,
    is_vip: parsed.isVip,
    is_physical_invitation: parsed.isPhysicalInvitation,
    note: parsed.note,
    akad_invite_status: statusFor('akad'),
    resepsi_invite_status: statusFor('resepsi'),
  }
}

/**
 * Side is a property of the inviter, never a free-standing choice: taking it
 * from the inviters table is what stops a guest ending up on a side their
 * inviter does not belong to.
 */
async function sideOfInviter(supabase: SupabaseClient, inviterKey: string) {
  const inviters = await listInviters(supabase)
  const inviter = inviters.find((row) => row.key === inviterKey)
  return inviter ? (inviter.side as 'fatan' | 'sita') : null
}

/**
 * Quota is decided before the write and never blocks it (warn, allow, flag).
 * `previous` is what this guest already contributed, so an edit is measured
 * against the list without them rather than counting their pax twice.
 */
async function quotaFlags(
  supabase: SupabaseClient,
  inviterKey: string,
  pax: number,
  invites: EventInvite[],
  previous: { inviterKey: string; pax: number; confirmedEvents: Array<'akad' | 'resepsi'> } | null
): Promise<string[]> {
  const flags: string[] = []
  for (const invite of invites) {
    if (invite.inviteStatus !== 'confirmed') continue
    const state = await loadInviterCapacity(supabase, inviterKey, invite.event)
    const previousPax =
      previous && previous.inviterKey === inviterKey && previous.confirmedEvents.includes(invite.event)
        ? previous.pax
        : 0
    const decision = checkQuota({ cap: state.cap, confirmedPax: state.confirmedPax - previousPax }, pax)
    if (decision.overCap) {
      flags.push(`${inviterKey} is now ${decision.overBy} pax over cap on ${invite.event}.`)
    }
  }
  return flags
}

/**
 * Printed cards are a side-level pool (25 per side, shared across that side's
 * inviters), counted in entries, not pax. Same warn-allow-flag treatment as
 * pax quotas: the save already happened or is about to; this only names the
 * overflow. Runs only when this save turns the guest physical, because an
 * already-physical guest's card is already printed and counted.
 *
 * The count comes from the physical_invitation_counts() definer function so
 * an inviter measures against the whole side, not just their own RLS-visible
 * entries.
 */
async function physicalFlag(
  supabase: SupabaseClient,
  side: 'fatan' | 'sita',
  becomesPhysical: boolean,
  wasPhysical: boolean
): Promise<string[]> {
  if (!becomesPhysical || wasPhysical) return []

  const [countsResult, capResult] = await Promise.all([
    supabase.rpc('physical_invitation_counts'),
    supabase.from('side_caps').select('physical_cap').eq('side', side).single(),
  ])
  if (countsResult.error || capResult.error) {
    // The guest write is the thing that matters; a failed count means a
    // missing warning, not a failed save.
    return []
  }

  const counts = (countsResult.data ?? []) as Array<{ side: string; used: number }>
  const used = Number(counts.find((row) => row.side === side)?.used ?? 0)
  const cap = capResult.data.physical_cap as number
  const decision = checkQuota({ cap, confirmedPax: used }, 1)
  if (!decision.overCap) return []
  return [
    `The ${side} side now has ${used + 1} of ${cap} printed invitations.`,
  ]
}

function revalidateGuestScreens() {
  revalidatePath('/guests')
  revalidatePath('/dashboard')
  revalidatePath('/waitlist')
}

export async function createGuest(formData: FormData): Promise<GuestFormResult> {
  const supabase = await getServerSupabase()
  const parsed = parseGuestForm(formData)
  if ('error' in parsed) return parsed

  const side = await sideOfInviter(supabase, parsed.inviterKey)
  if (!side) return { error: `"${parsed.inviterKey}" is not a known inviter.` }

  const flags = [
    ...(await quotaFlags(supabase, parsed.inviterKey, parsed.pax, parsed.invites, null)),
    ...(await physicalFlag(supabase, side, parsed.isPhysicalInvitation, false)),
  ]

  const guest = await insertGuest(supabase, {
    name: parsed.name,
    pax: parsed.pax,
    side,
    inviterKey: parsed.inviterKey,
    type: parsed.type,
    phone: parsed.phone,
    isVip: parsed.isVip,
    isPhysicalInvitation: parsed.isPhysicalInvitation,
    note: parsed.note,
  })
  await setGuestEvents(supabase, guest.id, parsed.invites)

  const profile = await getCurrentProfile()
  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.create',
      entityType: 'guest',
      entityId: guest.id,
      entityLabel: parsed.name,
      diff: buildDiff(null, snapshotFromParsed(parsed, side), GUEST_SNAPSHOT_FIELDS),
    })
  }

  revalidateGuestScreens()
  return { guestId: guest.id, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

export async function updateGuest(formData: FormData): Promise<GuestFormResult> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  if (!guestId) return { error: 'Guest is required.' }

  const parsed = parseGuestForm(formData)
  if ('error' in parsed) return parsed

  const side = await sideOfInviter(supabase, parsed.inviterKey)
  if (!side) return { error: `"${parsed.inviterKey}" is not a known inviter.` }

  const existing = await getGuest(supabase, guestId)
  const previous = {
    inviterKey: existing.inviter_key as string,
    pax: existing.pax as number,
    confirmedEvents: (
      (existing.guest_events ?? []) as Array<{ event: 'akad' | 'resepsi'; invite_status: string }>
    )
      .filter((row) => row.invite_status === 'confirmed')
      .map((row) => row.event),
  }

  const flags = [
    ...(await quotaFlags(supabase, parsed.inviterKey, parsed.pax, parsed.invites, previous)),
    ...(await physicalFlag(
      supabase,
      side,
      parsed.isPhysicalInvitation,
      existing.is_physical_invitation as boolean
    )),
  ]

  await updateGuestRepo(supabase, guestId, {
    name: parsed.name,
    pax: parsed.pax,
    side,
    inviterKey: parsed.inviterKey,
    type: parsed.type,
    phone: parsed.phone,
    isVip: parsed.isVip,
    isPhysicalInvitation: parsed.isPhysicalInvitation,
    note: parsed.note,
  })
  await setGuestEvents(supabase, guestId, parsed.invites)

  const profile = await getCurrentProfile()
  if (profile) {
    const diff = buildDiff(snapshotFromExisting(existing), snapshotFromParsed(parsed, side), GUEST_SNAPSHOT_FIELDS)
    if (Object.keys(diff).length > 0) {
      await insertAuditLog(supabase, {
        actorId: profile.userId,
        actorName: profile.fullName,
        actorRole: profile.role,
        action: 'guest.update',
        entityType: 'guest',
        entityId: guestId,
        entityLabel: parsed.name,
        diff,
      })
    }
  }

  revalidateGuestScreens()
  return { guestId, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

/**
 * Whether this guest sees the at-home photo series on their invitation.
 *
 * Superadmin only, twice over: checked here against the caller's own
 * profile, and enforced by guard_guests_candid in the database regardless of
 * what this code says. Audited as a guest.update with a one-field diff.
 */
export async function setGuestCandid(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') {
    return { error: 'Only a superadmin can change who sees the home photos.' }
  }
  const guestId = String(formData.get('guestId') ?? '')
  if (!guestId) return { error: 'Guest is required.' }
  const candid = formData.get('candid') === 'on' || formData.get('candid') === 'true'

  const supabase = await getServerSupabase()
  const existing = await getGuest(supabase, guestId)
  const before = Boolean(existing.candid)
  if (before === candid) return { ok: true }

  await setGuestCandidRepo(supabase, guestId, candid)
  await insertAuditLog(supabase, {
    actorId: profile.userId,
    actorName: profile.fullName,
    actorRole: profile.role,
    action: 'guest.update',
    entityType: 'guest',
    entityId: guestId,
    entityLabel: existing.name as string,
    diff: { candid: { old: before, new: candid } },
  })
  revalidateGuestScreens()
  return { ok: true }
}

export async function deleteGuest(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  if (!guestId) return { error: 'Guest is required.' }

  const profile = await getCurrentProfile()
  let existing
  try {
    existing = await getGuest(supabase, guestId)
  } catch (error) {
    console.error(
      `deleteGuest: guest ${guestId} not found or unreadable: ${error instanceof Error ? error.message : error}`
    )
    return { error: 'Guest not found.' }
  }

  await deleteGuestRepo(supabase, guestId)

  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.delete',
      entityType: 'guest',
      entityId: guestId,
      entityLabel: existing.name as string,
      diff: buildDiff(snapshotFromExisting(existing), null, GUEST_SNAPSHOT_FIELDS),
    })
  }

  revalidateGuestScreens()
  return { ok: true }
}

export async function updateGuestPhone(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  const { phone, warning } = normalizePhone(String(formData.get('phone') ?? ''))
  if (!guestId || !phone) {
    return { error: warning ?? 'Guest and phone are required.' }
  }
  await updateGuestPhoneRepo(supabase, guestId, phone)
  revalidatePath('/guests')
  revalidatePath('/dashboard')
  return { ok: true }
}

export type EditableField = 'phone' | 'note' | 'pax' | 'name' | 'akad' | 'resepsi' | 'language'

export type FieldUpdateResult =
  | { error: string }
  | { ok: true; field: EditableField; value: string | number | null; flags: string[] }

async function logFieldChange(
  supabase: SupabaseClient,
  profile: Awaited<ReturnType<typeof getCurrentProfile>>,
  guest: { id: string; name: string },
  // Not `EditableField`: the two event columns are logged under the same
  // `akad_invite_status` / `resepsi_invite_status` keys the dialog writes, so
  // one guest's history reads as one story regardless of which screen edited it.
  field: string,
  oldValue: unknown,
  newValue: unknown
) {
  if (!profile) return
  const diff = buildDiff({ [field]: oldValue }, { [field]: newValue }, [field])
  if (Object.keys(diff).length === 0) return
  await insertAuditLog(supabase, {
    actorId: profile.userId,
    actorName: profile.fullName,
    actorRole: profile.role,
    action: 'guest.update',
    entityType: 'guest',
    entityId: guest.id,
    entityLabel: guest.name,
    diff,
  })
}

/**
 * One field on one guest, for the inline edit mode on the guest table. Kept
 * separate from `updateGuest` on purpose: that action rewrites the whole row
 * from a form, which is the wrong shape for someone typing down a column of
 * phone numbers. The field name is checked against a whitelist here, never
 * passed through to the query as-is.
 */
export async function updateGuestField(formData: FormData): Promise<FieldUpdateResult> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  const field = String(formData.get('field') ?? '') as EditableField
  const raw = String(formData.get('value') ?? '')

  if (!guestId) return { error: 'Guest is required.' }

  const profile = await getCurrentProfile()
  let existing
  try {
    existing = await getGuest(supabase, guestId)
  } catch (error) {
    console.error(
      `updateGuestField: guest ${guestId} not found or unreadable: ${error instanceof Error ? error.message : error}`
    )
    return { error: 'Guest not found.' }
  }

  switch (field) {
    case 'phone': {
      const { phone, warning } = normalizePhone(raw)
      const { error } = await supabase.from('guests').update({ phone }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'phone', existing.phone, phone)
      revalidateGuestScreens()
      return { ok: true, field, value: phone, flags: warning ? [warning] : [] }
    }
    case 'language': {
      // Which language variant of a WhatsApp template this guest receives.
      // src/domain/language.ts only ever seeds it; this is the correction
      // path, and the couple are expected to walk the whole list.
      if (raw !== 'en' && raw !== 'id') {
        return { error: 'Language must be either English or Indonesian.' }
      }
      const { error } = await supabase.from('guests').update({ language: raw }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'language', existing.language, raw)
      revalidateGuestScreens()
      return { ok: true, field, value: raw, flags: [] }
    }
    case 'note': {
      const note = raw.trim() || null
      const { error } = await supabase.from('guests').update({ note }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'note', existing.note, note)
      revalidateGuestScreens()
      return { ok: true, field, value: note, flags: [] }
    }
    case 'name': {
      const name = raw.trim()
      if (!name) return { error: 'Name cannot be empty.' }
      const { error } = await supabase.from('guests').update({ name }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'name', existing.name, name)
      revalidateGuestScreens()
      return { ok: true, field, value: name, flags: [] }
    }
    case 'pax': {
      const pax = Number(raw)
      if (!Number.isInteger(pax) || pax <= 0) return { error: 'Pax must be a whole number above zero.' }

      // Pax moves capacity, so it gets the same warn-allow-flag treatment as
      // the dialog: measure against the list without this guest's old pax.
      const previous = {
        inviterKey: existing.inviter_key as string,
        pax: existing.pax as number,
        confirmedEvents: (
          (existing.guest_events ?? []) as Array<{ event: 'akad' | 'resepsi'; invite_status: string }>
        )
          .filter((row) => row.invite_status === 'confirmed')
          .map((row) => row.event),
      }
      const invites: EventInvite[] = previous.confirmedEvents.map((event) => ({
        event,
        inviteStatus: 'confirmed' as const,
      }))
      const flags = await quotaFlags(supabase, previous.inviterKey, pax, invites, previous)

      const { error } = await supabase.from('guests').update({ pax }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'pax', existing.pax, pax)
      revalidateGuestScreens()
      return { ok: true, field, value: pax, flags }
    }
    case 'akad':
    case 'resepsi': {
      const status = raw === 'confirmed' || raw === 'waitlisted' ? raw : 'none'
      const events = (existing.guest_events ?? []) as Array<{
        event: 'akad' | 'resepsi'
        invite_status: 'confirmed' | 'waitlisted'
      }>
      const statusOf = (event: 'akad' | 'resepsi') =>
        events.find((row) => row.event === event)?.invite_status ?? 'none'

      // Same invariant the dialog enforces: a guest with no event is a row
      // nobody can act on, not a guest.
      const other = field === 'akad' ? 'resepsi' : 'akad'
      if (status === 'none' && statusOf(other) === 'none') {
        return { error: 'A guest has to be invited to at least one event.' }
      }

      const previousStatus = statusOf(field)
      if (previousStatus === status) return { ok: true, field, value: status, flags: [] }

      // Only a move into `confirmed` can push an inviter over cap. Measured
      // against the list without this guest's existing seat at this event, so
      // waitlisted -> confirmed is not counted twice.
      const flags =
        status === 'confirmed'
          ? await quotaFlags(
              supabase,
              existing.inviter_key as string,
              existing.pax as number,
              [{ event: field, inviteStatus: 'confirmed' }],
              {
                inviterKey: existing.inviter_key as string,
                pax: existing.pax as number,
                confirmedEvents: previousStatus === 'confirmed' ? [field] : [],
              }
            )
          : []

      // One event only: `setGuestEvents` replaces exactly what it is handed,
      // so passing a single entry leaves the other event untouched.
      await setGuestEvents(supabase, guestId, [{ event: field, inviteStatus: status }])
      await logFieldChange(
        supabase,
        profile,
        existing,
        `${field}_invite_status`,
        previousStatus === 'none' ? null : previousStatus,
        status === 'none' ? null : status
      )
      revalidateGuestScreens()
      return { ok: true, field, value: status, flags }
    }
    default:
      return { error: `"${field}" is not an editable field.` }
  }
}

export type RsvpResult = { error: string } | { ok: true; flags: string[] }

/**
 * Record an answer on a guest's behalf, for one event.
 *
 * Admin and superadmin only, which the `guard_guest_events_rsvp_columns`
 * trigger also enforces. Checking here as well turns a raw Postgres exception
 * into a sentence, and keeps an inviter from seeing a control that would only
 * fail.
 *
 * The write shape is the project's usual one: load the invitation, let the
 * domain decide what the answer means, then persist. The domain owns the
 * pax-down-only rule; nothing about it is re-implemented here.
 */
export async function recordGuestRsvp(formData: FormData): Promise<RsvpResult> {
  const profile = await getCurrentProfile()
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    return { error: 'Only the couple and their admins can answer for a guest.' }
  }

  const guestId = String(formData.get('guestId') ?? '').trim()
  const event = String(formData.get('event') ?? '')
  const answer = String(formData.get('answer') ?? '')

  if (!guestId) return { error: 'Guest is required.' }
  if (event !== 'akad' && event !== 'resepsi') return { error: 'Unknown event.' }
  if (answer !== 'attending' && answer !== 'not_attending' && answer !== 'pending') {
    return { error: 'Pick an answer.' }
  }

  const supabaseForClear = await getServerSupabase()

  // Putting an answer back to "no answer" is a real need, not an edge case.
  // There is no bulk edit and no override at the door, so a mis-click on
  // "not coming" has to be reversible to something other than a guess. It
  // clears the responder trail too: nobody answered, so nobody should be
  // recorded as having answered.
  if (answer === 'pending') {
    const cleared = await clearRsvp(supabaseForClear, guestId, event)
    if ('error' in cleared) return { error: cleared.error }

    const nameForClear = await guestNameFor(supabaseForClear, guestId)
    await insertAuditLog(supabaseForClear, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.rsvp',
      entityType: 'guest_event',
      entityId: guestId,
      entityLabel: nameForClear ?? guestId,
      diff: { [`${event}_rsvp`]: { old: 'answered', new: 'pending' } },
    })

    revalidateGuestScreens()
    return { ok: true, flags: [] }
  }

  const raw = String(formData.get('paxConfirmed') ?? '').trim()
  // An empty box is "no answer given", not zero. The domain tells them to
  // supply one; silently reading it as 0 would refuse for the wrong reason.
  const paxConfirmed = raw === '' ? null : Number(raw)
  if (paxConfirmed !== null && Number.isNaN(paxConfirmed)) {
    return { error: 'How many of them are coming?' }
  }

  const supabase = await getServerSupabase()
  const invitations = await listGuestInvitations(supabase, guestId)
  const invitation = invitations.find((i) => i.event === event)

  const decision = decideRsvp({
    invitation: {
      event,
      // Absent row means no invitation to this event, which the domain refuses.
      inviteStatus: invitation?.inviteStatus ?? null,
      invitedPax: invitation?.invitedPax ?? 0,
    },
    answer,
    paxConfirmed,
  })

  if (!decision.allowed) return { error: decision.message }

  const written = await recordRsvp(supabase, guestId, {
    event: decision.event,
    status: decision.status,
    paxConfirmed: decision.paxConfirmed,
    respondedVia: 'admin_manual',
    respondedBy: profile.userId,
  })
  if ('error' in written) return { error: written.error }

  // Audited because this decides who gets through a door and nobody can
  // override that on the day. When a relative is refused in October, this is
  // the record of who answered for them.
  const guestName = await guestNameFor(supabase, guestId)
  await insertAuditLog(supabase, {
    actorId: profile.userId,
    actorName: profile.fullName,
    actorRole: profile.role,
    action: 'guest.rsvp',
    entityType: 'guest_event',
    entityId: guestId,
    entityLabel: guestName ?? guestId,
    diff: {
      [`${decision.event}_rsvp`]: {
        old: invitation?.rsvpStatus ?? null,
        new: decision.status,
      },
      ...(decision.status === 'attending'
        ? { [`${decision.event}_pax`]: { old: null, new: decision.paxConfirmed } }
        : {}),
    },
  })

  revalidateGuestScreens()
  return { ok: true, flags: decision.flags }
}

async function guestNameFor(supabase: SupabaseClient, guestId: string): Promise<string | null> {
  const { data } = await supabase.from('guests').select('name').eq('id', guestId).maybeSingle()
  return (data?.name as string | undefined) ?? null
}
