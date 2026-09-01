'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, RotateCw } from 'lucide-react'
import type { SendLogRow } from '@/server/repositories/wave-repository'
import { sendWave } from '@/server/actions/wave-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { inviterLabel } from '@/lib/inviter-label'
import { nativeFieldClass } from '@/lib/field-class'

/**
 * The send ledger.
 *
 * Failures first, because a log is opened when something looks wrong. Every
 * column here is a fact from `wa_sends`; nothing is inferred, and the one thing
 * it cannot show is an attempt-by-attempt history, because the table keeps one
 * row per guest per step and a retry overwrites the failure it retried.
 */

const STEP_LABEL: Record<string, string> = {
  invite: 'Invitation',
  reminder: 'Reminder',
  qr_checkin: 'Ticket',
}

/** Order for the default sort: what needs a person comes first. */
const TROUBLE_RANK: Record<string, number> = {
  failed: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
}

function StatusPill({ status }: { status: string }) {
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="capitalize">
        Failed
      </Badge>
    )
  }
  if (status === 'queued') {
    return (
      <Badge variant="outline" className="text-warning">
        Queued
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="capitalize">
      {status}
    </Badge>
  )
}

function stamp(iso: string | null): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

export type JustRan = { sent: number; failed: number; skipped: number }

export function SendLogView({
  rows,
  justRan,
}: {
  rows: SendLogRow[]
  justRan: JustRan | null
}) {
  const [search, setSearch] = useState('')
  const [step, setStep] = useState('any')
  const [status, setStatus] = useState('any')
  const [retried, setRetried] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const counts = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const row of rows) totals[row.status] = (totals[row.status] ?? 0) + 1
    return totals
  }, [rows])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (needle && !row.guestName.toLowerCase().includes(needle)) return false
        if (step !== 'any' && row.kind !== step) return false
        if (status !== 'any' && row.status !== status) return false
        return true
      })
      .sort((a, b) => {
        // Failures first, then whatever happened most recently. A log is opened
        // because something looks wrong, so the wrong thing goes at the top.
        const trouble = (TROUBLE_RANK[a.status] ?? 9) - (TROUBLE_RANK[b.status] ?? 9)
        if (trouble !== 0) return trouble
        return (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? '')
      })
  }, [rows, search, step, status])

  function retry(row: SendLogRow) {
    setError(null)
    startTransition(async () => {
      const result = await sendWave({ kind: row.kind, guestIds: [row.guestId] })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setRetried((current) => new Set(current).add(row.id))
    })
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <Button
          render={<Link href="/messages" />}
          variant="link"
          size="sm"
          className="h-auto gap-1.5 p-0"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Messages
        </Button>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Message log</h1>
        <p className="text-sm text-muted-foreground">
          Where every guest stands in every step. One row per guest per step: a retry updates its
          own row rather than adding one, so this is the current state and not a history of attempts.
        </p>
      </div>

      {/* The result of the run that sent you here. Stated once, in words,
          above the rows that carry the detail. */}
      {justRan ? (
        <div
          role="status"
          className={
            justRan.failed > 0
              ? 'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm'
              : 'rounded-lg border bg-secondary px-3 py-2 text-sm'
          }
        >
          <span className="font-medium">
            <span className="font-mono tabular-nums">{justRan.sent}</span>{' '}
            {justRan.sent === 1 ? 'message' : 'messages'} sent.
          </span>
          {justRan.failed > 0 ? (
            <span className="text-destructive">
              {' '}
              <span className="font-mono tabular-nums">{justRan.failed}</span> failed, listed first
              below.
            </span>
          ) : (
            <span className="text-muted-foreground"> Nothing failed.</span>
          )}
          {justRan.skipped > 0 ? (
            <span className="text-muted-foreground">
              {' '}
              <span className="font-mono tabular-nums">{justRan.skipped}</span> were skipped: another
              run had already claimed them.
            </span>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a name"
              className="h-10 md:h-8"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Step</span>
            <select
              className={`${nativeFieldClass} w-full`}
              value={step}
              onChange={(e) => setStep(e.target.value)}
            >
              <option value="any">Every step</option>
              <option value="invite">Invitation</option>
              <option value="reminder">Reminder</option>
              <option value="qr_checkin">Ticket</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">State</span>
            <select
              className={`${nativeFieldClass} w-full`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="any">Any state</option>
              <option value="failed">Failed ({counts.failed ?? 0})</option>
              <option value="queued">Queued ({counts.queued ?? 0})</option>
              <option value="sent">Sent ({counts.sent ?? 0})</option>
              <option value="delivered">Delivered ({counts.delivered ?? 0})</option>
              <option value="read">Read ({counts.read ?? 0})</option>
            </select>
          </label>
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

      {rows.length === 0 ? (
        <div className="rounded-xl border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing has been sent yet. Every message from the send console appears here.
          </p>
          <Button render={<Link href="/messages" />} variant="outline" size="sm" className="mt-3">
            Go to the send console
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {shown.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5">
              <div className="min-w-48 flex-1">
                <p className="truncate text-sm font-medium">{row.guestName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.inviterKey ? inviterLabel(row.inviterKey) : 'Unknown inviter'} ·{' '}
                  {STEP_LABEL[row.kind] ?? row.kind}
                </p>
              </div>

              <div className="flex min-w-40 flex-col gap-1">
                <StatusPill status={row.status} />
                {row.errorMessage ? (
                  <span className="text-xs text-destructive">
                    {row.errorMessage}
                    {row.lastErrorCode ? ` (${row.lastErrorCode})` : ''}
                  </span>
                ) : null}
              </div>

              <div className="min-w-36 text-xs text-muted-foreground">
                <p className="font-mono tabular-nums">{stamp(row.sentAt) || 'never sent'}</p>
                {row.lastAttemptAt && row.lastAttemptAt !== row.sentAt ? (
                  <p className="font-mono tabular-nums">
                    last try {stamp(row.lastAttemptAt)}
                  </p>
                ) : null}
                {row.attempts > 1 ? (
                  <p className="font-mono tabular-nums">{row.attempts} attempts</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {row.providerMessageId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Copy the WhatsApp message id"
                    aria-label={`Copy the WhatsApp message id for ${row.guestName}`}
                    onClick={() => navigator.clipboard?.writeText(row.providerMessageId!)}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                ) : null}
                {row.status === 'failed' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={pending || retried.has(row.id)}
                    onClick={() => retry(row)}
                  >
                    <RotateCw aria-hidden="true" />
                    {retried.has(row.id) ? 'Sent again' : 'Try again'}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}

          {shown.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              No message matches those filters.
            </li>
          ) : null}
        </ul>
      )}
    </main>
  )
}
