'use server'

import { revalidatePath } from 'next/cache'
import { classifyFailure, planWave, takeBatch, type WaveKind } from '@/domain/wave'
import { sendTemplate } from '../whatsapp/send'
import { getServerSupabase } from '../supabase/server-client'
import {
  assignBatch,
  claimForWave,
  loadWaveCandidates,
  markAttempt,
  recipientsReachedToday,
  readSetting,
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

/** Which setting holds the chosen template for each step. */
export const TEMPLATE_SETTING: Record<WaveKind, string> = {
  invite: 'template_invite',
  reminder: 'template_reminder',
  qr_checkin: 'template_qr_checkin',
}

/**
 * Only the invitation prints the RSVP deadline.
 *
 * The reminder carries quick-reply buttons and asks the guest to answer in the
 * chat, and the QR ticket goes out after the deadline has passed. Passing an
 * extra body parameter to a template that does not declare one is rejected by
 * Meta, so this is not merely untidy.
 */
const NEEDS_DEADLINE: Record<WaveKind, boolean> = {
  invite: true,
  reminder: false,
  qr_checkin: false,
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
  /** Send one batch. Unassigned guests are never swept up by this. */
  batch?: 1 | 2 | null
  limit?: number
}): Promise<SendResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can send to guests.' }
  if (!isKind(input.kind)) return { error: 'Unknown wave.' }

  const supabase = await getServerSupabase()

  const deadline = NEEDS_DEADLINE[input.kind] ? await readDeadline(supabase) : null
  if (NEEDS_DEADLINE[input.kind] && !deadline) {
    return { error: 'Set the RSVP deadline before sending: the invitation prints it.' }
  }

  const templateName = await readSetting(supabase, TEMPLATE_SETTING[input.kind])
  if (!templateName) {
    return { error: 'Choose which template this step sends before sending it.' }
  }

  const candidates = await loadWaveCandidates(supabase, input.kind)
  const chosen = input.guestIds?.length
    ? candidates.filter((c) => input.guestIds!.includes(c.guestId))
    : candidates

  // A hand-picked list is exactly who was picked; the batch filter is for the
  // "send the rest" path, where nobody named anyone.
  const plan = planWave(chosen, new Date(), input.guestIds?.length ? null : (input.batch ?? null))
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
      name: templateName,
      language: guest.language,
      // The invitation is {{1}} name, {{2}} deadline. The other two templates
      // take the name alone.
      bodyParams: deadline ? [guest.name, deadline] : [guest.name],
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


export type BatchResult = { error: string } | { ok: true; updated: number }

/** Put guests into a send batch, or clear them out of one. */
export async function setBatch(input: {
  guestIds: string[]
  batch: 1 | 2 | null
}): Promise<BatchResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can arrange the batches.' }
  if (input.batch !== null && input.batch !== 1 && input.batch !== 2) {
    return { error: 'A batch is 1, 2, or none.' }
  }

  const supabase = await getServerSupabase()
  const result = await assignBatch(supabase, input.guestIds, input.batch)
  if ('error' in result) return { error: result.error }

  revalidatePath('/messages')
  return { ok: true, updated: result.updated }
}

/** Point one step at a different approved template. */
export async function setStepTemplate(input: {
  kind: string
  templateName: string
}): Promise<SettingResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can change a template.' }
  if (!isKind(input.kind)) return { error: 'Unknown step.' }

  const name = input.templateName.trim()
  // Meta's own rule for template names, checked here so a typo is refused now
  // rather than at send time against 220 guests.
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return { error: 'A template name is lower case letters, numbers and underscores.' }
  }

  const supabase = await getServerSupabase()
  const written = await writeSetting(supabase, TEMPLATE_SETTING[input.kind], name, profile.userId)
  if ('error' in written) return { error: written.error }

  revalidatePath('/messages')
  return { ok: true }
}
