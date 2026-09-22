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

export type RsvpAnswerInput = {
  event: 'akad' | 'resepsi'
  attending: boolean
  pax: number | null
}

export type RsvpSubmitResult = { error: string } | { ok: true; saved: number }

/**
 * Submit every event at once.
 *
 * A guest invited to both answers both and presses one button, so the reply
 * arrives as one act rather than two half-answers that could be interrupted
 * between them.
 */
export async function submitGuestRsvp(input: {
  slug: string
  answers: RsvpAnswerInput[]
}): Promise<RsvpSubmitResult> {
  const slug = input.slug.trim()
  if (!slug) return { error: 'Something went wrong. Please reopen your invitation link.' }
  if (input.answers.length === 0) {
    return { error: 'Please choose an answer first.' }
  }

  for (const answer of input.answers) {
    if (answer.event !== 'akad' && answer.event !== 'resepsi') {
      return { error: 'Something went wrong. Please reopen your invitation link.' }
    }
    if (answer.attending && (!Number.isInteger(answer.pax) || (answer.pax ?? 0) < 1)) {
      return { error: 'Please choose how many of you are coming.' }
    }
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )

  let saved = 0

  for (const answer of input.answers) {
    const { data, error } = await db.rpc('submit_rsvp', {
      p_slug: slug,
      p_event: answer.event,
      p_attending: answer.attending,
      p_pax: answer.attending ? answer.pax : null,
    })

    if (error) {
      // Says how far it got, because a guest who answered both events and
      // sees a bare failure has no idea whether half of it landed.
      return {
        error:
          saved > 0
            ? 'Part of your reply was saved, but not all of it. Please try again.'
            : 'We could not save that just now. Please try again in a moment.',
      }
    }
    if (data !== true) {
      return {
        error:
          'We could not save that. If you are bringing a different number of people, please let us know directly.',
      }
    }
    saved += 1
  }

  revalidatePath(`/to/${slug}`)
  return { ok: true, saved }
}
