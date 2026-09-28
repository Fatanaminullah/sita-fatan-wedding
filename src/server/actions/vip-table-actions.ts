'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import {
  deleteSeat,
  deleteVipTable,
  insertVipTable,
  listVipTables,
  updateVipTable,
  upsertSeat,
} from '../repositories/vip-tables-repository'

type Result = { ok: true } | { error: string }

/**
 * The couple's surface. RLS says the same (vip_tables_superadmin_all); this
 * is here so anyone else gets a sentence instead of a silent no-op.
 */
async function guard(): Promise<string | null> {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') return 'Only the couple can change the VIP tables.'
  return null
}

async function run(work: () => Promise<void>): Promise<Result> {
  const denied = await guard()
  if (denied) return { error: denied }
  try {
    await work()
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Something went wrong. Try again.' }
  }
  revalidatePath('/tables')
  return { ok: true }
}

const MAX_SEATS = 30

export async function addVipTable(): Promise<Result> {
  return run(async () => {
    const supabase = await getServerSupabase()
    const tables = await listVipTables(supabase)
    const position = tables.reduce((max, t) => Math.max(max, t.position), 0) + 1
    await insertVipTable(supabase, { name: `Table ${position}`, seats: 6, position })
  })
}

export async function renameVipTable(id: string, name: string): Promise<Result> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'A table needs a name.' }
  return run(async () => updateVipTable(await getServerSupabase(), id, { name: trimmed.slice(0, 60) }))
}

export async function setVipTableSeats(id: string, seats: number): Promise<Result> {
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return { error: `A table has between 1 and ${MAX_SEATS} seats.` }
  }
  return run(async () => updateVipTable(await getServerSupabase(), id, { seats }))
}

/** Its guests go back to unseated: the seating rows cascade. */
export async function removeVipTable(id: string): Promise<Result> {
  return run(async () => deleteVipTable(await getServerSupabase(), id))
}

export async function seatGuest(guestId: string, tableId: string): Promise<Result> {
  return run(async () => upsertSeat(await getServerSupabase(), guestId, tableId))
}

export async function unseatGuest(guestId: string): Promise<Result> {
  return run(async () => deleteSeat(await getServerSupabase(), guestId))
}
