'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { listWaitlisted, promoteGuestEventStatus } from '../repositories/guest-events-repository'
import { loadInviterCapacity } from '../repositories/inviters-repository'
import { buildCascade } from '@/domain/waitlist'
import { checkPromotion } from '@/domain/waitlist'

export async function getCascadeForEvent(inviterKey: string, side: 'fatan' | 'sita', event: 'akad' | 'resepsi') {
  const supabase = await getServerSupabase()
  const pool = await listWaitlisted(supabase, event)
  return buildCascade(pool, { inviterKey, side })
}

export async function promoteGuest(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestEventId = String(formData.get('guestEventId') ?? '')
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const event = String(formData.get('event') ?? '') as 'akad' | 'resepsi'

  const state = await loadInviterCapacity(supabase, inviterKey, event)
  const guestPax = Number(formData.get('guestPax'))
  const decision = checkPromotion(state.cap - state.confirmedPax, guestPax)

  await promoteGuestEventStatus(supabase, guestEventId)

  revalidatePath('/waitlist')
  return {
    flags: decision.overCap
      ? [`${inviterKey} is now over cap on ${event} after this promotion.`]
      : [],
  }
}
