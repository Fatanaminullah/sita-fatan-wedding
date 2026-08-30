'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Send, Users } from 'lucide-react'
import { sendWave, updateRsvpDeadline } from '@/server/actions/wave-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The invitation wave.
 *
 * Built to be slow on purpose. This is the only screen in the app that reaches
 * a real phone, and the mistakes it could make are not recoverable: a message
 * sent to the wrong person cannot be unsent, and 220 of them cannot be unsent
 * at all. So it says who it is about to reach and why, it insists on a few
 * first, and it names the number out loud before the rest.
 */

type Person = { guestId: string; name: string }

type Outcome = {
  sent: number
  failed: number
  skipped: number
  problems: Array<{ name: string; message: string }>
}

export function WaveView({
  deadline,
  ready,
  waitingForTomorrow,
  sharingANumber,
  excluded,
  distinctRecipients,
  sentCount,
  provider,
}: {
  deadline: string | null
  ready: Person[]
  waitingForTomorrow: Person[]
  sharingANumber: Person[]
  excluded: Array<{ guestId: string; name: string; reason: 'no_phone' | 'waitlisted' | 'already_sent' }>
  distinctRecipients: number
  sentCount: number
  provider: string
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const sharedIds = useMemo(() => new Set(sharingANumber.map((p) => p.guestId)), [sharingANumber])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? ready.filter((p) => p.name.toLowerCase().includes(needle)) : ready
  }, [ready, search])

  const noPhone = excluded.filter((e) => e.reason === 'no_phone').length
  const waitlisted = excluded.filter((e) => e.reason === 'waitlisted').length

  function run(guestIds?: string[]) {
    setError(null)
    setOutcome(null)
    startTransition(async () => {
      const result = await sendWave({ kind: 'invite', guestIds })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setOutcome(result)
      setPicked(new Set())
      setConfirming(false)
    })
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Nothing here sends on its own. Every wave waits for somebody to press it.
        </p>
      </div>

      {/* Says plainly whether this reaches real phones. The provider defaults
          to `fake` so a local run cannot message a guest by accident, and an
          operator should never have to guess which mode they are in. */}
      {provider !== 'meta' ? (
        <p className="rounded-lg border bg-secondary px-3 py-2 text-sm">
          Practice mode. Messages are written down but never leave the machine.
        </p>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Live. Anything sent from this screen reaches a real phone.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The RSVP deadline</CardTitle>
          <CardDescription>
            Printed into every invitation and every reminder. Waves go out over several days, so it
            is set once here rather than typed per send.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The invitation</CardTitle>
          <CardDescription>Who this reaches, and who it does not.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <Row label="Has a number and a confirmed invitation" value={ready.length} strong />
            <Row label="Distinct phone numbers between them" value={distinctRecipients} />
            <Row label="Already sent" value={sentCount} />
            <Row label="No phone number at all" value={noPhone} muted />
            <Row label="Waiting list, never messaged until promoted" value={waitlisted} muted />
            {waitingForTomorrow.length > 0 ? (
              <Row label="Had their fill of messages today, retry tomorrow" value={waitingForTomorrow.length} />
            ) : null}
          </dl>

          {sharingANumber.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-[#A85A04]/40 bg-[#A85A04]/10 p-3 text-sm text-[#A85A04] dark:border-[#FBBF24]/40 dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {sharingANumber.length} guests share a phone with another guest. Only one of each
                pair goes out per run, because two messages to one person in a day is exactly the
                limit WhatsApp allows. The rest follow on the next run.
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send a few first</CardTitle>
          <CardDescription>
            Pick who, read one on a real phone, then release the rest. There is no default list:
            choosing them is the point of this step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a name"
            className="h-10"
          />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {shown.map((person) => (
              <li key={person.guestId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={picked.has(person.guestId)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(person.guestId)
                      else next.delete(person.guestId)
                      setPicked(next)
                    }}
                  />
                  <span className="flex-1 text-sm">{person.name}</span>
                  {sharedIds.has(person.guestId) ? (
                    <span className="text-xs text-muted-foreground">shares a number</span>
                  ) : null}
                </label>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="p-4 text-center text-sm text-muted-foreground">
                Nobody left to send to.
              </li>
            ) : null}
          </ul>

          <Button
            type="button"
            className="h-11 w-full gap-2"
            disabled={pending || picked.size === 0}
            onClick={() => run([...picked])}
          >
            <Send className="size-4" aria-hidden="true" />
            Send to {picked.size} {picked.size === 1 ? 'guest' : 'guests'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send to everyone left</CardTitle>
          <CardDescription>
            Only do this once you have read one of the first few on a phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm">
                This sends the invitation to <strong>{ready.length} guests</strong> across{' '}
                <strong>{distinctRecipients} phone numbers</strong>. It cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setConfirming(false)}
                >
                  Not yet
                </Button>
                <Button type="button" className="h-11" disabled={pending} onClick={() => run()}>
                  Yes, send {ready.length}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={pending || ready.length === 0}
              onClick={() => setConfirming(true)}
            >
              Send to the remaining {ready.length}
            </Button>
          )}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
