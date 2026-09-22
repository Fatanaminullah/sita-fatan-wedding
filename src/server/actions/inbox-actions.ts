'use server'

import { revalidatePath } from 'next/cache'
import { replyState } from '@/domain/inbox'
import { getServerSupabase } from '../supabase/server-client'
import { insertOutboundMessage, lastInboundAt } from '../repositories/inbox-repository'
import { sendText } from '../whatsapp/send'
import { getCurrentProfile } from './auth-actions'

export type ReplyResult = { error: string } | { ok: true }

/** The longest a single WhatsApp text body may be. */
const MAX_BODY = 4096

/**
 * Send one free-form reply into an open service window.
 *
 * No audit_log entry: its `action` vocabulary is a closed CHECK constraint, and
 * wa_messages already records the body, who sent it and when, which is a
 * fuller account of a message than a field diff would be.
 */
export async function sendReply(formData: FormData): Promise<ReplyResult> {
  const profile = await getCurrentProfile()
  // RLS is the real boundary on wa_messages, but a silent zero-row insert
  // reads as "nothing happened" rather than "you may not do this".
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    return { error: 'Only the couple and their admins can reply to guests.' }
  }

  const waId = String(formData.get('waId') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const guestId = String(formData.get('guestId') ?? '').trim() || null

  if (!waId) return { error: 'No conversation selected.' }
  if (!body) return { error: 'Write something before sending.' }
  if (body.length > MAX_BODY) {
    return { error: `WhatsApp caps a message at ${MAX_BODY} characters. This one is ${body.length}.` }
  }

  const supabase = await getServerSupabase()

  // Checked here as well as by Meta, so an expired window is refused with an
  // explanation instead of costing a round trip that comes back 131047.
  const state = replyState(await lastInboundAt(supabase, waId), new Date())
  if (state.kind === 'never_written') {
    return { error: 'They have never messaged us, so there is no open window. Only a template can reach them.' }
  }
  if (state.kind === 'expired') {
    return { error: 'The 24 hour reply window closed. Only an approved template can reach them now.' }
  }

  const sent = await sendText(waId, body)
  if (!sent.ok) return { error: sent.error }

  try {
    await insertOutboundMessage(supabase, {
      waId,
      guestId,
      providerMessageId: sent.providerMessageId,
      body,
      sentBy: profile.userId,
    })
  } catch (error) {
    // The message is already on its way. Saying "failed" would be a lie that
    // invites a duplicate send, so the failure is reported as what it is.
    console.error('[inbox] reply sent but not recorded', error)
    return {
      error: 'The message was sent, but recording it failed. Do not send it again; refresh to check.',
    }
  }

  revalidatePath('/inbox')
  return { ok: true }
}
