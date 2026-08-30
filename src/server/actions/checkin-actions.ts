'use server'

import { revalidatePath } from 'next/cache'
import { resolveScan, resolveSouvenirScan, type DoorGuest, type ScanOutcome } from '@/domain/checkin'
import { claimChannel, type WeddingEvent } from '@/domain/souvenir'
import { getServerSupabase } from '../supabase/server-client'
import {
  guestByToken,
  recordCheckIn,
  recordSouvenirClaim,
  removeCheckIn,
  removeSouvenirClaim,
  rosterForEvent,
} from '../repositories/checkin-repository'
import { getCurrentProfile } from './auth-actions'

/**
 * The door's write path.
 *
 * Every action here follows the project's write shape: load current state,
 * hand it to a domain function to decide what it means, then persist. The
 * domain never decides whether a write is *permitted* — RLS does that — only
 * what it means.
 */

const DOOR_ROLES: readonly string[] = ['usher', 'admin', 'superadmin']
const ADMIN_ROLES: readonly string[] = ['admin', 'superadmin']

async function requireDoor() {
  const profile = await getCurrentProfile()
  // RLS and the two SECURITY DEFINER functions are the real boundary. This
  // exists so a refusal reads as "you may not do this" rather than as an empty
  // screen or a raw Postgres exception.
  if (!profile || !DOOR_ROLES.includes(profile.role)) return null
  return profile
}

function isEvent(v: string): v is WeddingEvent {
  return v === 'akad' || v === 'resepsi'
}

/**
 * Why someone was not admitted, in words an usher can read out loud.
 *
 * Each refusal says what to do next, because "no" with no next step is what
 * makes a door jam.
 */
function refusal(name: string, outcome: ScanOutcome): string {
  switch (outcome) {
    case 'not_invited':
      return `${name} is not on the guest list for this event. If that is wrong, it has to be fixed in the guest list before they can be let in.`
    case 'waitlisted':
      return `${name} is still on the waiting list and was never sent a ticket. Moving them up in the guest list is what lets them in.`
    case 'declined':
      return `${name} is recorded as not coming, so no ticket was issued. That has to be changed in the guest list before they can be let in.`
    case 'no_rsvp':
      return `${name} has no RSVP recorded, so they were never confirmed. That has to be answered in the guest list before they can be let in.`
    case 'already_in':
      return `${name} is already checked in.`
    default:
      return `${name} cannot be checked in.`
  }
}

export type LookupResult =
  | { error: string }
  | { ok: true; guest: DoorGuest }
  | { ok: true; guest: null }

/** Resolve the ticket a QR just produced. */
export async function lookupByToken(token: string, event: string): Promise<LookupResult> {
  const profile = await requireDoor()
  if (!profile) return { error: 'Only door staff can look up a guest.' }
  if (!isEvent(event)) return { error: 'Pick which event this door is for.' }

  // A QR that decodes to something that is not a uuid is a QR from somewhere
  // else entirely — a parking ticket, a promo code. Say so rather than sending
  // it to Postgres to fail as a cast error.
  const trimmed = token.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { error: 'That code is not one of our tickets.' }
  }

  const supabase = await getServerSupabase()
  const guest = await guestByToken(supabase, trimmed, event)
  return { ok: true, guest }
}

export type RosterResult = { error: string } | { ok: true; guests: DoorGuest[] }

/**
 * Search the roster by name, for a ticket that will not scan.
 *
 * Returns the whole event roster when the query is empty, which is what the
 * Akad table renders.
 */
export async function searchRoster(query: string, event: string): Promise<RosterResult> {
  const profile = await requireDoor()
  if (!profile) return { error: 'Only door staff can search the guest list.' }
  if (!isEvent(event)) return { error: 'Pick which event this door is for.' }

  const supabase = await getServerSupabase()
  const guests = await rosterForEvent(supabase, event, query.trim() || null)
  return { ok: true, guests }
}

export type CheckInResult =
  | { error: string }
  | { ok: true; guest: DoorGuest; paxArrived: number }

/**
 * Admit a guest.
 *
 * Re-reads the guest rather than trusting what the client last saw: between
 * the scan and the tap, the other door may have admitted them. The domain
 * decides whether that re-read still permits admitting.
 */
export async function checkInGuest(input: {
  token?: string
  guestId?: string
  event: string
  paxArrived: number
}): Promise<CheckInResult> {
  const profile = await requireDoor()
  if (!profile) return { error: 'Only door staff can check a guest in.' }
  if (!isEvent(input.event)) return { error: 'Pick which event this door is for.' }
  if (!Number.isInteger(input.paxArrived) || input.paxArrived < 1) {
    return { error: 'How many people arrived? It has to be at least one.' }
  }

  const supabase = await getServerSupabase()

  const guest = input.token
    ? await guestByToken(supabase, input.token.trim(), input.event)
    : (await rosterForEvent(supabase, input.event)).find((g) => g.id === input.guestId) ?? null

  if (!guest) return { error: 'We could not find that guest.' }

  // The server is the enforcement, not the screen. A client that never
  // rendered the refusal, or one replaying an old request, is stopped here.
  const decision = resolveScan({ guest, event: input.event })
  if (!decision.canAdmit) {
    return { error: refusal(guest.name, decision.outcome) }
  }

  await recordCheckIn(supabase, {
    guestId: guest.id,
    event: input.event,
    paxArrived: input.paxArrived,
    userId: profile.userId,
  })

  revalidatePath('/checkin/list')
  return { ok: true, guest, paxArrived: input.paxArrived }
}

export type SouvenirResult = { error: string } | { ok: true; guest: DoorGuest }

/** Hand over a souvenir. */
export async function claimSouvenir(input: {
  token?: string
  guestId?: string
  event: string
}): Promise<SouvenirResult> {
  const profile = await requireDoor()
  if (!profile) return { error: 'Only door staff can hand out a souvenir.' }
  if (!isEvent(input.event)) return { error: 'Pick which event this station is for.' }

  const supabase = await getServerSupabase()

  const guest = input.token
    ? await guestByToken(supabase, input.token.trim(), input.event)
    : (await rosterForEvent(supabase, input.event)).find((g) => g.id === input.guestId) ?? null

  if (!guest) return { error: 'We could not find that guest.' }

  const decision = resolveSouvenirScan({ guest, event: input.event })
  if (!decision.canGive) {
    return {
      error:
        decision.outcome === 'not_invited'
          ? `${guest.name} is not on the guest list for this event.`
          : `${guest.name} already collected a souvenir.`,
    }
  }

  const result = await recordSouvenirClaim(supabase, {
    guestId: guest.id,
    via: decision.via ?? claimChannel(input.event),
    userId: profile.userId,
  })

  // Lost the race against the other station. The constraint is the guarantee;
  // this is what it looks like from the losing side.
  if (!result.ok) {
    return { error: `${guest.name} already collected a souvenir.` }
  }

  revalidatePath('/checkin/list')
  return { ok: true, guest }
}

export type UndoResult = { error: string } | { ok: true }

/**
 * Undo a mis-tap. Admin and superadmin only.
 *
 * Ushers hold insert and select on both day-of tables and nothing else, so
 * this would fail at RLS anyway; refusing here turns a silent zero-row delete
 * into a sentence.
 */
export async function undoCheckIn(guestId: string, event: string): Promise<UndoResult> {
  const profile = await getCurrentProfile()
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return { error: 'Only the couple and their admins can undo a check-in.' }
  }
  if (!isEvent(event)) return { error: 'Unknown event.' }

  const supabase = await getServerSupabase()
  await removeCheckIn(supabase, { guestId, event })
  revalidatePath('/checkin/list')
  return { ok: true }
}

/** Undo a souvenir handover. Admin and superadmin only. */
export async function undoSouvenir(guestId: string): Promise<UndoResult> {
  const profile = await getCurrentProfile()
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return { error: 'Only the couple and their admins can undo a souvenir.' }
  }

  const supabase = await getServerSupabase()
  await removeSouvenirClaim(supabase, guestId)
  revalidatePath('/checkin/list')
  return { ok: true }
}
