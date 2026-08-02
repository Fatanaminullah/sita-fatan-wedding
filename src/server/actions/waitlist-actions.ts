'use server'

import { getServerSupabase } from '../supabase/server-client'
import { listWaitlisted, promoteGuestEventStatus } from '../repositories/guest-events-repository'
import { loadInviterCapacity } from '../repositories/inviters-repository'
import { buildCascade, pickCascadeAnchor, type CascadeContext, type CascadeOffer } from '@/domain/waitlist'
import { checkPromotion } from '@/domain/waitlist'
import type { WaitlistedEntry } from '../repositories/guest-events-repository'

/**
 * Cascade-ordered waitlist pool for one event. `context` is the inviter/side a
 * freed slot belongs to. The admin waitlist screen is global and has no such
 * caller, so when it's omitted the anchor is derived from the pool: the guest
 * who is next in line. Returned alongside the offers so the screen can say
 * whose perspective the ordering is from.
 */
export async function getCascadeForEvent(
  event: 'akad' | 'resepsi',
  context?: CascadeContext
): Promise<{ anchor: CascadeContext | null; offers: CascadeOffer<WaitlistedEntry>[] }> {
  const supabase = await getServerSupabase()
  const pool = await listWaitlisted(supabase, event)
  const anchor = context ?? pickCascadeAnchor(pool)
  if (!anchor) return { anchor: null, offers: [] }
  return { anchor, offers: buildCascade(pool, anchor) }
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

  // No revalidatePath here on purpose: the promoted row's client component
  // needs to render its own "Promoted" + over-cap flag state for the admin
  // to actually see it. Revalidating immediately would refetch the waitlist
  // and drop the row (and its flag) before it could be read. The page has a
  // manual "Refresh" link for admins to see the updated list afterward.
  return {
    flags: decision.overCap
      ? [`${inviterKey} is now over cap on ${event} after this promotion.`]
      : [],
  }
}
