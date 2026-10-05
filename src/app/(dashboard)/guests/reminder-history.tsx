'use client'

import { useEffect, useState } from 'react'
import { listReminderHistory, type ReminderHistory } from '@/server/actions/wave-actions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const STATUS_LABEL: Record<string, string> = {
  queued: 'sending',
  sent: 'sent, not delivered yet',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
}

function moment(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

/** How many times the reminder went to one guest, and when. Read on open. */
export function ReminderHistoryDialog({
  guestId,
  name,
  onClose,
}: {
  guestId: string | null
  name: string
  onClose: () => void
}) {
  // Keyed by guest, so a reopen for someone else reads as loading rather
  // than briefly showing the previous guest's history.
  const [loaded, setLoaded] = useState<{ id: string; result: ReminderHistory } | null>(null)
  const history = loaded && loaded.id === guestId ? loaded.result : null

  useEffect(() => {
    if (!guestId) return
    let live = true
    listReminderHistory(guestId).then((result) => {
      if (live) setLoaded({ id: guestId, result })
    })
    return () => {
      live = false
    }
  }, [guestId])

  const attempts = history && 'ok' in history ? history.attempts : []
  const sent = attempts.filter((a) => a.outcome === 'accepted').length

  return (
    <Dialog open={guestId !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reminder history</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>

        {history === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : 'error' in history ? (
          <p role="alert" className="text-sm text-destructive">
            {history.error}
          </p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">The reminder has not been sent to them.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Sent <span className="font-mono tabular-nums">{sent}</span> {sent === 1 ? 'time' : 'times'}
              {history.status ? (
                <span className="text-muted-foreground">
                  {' '}
                  · latest {STATUS_LABEL[history.status] ?? history.status}
                </span>
              ) : null}
            </p>
            <ol className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {attempts.map((a, i) => (
                <li key={a.at + i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-mono tabular-nums">{moment(a.at)}</span>
                  {a.outcome === 'accepted' ? (
                    <span className="text-muted-foreground">Sent</span>
                  ) : (
                    <span className="min-w-0 text-right text-destructive" title={a.error ?? undefined}>
                      Failed{a.error ? `: ${a.error}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
