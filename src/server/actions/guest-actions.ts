'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { insertGuest, updateGuestPhone as updateGuestPhoneRepo } from '../repositories/guests-repository'
import { insertGuestEvents } from '../repositories/guest-events-repository'

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

  const guest = await insertGuest(supabase, { name, pax, side, inviterKey, type, phone, isVip })
  await insertGuestEvents(
    supabase,
    guest.id,
    events.map((event) => ({ event, inviteStatus: 'confirmed' as const }))
  )

  revalidatePath('/guests')
  return { guestId: guest.id }
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
