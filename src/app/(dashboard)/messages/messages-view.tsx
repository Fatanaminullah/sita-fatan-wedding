'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Layers, Loader2, ScrollText, Send, Users } from 'lucide-react'
import { BATCH_NUMBERS, type BatchNumber, type WaveKind } from '@/domain/wave'
import type { ApprovedTemplate } from '@/server/whatsapp/templates'
import { sendWave, setStepTemplate, updateRsvpDeadline } from '@/server/actions/wave-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The send console.
 *
 * Three steps in the order they happen, so the shape of the whole run is
 * visible from the first screen rather than assembled from memory.
 *
 * Deliberately slow. This is the only screen in the app that reaches a real
 * phone, and none of its mistakes can be taken back. Two rules follow from
 * that and are not negotiable here:
 *
 *   Nothing sends to a number the operator has not seen. Every step lists its
 *   recipients by name before it will send to them.
 *
 *   The number on the button is the number that goes out. The daily cap used
 *   to truncate a run silently, so a button reading 300 sent 250 and the
 *   difference surfaced only afterwards.
 */

export type StepGuest = {
  guestId: string
  name: string
  batch: BatchNumber | null
}

export type StepExclusion = {
  guestId: string
  name: string
  /** Already in words, decided on the server. */
  reason: string
}

export type StepSummary = {
  kind: WaveKind
  title: string
  description: string
  /** Only the invitation splits by batch. See the comment in page.tsx. */
  usesBatches: boolean
  templateName: string | null
  sent: number
  eligible: StepGuest[]
  excluded: StepExclusion[]
  waitingForTomorrow: number
  sharingANumber: number
  /** Ticket step only: named, because these people get no ticket. */
  unanswered: StepGuest[]
  blockedReason: string | null
}

export function MessagesView({
  steps,
  deadline,
  templates,
  templatesError,
  provider,
  capRemaining,
  reachedToday,
  distinctRecipients,
  sharingANumber,
  noPhone,
  waitlisted,
}: {
  steps: StepSummary[]
  deadline: string | null
  templates: ApprovedTemplate[]
  templatesError: string | null
  provider: string
  capRemaining: number
  reachedToday: number
  distinctRecipients: number
  sharingANumber: number
  noPhone: number
  waitlisted: number
}) {
  /*
   * Which step failed, not merely that something did.
   *
   * The message used to render once at the foot of the page, below three step
   * cards, a reach summary and the deadline form. Press send at the top of a
   * long page and the explanation appears off-screen, which is indistinguishable
   * from the button doing nothing at all.
   */
  const router = useRouter()
  const [error, setError] = useState<{ kind: WaveKind; message: string } | null>(null)
  /** What is in flight, so a run of 200 messages is not a silent screen. */
  const [sending, setSending] = useState<{ title: string; count: number } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Three steps, in order. Nothing sends on its own.
          </p>
        </div>
        <Button render={<Link href="/messages/log" />} variant="outline" size="sm" className="gap-1.5">
          <ScrollText className="size-3.5" aria-hidden="true" />
          Message log
        </Button>
      </div>

      {/* An operator should never have to guess whether this reaches real
          people. The provider defaults to `fake` so a local run cannot. */}
      {provider !== 'meta' ? (
        <p className="rounded-lg border bg-secondary px-3 py-2 text-sm">
          Practice mode. Messages are written down but never leave the machine.
        </p>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Live. Anything sent from this screen reaches a real phone.
        </p>
      )}

      {/* The cap is the constraint that shapes every run, so it is stated once
          at the top rather than discovered as a shortfall in each step. */}
      <p className="text-sm text-muted-foreground">
        WhatsApp allows <span className="font-mono tabular-nums">250</span> people a day on this
        account. <span className="font-mono tabular-nums">{reachedToday}</span> reached so far
        today, so <span className="font-mono tabular-nums">{capRemaining}</span> left before
        midnight in Jakarta.
      </p>

      {/* A wave sends one message per guest, one after another, so a run can
          take minutes. Without this the screen looks like nothing happened and
          the second press sends everything twice. */}
      {sending ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          Sending {sending.title.toLowerCase()} to{' '}
          <span className="font-mono tabular-nums">{sending.count}</span> guests. Leave this tab
          open until it finishes.
        </p>
      ) : null}

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <Step
            key={step.kind}
            index={i + 1}
            step={step}
            templates={templates}
            templatesError={templatesError}
            capRemaining={capRemaining}
            pending={pending}
            error={error?.kind === step.kind ? error.message : null}
            onSend={(guestIds, batch, label) =>
              startTransition(async () => {
                setError(null)
                setSending({ title: label, count: guestIds.length })
                try {
                  const result = await sendWave({ kind: step.kind, guestIds, batch })
                  if ('error' in result) {
                    setError({ kind: step.kind, message: result.error })
                    return
                  }
                  // Straight to the log, which is the durable record. The old
                  // outcome card sat in this component's state at the foot of a
                  // long page: invisible from the button that caused it, and
                  // gone on the next navigation. Every guest worth looking at
                  // is already a row in the log, failures first.
                  router.push(
                    `/messages/log?sent=${result.sent}&failed=${result.failed}&skipped=${result.skipped}`
                  )
                } finally {
                  setSending(null)
                }
              })
            }
            onTemplate={(templateName) =>
              startTransition(async () => {
                setError(null)
                const result = await setStepTemplate({ kind: step.kind, templateName })
                if ('error' in result) setError({ kind: step.kind, message: result.error })
              })
            }
          />
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who the invitation can reach</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Distinct phone numbers" value={distinctRecipients} />
          <Row label="No phone number at all" value={noPhone} muted />
          <Row label="Waiting list, never messaged until promoted" value={waitlisted} muted />
          {sharingANumber > 0 ? (
            <p className="flex items-start gap-2 pt-1 text-[#A85A04] dark:text-[#FBBF24]">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {sharingANumber} guests share a phone with another guest. One of each pair goes per
                run: two messages to one person in a day is exactly WhatsApp&rsquo;s limit.
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The RSVP deadline</CardTitle>
          <CardDescription>
            Printed in the invitation and the reminder, so it has to be set before either sends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(formData) =>
              startTransition(async () => {
                const result = await updateRsvpDeadline(formData)
                if ('error' in result) setError({ kind: 'invite', message: result.error })
              })
            }
            className="flex flex-wrap items-end gap-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-deadline">Answer by</Label>
              <Input
                id="rsvp-deadline"
                name="deadline"
                type="date"
                defaultValue={deadline ?? ''}
                className="h-10 w-44"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

    </main>
  )
}

/* ------------------------------------------------------------------- step */

function Step({
  index,
  step,
  templates,
  templatesError,
  capRemaining,
  pending,
  error,
  onSend,
  onTemplate,
}: {
  index: number
  step: StepSummary
  templates: ApprovedTemplate[]
  templatesError: string | null
  capRemaining: number
  pending: boolean
  error: string | null
  onSend: (guestIds: string[], batch: BatchNumber | null, label: string) => void
  onTemplate: (name: string) => void
}) {
  /** Which set the operator is aiming at. Only the invitation offers batches. */
  const [target, setTarget] = useState<'all' | BatchNumber>('all')
  const [open, setOpen] = useState(false)
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const chosen = templates.find((t) => t.name === step.templateName)
  const notApproved = chosen && chosen.status.toUpperCase() !== 'APPROVED'

  const audience = useMemo(
    () => (target === 'all' ? step.eligible : step.eligible.filter((g) => g.batch === target)),
    [step.eligible, target]
  )
  const picked = useMemo(
    () => audience.filter((g) => !dropped.has(g.guestId)),
    [audience, dropped]
  )

  // The truth, not the wish. `takeBatch` on the server truncates at the cap
  // regardless, so the button says now what the run will do then.
  const willSend = Math.min(picked.length, capRemaining)
  const heldByCap = picked.length - willSend

  const noBatch = step.eligible.filter((g) => g.batch === null).length

  function toggle(guestId: string) {
    setDropped((current) => {
      const next = new Set(current)
      if (next.has(guestId)) next.delete(guestId)
      else next.add(guestId)
      return next
    })
  }

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 font-mono text-sm text-muted-foreground">{index}</span>
            <div className="flex-1">
              <CardTitle className="text-base">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </div>
            {step.sent > 0 ? (
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {step.sent} sent
              </span>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`template-${step.kind}`}>Template</Label>
            {templates.length > 0 ? (
              <select
                id={`template-${step.kind}`}
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={step.templateName ?? ''}
                disabled={pending}
                onChange={(e) => onTemplate(e.target.value)}
              >
                {/* A saved name that Meta no longer lists still shows, or the
                    field would silently look like nothing was ever chosen. */}
                {step.templateName && !chosen ? (
                  <option value={step.templateName}>{step.templateName}, not on the account</option>
                ) : null}
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}, {t.status.toLowerCase()}
                    {t.languages.length > 0 ? ` · ${t.languages.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  id={`template-${step.kind}`}
                  defaultValue={step.templateName ?? ''}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== step.templateName) onTemplate(next)
                  }}
                  className="h-10"
                  placeholder="wedding_invitation_v1"
                />
                {templatesError ? (
                  <p className="text-xs text-muted-foreground">{templatesError}</p>
                ) : null}
              </>
            )}

            {chosen ? (
              <p className="text-xs text-muted-foreground">
                {chosen.namedVariables.length > 0
                  ? `Variables: ${chosen.namedVariables.join(', ')}`
                  : `${chosen.bodyVariables} body variable${chosen.bodyVariables === 1 ? '' : 's'}`}
                {chosen.hasUrlButton ? ', a link button' : ''}
                {chosen.hasImageHeader ? ', and a picture header' : ''}. Approved in{' '}
                {chosen.languages.join(', ') || 'no language'}.
              </p>
            ) : null}

            {notApproved ? (
              <p className="text-xs text-[#A85A04] dark:text-[#FBBF24]">
                {chosen!.status.toLowerCase()} at WhatsApp. Nothing can be sent with it until it is
                approved in every language it needs.
              </p>
            ) : null}
          </div>

          {/* The ticket step used to refuse to run while anybody was silent.
              These people are already outside its audience, so the honest thing
              is to name them and let the tickets go. */}
          {step.unanswered.length > 0 ? (
            <div className="rounded-lg border border-[#A85A04]/40 bg-[#A85A04]/10 px-3 py-2 text-sm text-[#A85A04] dark:border-[#FBBF24]/40 dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]">
              <p className="font-medium">
                <span className="font-mono tabular-nums">{step.unanswered.length}</span> guests never
                answered, so they get no ticket and would be turned away at the door.
              </p>
              <p className="mt-1 text-xs">
                {step.unanswered
                  .slice(0, 12)
                  .map((g) => g.name)
                  .join(', ')}
                {step.unanswered.length > 12 ? `, and ${step.unanswered.length - 12} more` : ''}.
              </p>
            </div>
          ) : null}

          {/* Covers a promoted guest, a late addition, and anyone whose phone
              number arrived after the wave. Pressing every numbered batch in
              turn would still leave every one of them unmessaged and
              unmentioned. */}
          {step.usesBatches && noBatch > 0 ? (
            <p className="rounded-lg border bg-secondary px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">{noBatch}</span> guests are ready to invite
              but sit in no batch, so no batch send reaches them. Choose{' '}
              <strong>Everyone left</strong> below, or give them a batch on the batches screen.
            </p>
          ) : null}

          {/* When nobody has answered at all, the amber panel above has already
              said so by name. Repeating it in grey underneath reads as a second,
              separate problem. */}
          {step.blockedReason && step.unanswered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{step.blockedReason}</p>
          ) : step.blockedReason ? null : (
            <>
              {/* The batch controls and the screen that arranges them, in one
                  place. The counts used to be repeated in a strip at the foot
                  of the page, where "Unassigned" counted every guest without a
                  batch while the line inside this step counted only the ones
                  eligible to invite: two different numbers for what reads as
                  one fact. */}
              {step.usesBatches ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Send to</span>
                  {(
                    [
                      { value: 'all' as const, label: 'Everyone left' },
                      ...BATCH_NUMBERS.map((n) => ({ value: n, label: `Batch ${n}` })),
                    ]
                  ).map((option) => (
                    <Button
                      key={String(option.value)}
                      type="button"
                      size="sm"
                      variant={target === option.value ? 'default' : 'outline'}
                      aria-pressed={target === option.value}
                      disabled={pending}
                      onClick={() => {
                        setTarget(option.value)
                        setConfirming(false)
                      }}
                    >
                      {option.label}
                      <span className="ml-0.5 rounded-[0.3rem] bg-foreground/10 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                        {option.value === 'all'
                          ? step.eligible.length
                          : step.eligible.filter((g) => g.batch === option.value).length}
                      </span>
                    </Button>
                  ))}
                  <Button
                    render={<Link href="/batches" />}
                    variant="link"
                    size="sm"
                    className="h-auto gap-1.5 p-0"
                  >
                    <Layers className="size-3.5" aria-hidden="true" />
                    Arrange the batches
                  </Button>
                </div>
              ) : null}

              {/* Nothing sends to somebody the operator has not seen. */}
              <div className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                  onClick={() => setOpen((on) => !on)}
                  aria-expanded={open}
                >
                  <span>
                    <span className="font-mono tabular-nums">{picked.length}</span> guests will get
                    this
                    {dropped.size > 0 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        (<span className="font-mono tabular-nums">{dropped.size}</span> taken out)
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {open ? 'Hide the list' : 'Show the list'}
                  </span>
                </button>

                {open ? (
                  <div className="max-h-72 overflow-y-auto border-t">
                    {audience.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        Nobody is eligible for this step right now.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {audience.map((guest) => (
                          <li key={guest.guestId}>
                            <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                              <Checkbox
                                checked={!dropped.has(guest.guestId)}
                                onCheckedChange={() => toggle(guest.guestId)}
                              />
                              <span className="min-w-0 flex-1 truncate">{guest.name}</span>
                              {guest.batch ? (
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  batch {guest.batch}
                                </span>
                              ) : null}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}

                    {step.excluded.length > 0 ? (
                      <details className="border-t">
                        <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
                          <span className="font-mono tabular-nums">{step.excluded.length}</span> not
                          going out, and why
                        </summary>
                        <ul className="divide-y border-t">
                          {step.excluded.map((guest) => (
                            <li
                              key={guest.guestId}
                              className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                            >
                              <span className="min-w-0 truncate">{guest.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {guest.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {heldByCap > 0 ? (
                <p className="text-sm text-[#A85A04] dark:text-[#FBBF24]">
                  The daily cap holds back{' '}
                  <span className="font-mono tabular-nums">{heldByCap}</span> of them until tomorrow.
                  This run sends <span className="font-mono tabular-nums">{willSend}</span>.
                </p>
              ) : null}

              {step.waitingForTomorrow > 0 ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono tabular-nums">{step.waitingForTomorrow}</span> more were
                  refused by WhatsApp earlier today and will be retried tomorrow.
                </p>
              ) : null}

              {/* Beside the button that caused it, not at the foot of the
                  page. An explanation the operator has to scroll to find is
                  indistinguishable from no explanation. */}
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              {confirming ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm" role={pending ? 'status' : undefined} aria-live="polite">
                    {pending ? (
                      <>
                        Sending to{' '}
                        <strong>
                          <span className="font-mono tabular-nums">{willSend}</span> guests
                        </strong>
                        , one message at a time. This can take a few minutes; leave the tab open.
                      </>
                    ) : (
                      <>
                        This sends to{' '}
                        <strong>
                          <span className="font-mono tabular-nums">{willSend}</span> guests
                        </strong>
                        . It cannot be undone.
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => setConfirming(false)}
                    >
                      Not yet
                    </Button>
                    <Button
                      type="button"
                      className="h-10 gap-2"
                      disabled={pending}
                      onClick={() => {
                        // The panel stays open through the send. Closing it put
                        // the only feedback back at the top and bottom of the
                        // page, off-screen from the button just pressed.
                        onSend(
                          picked.map((g) => g.guestId),
                          step.usesBatches && target !== 'all' ? target : null,
                          step.title
                        )
                      }}
                    >
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      {pending ? 'Sending' : `Yes, send ${willSend}`}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="h-11 gap-2"
                  disabled={pending || willSend === 0}
                  onClick={() => setConfirming(true)}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send to {willSend}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </li>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: number
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd
        className={`shrink-0 font-mono tabular-nums ${strong ? 'text-base font-semibold' : ''} ${
          muted ? 'text-muted-foreground' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
