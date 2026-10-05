'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import {
  deleteEnvelope,
  insertGift,
  issueGuestLabel,
  issueUnlistedLabel,
  recordEnvelopeAmount,
  type EnvelopeLabel,
  type GiftKind,
} from '../repositories/envelopes-repository'

const DOOR_ROLES: readonly string[] = ['usher', 'admin', 'superadmin']

export type LabelResult = { ok: true; label: EnvelopeLabel } | { error: string }
type Result = { ok: true } | { error: string }

/**
 * The label for a guest just let in. The database function is the boundary:
 * it refuses anyone not at a door and any guest not yet checked in, and a
 * reprint returns the same code.
 */
export async function printGuestLabel(guestId: string): Promise<LabelResult> {
  const profile = await getCurrentProfile()
  if (!profile || !DOOR_ROLES.includes(profile.role)) return { error: 'Only door staff can print envelope labels.' }
  try {
    return { ok: true, label: await issueGuestLabel(await getServerSupabase(), guestId) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The label could not be made. Try again.' }
  }
}

export async function printUnlistedLabel(name: string): Promise<LabelResult> {
  const profile = await getCurrentProfile()
  if (!profile || !DOOR_ROLES.includes(profile.role)) return { error: 'Only door staff can print envelope labels.' }
  try {
    return { ok: true, label: await issueUnlistedLabel(await getServerSupabase(), name) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The label could not be made. Try again.' }
  }
}

/** Amounts are the couple's alone; RLS says the same (envelopes_superadmin_all). */
async function requireCouple() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') return null
  return profile
}

async function run(work: (userId: string) => Promise<void>): Promise<Result> {
  const profile = await requireCouple()
  if (!profile) return { error: 'Only the couple can see and record gifts.' }
  try {
    await work(profile.userId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Something went wrong. Try again.' }
  }
  revalidatePath('/gifts')
  revalidatePath('/guests')
  return { ok: true }
}

export async function saveEnvelopeAmount(id: string, amount: number | null, note: string): Promise<Result> {
  if (amount !== null && (!Number.isInteger(amount) || amount < 0)) return { error: 'An amount is a whole number of rupiah.' }
  return run(async (userId) =>
    recordEnvelopeAmount(await getServerSupabase(), id, { amount, note: note.trim() || null, userId })
  )
}

export async function addGift(input: {
  kind: GiftKind
  guestId: string | null
  name: string
  amount: number | null
  item: string
  note: string
}): Promise<{ ok: true; code: string | null } | { error: string }> {
  const name = input.name.trim()
  const item = input.item.trim()
  if (!name) return { error: 'Say who it is from.' }
  if (!['envelope', 'transfer', 'item'].includes(input.kind)) return { error: 'Choose what kind of gift it is.' }
  if (input.kind === 'item' && !item) return { error: 'Say what the present is.' }
  if (input.kind === 'transfer' && input.amount === null) return { error: 'A transfer needs its amount.' }
  if (input.amount !== null && (!Number.isInteger(input.amount) || input.amount < 0)) {
    return { error: 'An amount is a whole number of rupiah.' }
  }
  let code: string | null = null
  const result = await run(async (userId) => {
    code = await insertGift(await getServerSupabase(), {
      kind: input.kind,
      guestId: input.guestId,
      name: name.slice(0, 80),
      amount: input.amount,
      item: input.kind === 'item' ? item.slice(0, 120) : null,
      note: input.note.trim() || null,
      userId,
    })
  })
  return 'error' in result ? result : { ok: true, code }
}

export async function removeEnvelope(id: string): Promise<Result> {
  return run(async () => deleteEnvelope(await getServerSupabase(), id))
}
