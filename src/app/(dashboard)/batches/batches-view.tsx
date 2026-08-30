'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Send } from 'lucide-react'
import type { BatchRow } from '@/server/repositories/wave-repository'
import { setBatch } from '@/server/actions/wave-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { inviterLabel } from '@/lib/inviter-label'

/**
 * Splitting the guest list into who hears first and who hears next.
 *
 * The filters are the point. Nobody arranges 334 people by scrolling one list
 * and ticking names: they think in groups — one side, one parent's guests,
 * everyone who can actually be reached. Filter to a group, take all of it, and
 * assign in one press.
 *
 * A guest in no batch is not in a third batch. They are simply not part of a
 * batch send, which is what stops somebody going out by accident.
 */

type BatchFilter = 'any' | '1' | '2' | 'none'
type ReachFilter = 'any' | 'yes' | 'no'

export function BatchesView({ guests }: { guests: BatchRow[] }) {
  const [search, setSearch] = useState('')
  const [side, setSide] = useState<'any' | 'fatan' | 'sita'>('any')
  const [inviter, setInviter] = useState('any')
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('any')
  const [reach, setReach] = useState<ReachFilter>('any')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const inviters = useMemo(
    () => [...new Set(guests.map((g) => g.inviterKey))].sort(),
    [guests]
  )

  const counts = useMemo(
    () => ({
      one: guests.filter((g) => g.batch === 1).length,
      two: guests.filter((g) => g.batch === 2).length,
      none: guests.filter((g) => g.batch === null).length,
    }),
    [guests]
  )

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return guests.filter((g) => {
      if (needle && !g.name.toLowerCase().includes(needle)) return false
      if (side !== 'any' && g.side !== side) return false
      if (inviter !== 'any' && g.inviterKey !== inviter) return false
      if (batchFilter === '1' && g.batch !== 1) return false
      if (batchFilter === '2' && g.batch !== 2) return false
      if (batchFilter === 'none' && g.batch !== null) return false
      if (reach === 'yes' && !g.reachable) return false
      if (reach === 'no' && g.reachable) return false
      return true
    })
  }, [guests, search, side, inviter, batchFilter, reach])

  const allShownPicked = shown.length > 0 && shown.every((g) => picked.has(g.guestId))

  function apply(batch: 1 | 2 | null) {
    setError(null)
    setSaved(null)
    const count = picked.size
    startTransition(async () => {
      const result = await setBatch({ guestIds: [...picked], batch })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setPicked(new Set())
      setSaved(
        batch === null
          ? `${count} taken out of their batch.`
          : `${count} put in batch ${batch}.`
      )
    })
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Batches</h1>
        <p className="text-sm text-muted-foreground">
          Who hears first. Filter to a group, take all of it, and assign in one press.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span>
            Batch 1 <span className="font-mono text-base tabular-nums">{counts.one}</span>
          </span>
          <span>
            Batch 2 <span className="font-mono text-base tabular-nums">{counts.two}</span>
          </span>
          <span className="text-muted-foreground">
            Unassigned <span className="font-mono text-base tabular-nums">{counts.none}</span>
          </span>
          <Button render={<Link href="/messages" />} variant="link" size="sm" className="ml-auto h-auto gap-1.5 p-0">
            <Send className="size-3.5" aria-hidden="true" />
            Go and send
          </Button>
        </CardContent>
      </Card>

      {/* Unassigned is not a third batch, and saying so here saves somebody
          discovering it when a send reaches fewer people than they expected. */}
      {counts.none > 0 ? (
        <p className="rounded-lg border bg-secondary px-3 py-2 text-sm">
          {counts.none} guests are in no batch. A batch send never reaches them, which is what stops
          anyone going out by accident. They are only included by &ldquo;everyone left&rdquo;.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Name</span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a name"
                className="h-10"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Side</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={side}
                onChange={(e) => setSide(e.target.value as typeof side)}
              >
                <option value="any">Both sides</option>
                <option value="fatan">Fatan</option>
                <option value="sita">Sita</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Invited by</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={inviter}
                onChange={(e) => setInviter(e.target.value)}
              >
                <option value="any">Anyone</option>
                {inviters.map((key) => (
                  <option key={key} value={key}>
                    {inviterLabel(key)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Batch</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value as BatchFilter)}
              >
                <option value="any">Any</option>
                <option value="1">Batch 1</option>
                <option value="2">Batch 2</option>
                <option value="none">Not assigned</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Can be reached</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={reach}
                onChange={(e) => setReach(e.target.value as ReachFilter)}
              >
                <option value="any">Any</option>
                <option value="yes">Has a number and an invitation</option>
                <option value="no">Cannot be reached</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={allShownPicked}
                onChange={(e) => {
                  const next = new Set(picked)
                  for (const guest of shown) {
                    if (e.target.checked) next.add(guest.guestId)
                    else next.delete(guest.guestId)
                  }
                  setPicked(next)
                }}
              />
              Take all {shown.length} shown
            </label>
            <span className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">{picked.size}</span> selected
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 backdrop-blur">
        <Button
          type="button"
          className="h-11"
          disabled={pending || picked.size === 0}
          onClick={() => apply(1)}
        >
          Put {picked.size || ''} in batch 1
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={pending || picked.size === 0}
          onClick={() => apply(2)}
        >
          Put {picked.size || ''} in batch 2
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending || picked.size === 0}
          onClick={() => apply(null)}
        >
          Take out of a batch
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">{saved}</p> : null}

      <ul className="divide-y rounded-lg border">
        {shown.map((guest) => (
          <li key={guest.guestId}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="size-4 shrink-0"
                checked={picked.has(guest.guestId)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(guest.guestId)
                  else next.delete(guest.guestId)
                  setPicked(next)
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{guest.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {inviterLabel(guest.inviterKey)}
                  {!guest.reachable ? ' · cannot be reached' : ''}
                </span>
              </span>
              {guest.invited ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3" aria-hidden="true" />
                  sent
                </span>
              ) : null}
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {guest.batch ? `batch ${guest.batch}` : '—'}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Nobody matches those filters.
          </li>
        ) : null}
      </ul>
    </main>
  )
}
