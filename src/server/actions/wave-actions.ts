'use server'

import { revalidatePath } from 'next/cache'
import {
  classifyFailure,
  isBatchNumber,
  DAILY_RECIPIENT_CAP,
  planWave,
  takeBatch,
  ticketReadiness,
  type BatchNumber,
  type WaveKind,
} from '@/domain/wave'
import { isFetchableByMeta, renderTemplateBody } from '@/domain/whatsapp'
import { NO as CHAT_NO, YES as CHAT_YES } from '@/domain/conversation'
import { sendTemplate } from '../whatsapp/send'
import { startConversation } from '../whatsapp/conversation'
import { listTemplates } from '../whatsapp/templates'
import { getServerSupabase } from '../supabase/server-client'
import {
  assignBatch,
  claimForWave,
  loadWaveCandidates,
  markAttempt,
  recipientsReachedToday,
  recordSendAttempt,
  readSetting,
  releaseClaim,
  writeSetting,
  type WaveGuest,
} from '../repositories/wave-repository'
import { insertOutboundMessage } from '../repositories/inbox-repository'
import { getCurrentProfile } from './auth-actions'

/**
 * Running a WhatsApp wave.
 *
 * The only code in this app that can put a message on a stranger's phone, so
 * it is written to be hard to fire by accident and safe to run twice.
 */

/** Which setting holds the chosen template for each step. */
const TEMPLATE_SETTING: Record<WaveKind, string> = {
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
/**
 * Which steps print the RSVP deadline.
 *
 * The reminder does, which was wrong here until the approved template was
 * read: its body is "Please reply by {{rsvp_deadline}}. If we do not hear from
 * you, we may need to offer your place to someone on our waiting list."
 * Passing fewer parameters than a template declares is rejected, so the whole
 * reminder wave would have failed.
 *
 * The ticket does not. It goes out after the deadline has passed and its body
 * takes {{name}} alone.
 */
const NEEDS_DEADLINE: Record<WaveKind, boolean> = {
  invite: true,
  reminder: true,
  qr_checkin: false,
}

/**
 * Which steps print how many people the ticket admits.
 *
 * Only the ticket. `wedding_qr_ticket_v1` was approved with a second variable,
 * `{{pax}}`, printed as "👥 : {{pax}} Pax" beside the date and the dress code.
 * A template is rejected outright when it is sent fewer parameters than it
 * declares, so leaving this out would have failed every ticket in the wave at
 * once, on the one date in this project that cannot move.
 */
const NEEDS_PAX: Record<WaveKind, boolean> = {
  invite: false,
  reminder: false,
  qr_checkin: true,
}

/**
 * The payloads attached to a template's quick-reply buttons, in approved order.
 *
 * The reminder's two buttons are "Yes, I will attend" and "Sorry, I cannot".
 * Without these the tap comes back as those words and nothing else, which the
 * conversation treats as typed text and refuses to act on — so every reply to
 * the reminder would be silently ignored.
 */
const QUICK_REPLIES: Partial<Record<WaveKind, string[]>> = {
  reminder: [CHAT_YES, CHAT_NO],
}

/**
 * Which steps send a picture, when Meta cannot be asked.
 *
 * The invitation and the ticket carry an image header; the reminder is body,
 * footer and two quick replies, with no header at all. Attaching a header to it
 * anyway is a parameter the template never declared, and Meta answers 132018,
 * "There's an issue with the parameters in your template" — which is what
 * happened to the first real reminder.
 *
 * The live template from `listTemplates` is the authority and is used whenever
 * it is available. This is the fallback for when that call fails, and it errs
 * toward what each approved template actually declares today.
 */
const SENDS_HEADER_IMAGE: Record<WaveKind, boolean> = {
  invite: true,
  reminder: false,
  qr_checkin: true,
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
  batch?: BatchNumber | null
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

  // What Meta actually holds, not what anybody assumed. A template's
  // variables, its languages and whether it wants a header are facts about
  // the approved thing, and getting any of them wrong fails every guest in the
  // wave at once rather than one of them.
  const approved = await listTemplates()
  const template = approved.ok ? approved.templates.find((t) => t.name === templateName) : undefined

  if (approved.ok && !template) {
    return { error: `WhatsApp has no template called "${templateName}". Choose one that exists.` }
  }
  if (template && template.status.toUpperCase() !== 'APPROVED') {
    return { error: `"${templateName}" is ${template.status.toLowerCase()} at WhatsApp, so nothing can be sent with it yet.` }
  }

  // The picture at the top of the invitation. Defaults to the site's own
  // rich-link image, which is the graphic already used wherever this wedding
  // is shown as a link, so the message and the preview match. The setting
  // overrides it when the couple want something else.
  const headerImage =
    input.kind === 'qr_checkin'
      ? null
      : (await readSetting(supabase, 'invite_header_image')) ||
        (process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/opengraph-image.png`
          : null)

  if (template?.hasImageHeader && input.kind !== 'qr_checkin' && !headerImage) {
    return {
      error:
        `"${templateName}" has an image header, so every message needs a picture. Set NEXT_PUBLIC_SITE_URL, or a picture of your own, before sending.`,
    }
  }

  // What this run will actually attach. A template without a header must be
  // sent without one, or every message in the wave is rejected as a parameter
  // mismatch.
  const wantsHeaderImage = template ? template.hasImageHeader : SENDS_HEADER_IMAGE[input.kind]

  // WhatsApp fetches the picture itself, from its own servers. A link that only
  // resolves here is accepted by the send API and then fails against every
  // recipient with "Media upload error", after the messages have been counted
  // against the day's cap. Refuse it while it is still one error on a screen.
  if (wantsHeaderImage && headerImage && !isFetchableByMeta(headerImage)) {
    return {
      error:
        `WhatsApp fetches the header picture from its own servers, and it cannot reach ${headerImage}. Point "invite_header_image" at a public https address, or run this where NEXT_PUBLIC_SITE_URL is the live site.`,
    }
  }

  const all = await loadWaveCandidates(supabase, input.kind)

  /*
   * The reminder exists to chase the quiet. Two things disqualify a guest.
   *
   * They have already replied: reminding them says we lost their answer.
   *
   * They were never invited: silence from somebody who was never asked is not
   * silence. The reminder's body asks them to reply by the deadline and warns
   * that their place may go to the waiting list, which is incoherent sent to
   * a guest who has heard nothing about the wedding at all. A failed
   * invitation counts as never invited, which is the case that matters: those
   * guests have received nothing.
   *
   * Enforced here and not only on the screen, because `guestIds` comes from
   * the caller.
   */
  let candidates = all
  if (input.kind === 'reminder') {
    const invites = await loadWaveCandidates(supabase, 'invite')
    const invited = new Set(invites.filter((c) => c.sentAt !== null).map((c) => c.guestId))
    candidates = all.filter((c) => !c.answered && invited.has(c.guestId))
  }

  // The ticket is the moment that separates getting in from being turned away,
  // and the door has no override on the day. A guest still unanswered when
  // this goes out receives nothing, and finding that out on 10 October is too
  // late for anybody to fix. So the wave refuses to run early.
  if (input.kind === 'qr_checkin') {
    // Meta fetches the QR from a URL, so without a public address for this
    // site the message would go out with an empty image header: a ticket with
    // no ticket on it, delivered to everyone at once.
    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      return {
        error:
          'Set NEXT_PUBLIC_SITE_URL before sending tickets. WhatsApp fetches each QR from this site, and without an address every ticket would arrive blank.',
      }
    }
    // A local address passes the check above and then fails at Meta for every
    // ticket, which on D-7 is the worst possible time to discover it.
    if (!isFetchableByMeta(`${process.env.NEXT_PUBLIC_SITE_URL}/qr/test.png`)) {
      return {
        error: `WhatsApp fetches each QR from ${process.env.NEXT_PUBLIC_SITE_URL}, and it cannot reach that address. Tickets can only be sent from the live site.`,
      }
    }

    // Unanswered guests no longer block this. They are already outside the
    // ticket's audience, so refusing the wave withheld tickets from the people
    // who did answer without helping the ones who did not. The screen names
    // them instead. The only thing left to refuse is an empty send.
    const readiness = ticketReadiness(
      candidates.map((c) => ({ answered: c.answered, attending: c.attending }))
    )
    if (!readiness.canSend) {
      return { error: 'Nobody has said they are coming, so there are no tickets to send.' }
    }
  }
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

  const ticketBase = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  // Read once, out here: inside a closure TypeScript no longer knows the kind
  // has been narrowed to a WaveKind.
  const wantsPax = NEEDS_PAX[input.kind]

  /**
   * The sentence to file in the guest's thread.
   *
   * Meta holds the approved body; we hold the parameters. When the template
   * list could not be fetched there is no body to fill in, so the thread gets
   * an honest placeholder rather than a fabricated message: the transcript may
   * be incomplete, it may never be wrong.
   */
  function transcriptBody(guest: WaveGuest, language: string): string {
    const approved = template?.bodyByLanguage[language] ?? null
    if (!approved) return `[${templateName}]`
    return renderTemplateBody(approved, {
      named: {
        name: guest.name,
        ...(deadline ? { rsvp_deadline: deadline } : {}),
        ...(wantsPax ? { pax: String(guest.confirmedPax) } : {}),
      },
    })
  }

  for (const guest of batch as WaveGuest[]) {
    // The ticket goes only to somebody actually coming. planWave knows about
    // invitations, not answers, so this is the QR wave's own filter.
    if (input.kind === 'qr_checkin' && !guest.attending) {
      skipped += 1
      continue
    }

    // Claim first. The insert is the lock: if a second operator is sending at
    // the same moment, exactly one of us wins and the other skips.
    const { claimed } = await claimForWave(supabase, guest.guestId, input.kind)
    if (!claimed) {
      skipped += 1
      continue
    }

    // A template is approved per language. Sending in one it does not have is
    // rejected, so a guest whose language is missing gets the language that
    // exists rather than nothing at all.
    const language =
      template && template.languages.length > 0
        ? template.languages.includes(guest.language)
          ? guest.language
          : (template.languages[0] as 'en' | 'id')
        : guest.language

    const result = await sendTemplate(guest.phone!, {
      name: templateName,
      language,
      // The real invitation is written with named variables, {{name}} and
      // {{rsvp_deadline}}, not positions. Meta rejects positional parameters
      // sent to a named template, so this is not interchangeable.
      bodyParams: [],
      namedParams: {
        name: guest.name,
        ...(deadline ? { rsvp_deadline: deadline } : {}),
        // The number the door will admit, printed on the ticket itself.
        ...(wantsPax ? { pax: String(guest.confirmedPax) } : {}),
      },
      // Only the slug. Meta appends it to the base registered with the
      // template, and the button's variable is numbered separately from the
      // body's. The ticket carries no link at all: a QR message with an invite
      // button would put both credentials in one forwardable message.
      // The template registers https://www.sitafatan.wedding/{{1}}, so the
      // variable carries `to/<slug>`, not the slug alone. Passing the slug
      // would send every guest to a 404 and look perfectly correct doing it.
      // Only the invitation has a link button. The reminder answers in the
      // chat and the ticket carries no link at all, because a QR message with
      // an invite button would put both credentials in one forwardable
      // message.
      buttonParam: input.kind === 'invite' ? `to/${guest.slug}` : null,
      quickReplyPayloads: QUICK_REPLIES[input.kind] ?? null,
      // The entry token, drawn. Meta fetches this URL itself, which is why it
      // has to be publicly reachable.
      headerImageUrl: !wantsHeaderImage
        ? null
        : input.kind === 'qr_checkin' && ticketBase
          ? `${ticketBase}/api/qr/${guest.token}.png`
          : headerImage,
    })

    if (result.ok) {
      await markAttempt(supabase, guest.guestId, input.kind, {
        ok: true,
        providerMessageId: result.providerMessageId,
      })
      // Into the thread as well as the ledger. wa_sends says a wave reached
      // this guest; the inbox has to show what they were actually sent, or
      // their replies sit under a question nobody appears to have asked.
      //
      // Never allowed to fail the send: the message is already on their phone
      // and there is nothing to undo. A missing transcript line is worth a log
      // and not a reported failure.
      try {
        await insertOutboundMessage(supabase, {
          waId: guest.phone!,
          guestId: guest.guestId,
          providerMessageId: result.providerMessageId,
          type: 'template',
          templateName,
          body: transcriptBody(guest, language),
          sentBy: profile.userId,
        })
      } catch (error) {
        console.error('[wave] sent, but could not write it into the inbox thread', error)
      }
      // Current state on wa_sends, the fact that it happened here. A later
      // retry rewrites the row above; this line survives it.
      await recordSendAttempt(supabase, {
        guestId: guest.guestId,
        kind: input.kind,
        outcome: 'accepted',
        providerMessageId: result.providerMessageId,
        actorId: profile.userId,
      })
      sent += 1
      continue
    }

    await markAttempt(supabase, guest.guestId, input.kind, {
      ok: false,
      code: result.code,
      message: result.error,
    })
    await recordSendAttempt(supabase, {
      guestId: guest.guestId,
      kind: input.kind,
      outcome: 'rejected',
      errorCode: result.code === null ? null : String(result.code),
      errorMessage: result.error,
      actorId: profile.userId,
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
  batch: BatchNumber | null
}): Promise<BatchResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can arrange the batches.' }
  if (input.batch !== null && !isBatchNumber(input.batch)) {
    return { error: 'A batch is 1 to 6, or none.' }
  }

  const supabase = await getServerSupabase()
  const result = await assignBatch(supabase, input.guestIds, input.batch)
  if ('error' in result) return { error: result.error }

  // Both screens read these rows: /messages for the step counts, /batches for
  // the ledger and every row's own pill. Revalidating only one left the screen
  // that did the assigning showing the state from before it.
  revalidatePath('/messages')
  revalidatePath('/batches')
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

/**
 * Meta's own sample template, kept as the one thing that can be sent when a
 * marketing wave cannot.
 *
 * It is UTILITY, not MARKETING, so it does not spend the per-person marketing
 * allowance and is not refused by 131049. That is the whole point of it here:
 * when the invitation comes back capped for three guests, this proves whether
 * the number, the token, the phone id and the webhook are all still working,
 * or whether the cap was only ever the messenger.
 *
 * Approved as `en_US`, not `en`. The approved list decides the language code;
 * assuming it here is how a send fails for a reason that has nothing to do
 * with what is being tested.
 */
const UTILITY_TEST_TEMPLATE = '3p_direct_integration_test_template'

export type UtilityTestResult =
  | { error: string }
  | { ok: true; sent: number; failed: number; problems: Array<{ name: string; message: string }> }

/**
 * Send the utility test template to guests chosen by hand.
 *
 * Deliberately outside the wave machinery. It writes nothing to wa_sends and
 * nothing to wa_send_attempts, takes no claim and respects no batch: a test is
 * not a step, and a guest who received this has not been invited to anything.
 * Recording it as a send would mark them done and quietly withhold their real
 * invitation.
 *
 * It does write the transcript, because a message that reached a real phone
 * belongs in that person's thread whatever the reason for it.
 *
 * The daily recipient cap is still real, and this spends it like any other
 * send, so the count is checked before anything goes out.
 */
export async function sendUtilityTest(input: {
  guestIds: string[]
}): Promise<UtilityTestResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can send to guests.' }
  if (!input.guestIds?.length) return { error: 'Choose who to send the test to first.' }

  const approved = await listTemplates()
  if (!approved.ok) {
    return { error: `Cannot check the template with WhatsApp: ${approved.error}` }
  }
  const template = approved.templates.find((t) => t.name === UTILITY_TEST_TEMPLATE)
  if (!template) {
    return { error: `WhatsApp has no template called "${UTILITY_TEST_TEMPLATE}".` }
  }
  if (template.status.toUpperCase() !== 'APPROVED') {
    return { error: `"${UTILITY_TEST_TEMPLATE}" is ${template.status.toLowerCase()} at WhatsApp.` }
  }
  // Whatever Meta actually approved it as, which for the sample is `en_US`.
  const language = template.languages[0]
  if (!language) {
    return { error: `"${UTILITY_TEST_TEMPLATE}" has no approved language variant.` }
  }

  const supabase = await getServerSupabase()
  const everyone = await loadWaveCandidates(supabase, 'invite')
  const chosen = everyone.filter((g) => input.guestIds.includes(g.guestId) && g.phone)
  if (chosen.length === 0) {
    return { error: 'None of the chosen guests has a phone number, so there is nobody to reach.' }
  }

  const reached = await recipientsReachedToday(supabase, startOfTodayJakarta())
  if (reached + chosen.length > DAILY_RECIPIENT_CAP) {
    return {
      error: `The daily cap is ${DAILY_RECIPIENT_CAP} numbers and ${reached} have been reached today. Sending ${chosen.length} more would go past it.`,
    }
  }

  let sent = 0
  let failed = 0
  const problems: Array<{ name: string; message: string }> = []

  for (const guest of chosen) {
    const result = await sendTemplate(guest.phone!, {
      name: UTILITY_TEST_TEMPLATE,
      language,
      // The sample declares no variables at all. Sending one would be rejected.
      bodyParams: [],
      namedParams: null,
      buttonParam: null,
      quickReplyPayloads: null,
      headerImageUrl: null,
    })

    if (!result.ok) {
      failed += 1
      problems.push({ name: guest.name, message: result.error })
      continue
    }

    sent += 1
    try {
      await insertOutboundMessage(supabase, {
        waId: guest.phone!,
        guestId: guest.guestId,
        providerMessageId: result.providerMessageId,
        type: 'template',
        templateName: UTILITY_TEST_TEMPLATE,
        body: template.bodyByLanguage[language] ?? `[${UTILITY_TEST_TEMPLATE}]`,
        sentBy: profile.userId,
      })
    } catch (error) {
      console.error('[test] sent, but could not write it into the inbox thread', error)
    }
  }

  revalidatePath('/messages')
  revalidatePath('/inbox')
  return { ok: true, sent, failed, problems }
}

export type StartChatResult = { error: string } | { ok: true }

/**
 * Open the RSVP conversation with one guest, by hand.
 *
 * This is how the whole chat flow is testable before Meta approves the
 * reminder template. Open a 24 hour window with the sample integration
 * template, then press this: it sends the very buttons the reminder will
 * carry, and a tap takes the same code path a real one will.
 *
 * Only works while that window is open — a free-form send outside it is
 * refused by WhatsApp, and the error says so.
 */
export async function startRsvpChat(phone: string): Promise<StartChatResult> {
  const profile = await requireSender()
  if (!profile) return { error: 'Only the couple and their admins can message a guest.' }

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return { error: 'That does not look like a phone number.' }

  const result = await startConversation(digits)
  if ('error' in result) return result

  revalidatePath('/messages')
  return { ok: true }
}
