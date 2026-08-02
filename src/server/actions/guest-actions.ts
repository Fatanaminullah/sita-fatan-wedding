'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { insertGuest, updateGuestPhone as updateGuestPhoneRepo } from '../repositories/guests-repository'
import { insertGuestEvents } from '../repositories/guest-events-repository'
import { checkQuota } from '@/domain/quota'
import { loadInviterCapacity } from '../repositories/inviters-repository'

export async function createGuest(formData: FormData) {
  const supabase = await getServerSupabase()

  const name = String(formData.get('name') ?? '').trim()
  const pax = Number(formData.get('pax'))
  const side = String(formData.get('side') ?? '') as 'fatan' | 'sita'
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const type = String(formData.get('type') ?? '') as 'family' | 'friend'
  const phone = String(formData.get('phone') ?? '').trim() || null
  const isVip = formData.get('isVip') === 'on'
  const events = formData.getAll('events') as Array<'akad' | 'resepsi'>

  if (!name || !pax || !side || !inviterKey || !type) {
    return { error: 'Name, pax, side, inviter, and type are required.' }
  }

  // Load capacity and decide per event BEFORE the write, per the write-path
  // shape in docs/TECH_SPEC.md: decide, then persist regardless of the flag.
  const flags: string[] = []
  for (const event of events) {
    const state = await loadInviterCapacity(supabase, inviterKey, event)
    const decision = checkQuota(state, pax)
    if (decision.overCap) {
      flags.push(`${inviterKey} is now ${decision.overBy} pax over cap on ${event}.`)
    }
  }

  const guest = await insertGuest(supabase, { name, pax, side, inviterKey, type, phone, isVip })
  await insertGuestEvents(
    supabase,
    guest.id,
    events.map((event) => ({ event, inviteStatus: 'confirmed' as const }))
  )

  revalidatePath('/guests')
  return { guestId: guest.id, flags }
}

export async function updateGuestPhone(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  const phone = String(formData.get('phone') ?? '').trim()
  if (!guestId || !phone) {
    return { error: 'Guest and phone are required.' }
  }
  await updateGuestPhoneRepo(supabase, guestId, phone)
  revalidatePath('/guests')
  return { ok: true }
}
