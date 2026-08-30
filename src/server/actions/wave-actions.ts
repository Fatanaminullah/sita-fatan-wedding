'use server'

import { revalidatePath } from 'next/cache'
import { classifyFailure, planWave, takeBatch, type WaveKind } from '@/domain/wave'
import { sendTemplate } from '../whatsapp/send'
import { getServerSupabase } from '../supabase/server-client'
import {
  claimForWave,
  loadWaveCandidates,
  markAttempt,
  recipientsReachedToday,
  releaseClaim,
  writeSetting,
  type WaveGuest,
} from '../repositories/wave-repository'
import { getCurrentProfile } from './auth-actions'

/**
 * Running a WhatsApp wave.
 *
 * The only code in this app that can put a message on a stranger's phone, so
 * it is written to be hard to fire by accident and safe to run twice.
 */

const TEMPLATE: Record<WaveKind, string> = {
  invite: 'wedding_invitation_v1',
  reminder: 'wedding_rsvp_reminder_v1',
  qr_checkin: 'wedding_qr_v1',
}

function isKind(value: string): value is WaveKind {
  return value === 'invite' || value === 'reminder' || value === 'qr_checkin'
}

async function requireSender() {
  const profile = await getCurrentProfile()
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) return null
  return profile
}

/** Midnight in Jakarta, which is the day boundary the retry rule uses. */
function startOfTodayJakarta(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  return `${today}T00:00:00+07:00`
}

export type SendResult =
  | { error: string }
  | {
      ok: true
      sent: number
      failed: number
      skipped: number
      /** Failures worth a human looking at, as opposed to the daily person cap. */
      problems: Array<{ name: string; message: string }>
    }

/**
 * Send one wave to a chosen set of guests, or to everyone still eligible.
 *
 * `guestIds` narrows it. That is how the small first wave works: the owner
 * picks a handful, reads one on a real phone, and only then releases the rest.
 * There is no default list of who those few are, on purpose — choosing them is
 * the point of the step.
 */
export async function sendWave(input: {
  kind: string
  guestIds?: string[]
  limit?: number
}): Promise<SendResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can send to guests.' }
  if (!isKind(input.kind)) return { error: 'Unknown wave.' }

  const supabase = await getServerSupabase()

  const deadline = await readDeadline(supabase)
  if (!deadline) {
    return { error: 'Set the RSVP deadline before sending: it is printed in every message.' }
  }

  const candidates = await loadWaveCandidates(supabase, input.kind)
  const chosen = input.guestIds?.length
    ? candidates.filter((c) => input.guestIds!.includes(c.guestId))
    : candidates

  const plan = planWave(chosen, new Date())
  const batch = takeBatch(plan, {
    limit: input.limit,
    alreadySentToday: await recipientsReachedToday(supabase, startOfTodayJakarta()),
  })

  if (batch.length === 0) {
    return { error: 'Nobody is eligible right now. Everyone chosen is already sent, waiting for tomorrow, or excluded.' }
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  const problems: Array<{ name: string; message: string }> = []

  for (const guest of batch as WaveGuest[]) {
    // Claim first. The insert is the lock: if a second operator is sending at
    // the same moment, exactly one of us wins and the other skips.
    const { claimed } = await claimForWave(supabase, guest.guestId, input.kind)
    if (!claimed) {
      skipped += 1
      continue
    }

    const result = await sendTemplate(guest.phone!, {
      name: TEMPLATE[input.kind],
      language: guest.language,
      bodyParams: [guest.name, deadline],
      // Only the slug. Meta appends it to the base registered with the
      // template, and the button's variable is numbered separately from the
      // body's.
      buttonParam: guest.slug,
    })

    if (result.ok) {
      await markAttempt(supabase, guest.guestId, input.kind, {
        ok: true,
        providerMessageId: result.providerMessageId,
      })
      sent += 1
      continue
    }

    await markAttempt(supabase, guest.guestId, input.kind, {
      ok: false,
      code: result.code,
      message: result.error,
    })
    failed += 1

    // The person cap is a delay, not a fault. Everything else is surfaced so
    // somebody looks at it rather than finding out in October.
    if (classifyFailure(result.code) === 'needs_attention') {
      problems.push({ name: guest.name, message: result.error })
    }
  }

  revalidatePath('/messages')
  return { ok: true, sent, failed, skipped, problems }
}

async function readDeadline(supabase: Awaited<ReturnType<typeof getServerSupabase>>) {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'rsvp_deadline')
    .maybeSingle()
  const raw = (data?.value as string | undefined) ?? null
  if (!raw) return null
  // Printed to a guest, so it is written the way a person writes a date.
  return new Date(`${raw}T00:00:00+07:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
}

export type SettingResult = { error: string } | { ok: true }

export async function updateRsvpDeadline(formData: FormData): Promise<SettingResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can change the deadline.' }

  const value = String(formData.get('rsvpDeadline') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: 'Pick a date.' }

  const supabase = await getServerSupabase()
  const written = await writeSetting(supabase, 'rsvp_deadline', value, profile.userId)
  if ('error' in written) return { error: written.error }

  revalidatePath('/messages')
  return { ok: true }
}

/** Undo a claim that never sent, so a crashed run does not strand anyone. */
export async function releaseStuckClaim(guestId: string, kind: string): Promise<SettingResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can do that.' }
  if (!isKind(kind)) return { error: 'Unknown wave.' }

  const supabase = await getServerSupabase()
  await releaseClaim(supabase, guestId, kind)
  revalidatePath('/messages')
  return { ok: true }
}
