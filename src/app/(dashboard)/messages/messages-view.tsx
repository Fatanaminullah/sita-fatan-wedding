'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, Layers, Send, Users } from 'lucide-react'
import type { WaveKind } from '@/domain/wave'
import type { ApprovedTemplate } from '@/server/whatsapp/templates'
import {
  sendWave,
  setStepTemplate,
  updateRsvpDeadline,
} from '@/server/actions/wave-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The send console.
 *
 * Three steps in the order they happen, so the shape of the whole run is
 * visible from the first screen rather than assembled from memory. Only the
 * first can send today; the other two show what they are waiting for.
 *
 * Deliberately slow. This is the only screen in the app that reaches a real
 * phone, and none of its mistakes can be taken back.
 */

export type StepSummary = {
  kind: WaveKind
  title: string
  description: string
  templateName: string | null
  ready: number
  readyBatchOne: number
  readyBatchTwo: number
  sent: number
  available: boolean
}

type GuestRow = {
  guestId: string
  name: string
  batch: 1 | 2 | null
  reachable: boolean
  sent: boolean
}

type Outcome = {
  sent: number
  failed: number
  skipped: number
  problems: Array<{ name: string; message: string }>
}

export function MessagesView({
  steps,
  deadline,
  templates,
  templatesError,
  provider,
  guests,
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
  guests: GuestRow[]
  distinctRecipients: number
  sharingANumber: number
  noPhone: number
  waitlisted: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const batchCounts = useMemo(
    () => ({
      one: guests.filter((g) => g.batch === 1).length,
      two: guests.filter((g) => g.batch === 2).length,
      none: guests.filter((g) => g.batch === null).length,
    }),
    [guests]
  )

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Three steps, in order. Nothing sends on its own.
        </p>
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

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <Step
            key={step.kind}
            index={i + 1}
            step={step}
            templates={templates}
            templatesError={templatesError}
            pending={pending}
            onSend={(batch) =>
              startTransition(async () => {
                setError(null)
                setOutcome(null)
                const result = await sendWave({ kind: step.kind, batch })
                if ('error' in result) setError(result.error)
                else setOutcome(result)
              })
            }
            onTemplate={(templateName) =>
              startTransition(async () => {
                setError(null)
                const result = await setStepTemplate({ kind: step.kind, templateName })
                if ('error' in result) setError(result.error)
              })
            }
          />
        ))}
      </ol>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span>
            Batch 1 <span className="font-mono text-base tabular-nums">{batchCounts.one}</span>
          </span>
          <span>
            Batch 2 <span className="font-mono text-base tabular-nums">{batchCounts.two}</span>
          </span>
          <span className="text-muted-foreground">
            Unassigned <span className="font-mono text-base tabular-nums">{batchCounts.none}</span>
          </span>
          <Button
            render={<Link href="/batches" />}
            variant="outline"
            size="sm"
            className="ml-auto h-10 gap-1.5"
          >
            <Layers className="size-4" aria-hidden="true" />
            Arrange the batches
          </Button>
        </CardContent>
      </Card>

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
            Printed into the invitation only. The follow-up asks for an answer in the chat, and the
            ticket goes out after the date has passed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(formData) =>
              startTransition(async () => {
                const result = await updateRsvpDeadline(formData)
                if ('error' in result) setError(result.error)
              })
            }
            className="flex flex-wrap items-end gap-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="rsvpDeadline">Date</Label>
              <Input
                id="rsvpDeadline"
                name="rsvpDeadline"
                type="date"
                defaultValue={deadline ?? ''}
                className="h-10"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10" disabled={pending}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {outcome ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What happened</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Sent" value={outcome.sent} strong />
            {outcome.failed > 0 ? <Row label="Not sent" value={outcome.failed} /> : null}
            {outcome.skipped > 0 ? (
              <Row label="Skipped, already claimed by another run" value={outcome.skipped} muted />
            ) : null}
            {outcome.problems.length > 0 ? (
              <div className="space-y-1 pt-2">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  Worth a look
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {outcome.problems.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium text-foreground">{p.name}</span>: {p.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}

/* ------------------------------------------------------------------- step */

function Step({
  index,
  step,
  templates,
  templatesError,
  pending,
  onSend,
  onTemplate,
}: {
  index: number
  step: StepSummary
  templates: ApprovedTemplate[]
  templatesError: string | null
  pending: boolean
  onSend: (batch: 1 | 2 | null) => void
  onTemplate: (name: string) => void
}) {
  const [confirming, setConfirming] = useState<1 | 2 | null | 'none'>('none')

  const chosen = templates.find((t) => t.name === step.templateName)
  const notApproved = chosen && chosen.status.toUpperCase() !== 'APPROVED'

  return (
    <li>
      <Card className={step.available ? undefined : 'opacity-70'}>
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
                  <option value={step.templateName}>{step.templateName} — not on the account</option>
                ) : null}
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} — {t.status.toLowerCase()}
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
                {chosen.bodyVariables} body variable{chosen.bodyVariables === 1 ? '' : 's'}
                {chosen.hasUrlButton ? ', and a link button' : ''}.
              </p>
            ) : null}

            {notApproved ? (
              <p className="text-xs text-[#A85A04] dark:text-[#FBBF24]">
                {chosen!.status.toLowerCase()} at WhatsApp. Nothing can be sent with it until it is
                approved in every language it needs.
              </p>
            ) : null}
          </div>

          {step.available ? (
            confirming !== 'none' ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm">
                  This sends to{' '}
                  <strong>
                    {confirming === 1
                      ? step.readyBatchOne
                      : confirming === 2
                        ? step.readyBatchTwo
                        : step.ready}{' '}
                    guests
                  </strong>
                  {confirming === null ? ', every batch and the unassigned' : ` in batch ${confirming}`}.
                  It cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => setConfirming('none')}
                  >
                    Not yet
                  </Button>
                  <Button
                    type="button"
                    className="h-10"
                    disabled={pending}
                    onClick={() => {
                      const batch = confirming
                      setConfirming('none')
                      onSend(batch as 1 | 2 | null)
                    }}
                  >
                    Yes, send
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-11 gap-2"
                  disabled={pending || step.readyBatchOne === 0}
                  onClick={() => setConfirming(1)}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Batch 1 · {step.readyBatchOne}
                </Button>
                <Button
                  type="button"
                  className="h-11 gap-2"
                  disabled={pending || step.readyBatchTwo === 0}
                  onClick={() => setConfirming(2)}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Batch 2 · {step.readyBatchTwo}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={pending || step.ready === 0}
                  onClick={() => setConfirming(null)}
                >
                  Everyone left · {step.ready}
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Not built yet.</p>
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
