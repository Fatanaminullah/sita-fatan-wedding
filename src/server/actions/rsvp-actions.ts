'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

/**
 * A guest answering their own invitation.
 *
 * Uses the publishable key, not the secret one. Everything that matters is
 * enforced inside `submit_rsvp`, which is SECURITY DEFINER and re-checks the
 * slug, the invitation and the headcount before it writes. CLAUDE.md's four
 * sanctioned uses of SUPABASE_SECRET_KEY stay at four.
 *
 * The function returns only true or false, and never says which of "no such
 * slug", "not invited to that event" or "more people than invited" it was, so
 * this route cannot be used to learn anything about a guest list.
 */

export type RsvpSubmitResult = { error: string } | { ok: true }

export async function submitGuestRsvp(input: {
  slug: string
  event: 'akad' | 'resepsi'
  attending: boolean
  pax: number | null
}): Promise<RsvpSubmitResult> {
  const slug = input.slug.trim()
  if (!slug) return { error: 'Something went wrong. Please reopen your invitation link.' }
  if (input.event !== 'akad' && input.event !== 'resepsi') {
    return { error: 'Something went wrong. Please reopen your invitation link.' }
  }
  if (input.attending && (!Number.isInteger(input.pax) || (input.pax ?? 0) < 1)) {
    return { error: 'Please choose how many of you are coming.' }
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await db.rpc('submit_rsvp', {
    p_slug: slug,
    p_event: input.event,
    p_attending: input.attending,
    p_pax: input.attending ? input.pax : null,
  })

  if (error) {
    return { error: 'We could not save that just now. Please try again in a moment.' }
  }
  if (data !== true) {
    // The function refuses without saying why, so the guest gets the one
    // message that is true in every case and tells them what to do.
    return {
      error:
        'We could not save that. If you are bringing a different number of people, please let us know directly.',
    }
  }

  revalidatePath(`/to/${slug}`)
  return { ok: true }
}
