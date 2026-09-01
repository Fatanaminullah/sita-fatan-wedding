'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, PhoneOff, Send, Undo2 } from 'lucide-react'
import type { BatchRow } from '@/server/repositories/wave-repository'
import { setBatch } from '@/server/actions/wave-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { inviterLabel } from '@/lib/inviter-label'

/**
 * Splitting the guest list into who hears first and who hears next.
 *
 * The filters are the point. Nobody arranges 334 people by scrolling one list
 * and ticking names: they think in groups — one side, one parent's guests,
 * everyone who can actually be reached. Filter to a group, take all of it, and
 * assign in one press. The list is therefore grouped by inviter by default,
 * with a whole group takeable from its own header, because that is the shape
 * of the job rather than an alphabetical scroll.
 *
 * A guest in no batch is not in a third batch. They are simply not part of a
 * batch send, which is what stops somebody going out by accident.
 */

type Destination = 1 | 2 | null
type BatchFilter = 'any' | '1' | '2' | 'none'
type ReachFilter = 'any' | 'yes' | 'no'

/** What one move did, kept only long enough to offer it back. */
type LastMove = {
  to: Destination
  count: number
  /** Where each guest was before, so undo can put them all back. */
  before: Array<{ guestId: string; batch: Destination }>
}

const UNDO_MS = 8000

function destinationLabel(batch: Destination) {
  return batch === null ? 'No batch' : `Batch ${batch}`
}

/**
 * A count sitting next to a label that ends in a digit.
 *
 * "Batch 1" followed by a bare 3 reads as thirteen, and "Batch 2" followed by
 * a bare 0 reads as twenty. Whitespace alone does not separate two numerals;
 * the count needs its own surface. Square, not a pill: pill geometry belongs
 * to status badges only.
 */
function Counter({ value, selected = false }: { value: number; selected?: boolean }) {
  return (
    <span
      className={
        'ml-0.5 rounded-[0.3rem] px-1.5 py-0.5 font-mono text-xs tabular-nums ' +
        (selected ? 'bg-primary-foreground/20' : 'bg-foreground/10')
      }
    >
      {value}
    </span>
  )
}

export function BatchesView({ guests }: { guests: BatchRow[] }) {
  const [search, setSearch] = useState('')
  const [side, setSide] = useState<'any' | 'fatan' | 'sita'>('any')
  const [inviter, setInviter] = useState('any')
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('any')
  const [reach, setReach] = useState<ReachFilter>('any')
  const [grouped, setGrouped] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<LastMove | null>(null)
  const [pending, startTransition] = useTransition()

  // The undo offer expires on its own. Holding it forever would leave a bar
  // over the list long after the person has moved on to the next group.
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!lastMove) return
    undoTimer.current = setTimeout(() => setLastMove(null), UNDO_MS)
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current)
    }
  }, [lastMove])

  const inviters = useMemo(() => [...new Set(guests.map((g) => g.inviterKey))].sort(), [guests])

  const counts = useMemo(
    () => ({
      one: guests.filter((g) => g.batch === 1).length,
      two: guests.filter((g) => g.batch === 2).length,
      none: guests.filter((g) => g.batch === null).length,
      unreachable: guests.filter((g) => !g.reachable).length,
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

  /**
   * The shown rows in the order they are rendered.
   *
   * One group per inviter when grouping is on, a single unnamed group when it
   * is off, so the list body below has exactly one shape to render.
   */
  const groups = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: null as string | null, rows: shown }]
    const byInviter = new Map<string, BatchRow[]>()
    for (const guest of shown) {
      const bucket = byInviter.get(guest.inviterKey)
      if (bucket) bucket.push(guest)
      else byInviter.set(guest.inviterKey, [guest])
    }
    return [...byInviter.entries()]
      .sort(([a], [b]) => inviterLabel(a).localeCompare(inviterLabel(b)))
      .map(([key, rows]) => ({ key, label: inviterLabel(key), rows }))
  }, [shown, grouped])

  const shownPickedCount = shown.filter((g) => picked.has(g.guestId)).length
  const allShownPicked = shown.length > 0 && shownPickedCount === shown.length

  function setPickedFor(rows: BatchRow[], on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      for (const row of rows) {
        if (on) next.add(row.guestId)
        else next.delete(row.guestId)
      }
      return next
    })
  }

  /** Move a set of guests, remembering where each of them was. */
  function move(guestIds: string[], batch: Destination, clearSelection: boolean) {
    if (guestIds.length === 0) return
    setError(null)
    setLastMove(null)

    const wanted = new Set(guestIds)
    const before = guests
      .filter((g) => wanted.has(g.guestId))
      .map((g) => ({ guestId: g.guestId, batch: g.batch }))

    startTransition(async () => {
      const result = await setBatch({ guestIds, batch })
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (clearSelection) setPicked(new Set())
      setLastMove({ to: batch, count: result.updated, before })
    })
  }

  /**
   * Put everyone back where they were.
   *
   * A move can gather guests from all three places at once, so undoing it is
   * up to three writes, one per destination, not one.
   */
  function undo() {
    const previous = lastMove
    if (!previous) return
    setError(null)
    setLastMove(null)

    const byBatch = new Map<string, { batch: Destination; ids: string[] }>()
    for (const row of previous.before) {
      const key = String(row.batch)
      const bucket = byBatch.get(key)
      if (bucket) bucket.ids.push(row.guestId)
      else byBatch.set(key, { batch: row.batch, ids: [row.guestId] })
    }

    startTransition(async () => {
      for (const { batch, ids } of byBatch.values()) {
        const result = await setBatch({ guestIds: ids, batch })
        if ('error' in result) {
          setError(result.error)
          return
        }
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 pb-28 md:p-6 md:pb-28">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Batches</h1>
        <p className="text-sm text-muted-foreground">
          Who hears first. Filter to a group, take all of it, and send it to a batch in one press.
        </p>
      </div>

      {/* The ledger is also the filter. These three numbers are the question
          somebody arrives with, and every one of them is a set they then want
          to look at, so making them chips removes a whole select below. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {(
            [
              { value: 'any', label: 'Everyone', count: guests.length },
              { value: '1', label: 'Batch 1', count: counts.one },
              { value: '2', label: 'Batch 2', count: counts.two },
              { value: 'none', label: 'No batch', count: counts.none },
            ] as Array<{ value: BatchFilter; label: string; count: number }>
          ).map((chip) => (
            <Button
              key={chip.value}
              type="button"
              size="sm"
              variant={batchFilter === chip.value ? 'default' : 'outline'}
              aria-pressed={batchFilter === chip.value}
              onClick={() => setBatchFilter(chip.value)}
            >
              {chip.label}
              <Counter value={chip.count} selected={batchFilter === chip.value} />
            </Button>
          ))}
          <Button
            render={<Link href="/messages" />}
            variant="link"
            size="sm"
            className="ml-auto h-auto gap-1.5 p-0"
          >
            <Send className="size-3.5" aria-hidden="true" />
            Go and send
          </Button>
        </CardContent>
      </Card>

      {/* Said once, where it is still news: unassigned is not a third batch.
          Once they are looking at that set the chip above already says so. */}
      {counts.none > 0 && batchFilter !== 'none' ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{counts.none}</span>{' '}
          guests are in no batch. A
          batch send never reaches them, which is what stops anyone going out by accident. They are
          only included by &ldquo;everyone left&rdquo;.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <span className="text-xs font-medium text-muted-foreground">Side</span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-2 text-sm md:h-8"
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
              className="h-10 w-full rounded-lg border bg-background px-2 text-sm md:h-8"
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
            <span className="text-xs font-medium text-muted-foreground">
              Can be reached
              {counts.unreachable > 0 ? (
                <span className="ml-1 font-normal">
                  (<span className="font-mono tabular-nums">{counts.unreachable}</span> cannot)
                </span>
              ) : null}
            </span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-2 text-sm md:h-8"
              value={reach}
              onChange={(e) => setReach(e.target.value as ReachFilter)}
            >
              <option value="any">Any</option>
              <option value="yes">Has a number and an invitation</option>
              <option value="no">Cannot be reached</option>
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

      <div className="overflow-hidden rounded-xl border">
        {/* Select-all sits in the same column as the row checkboxes it drives,
            not two cards away from them. */}
        <div className="flex items-center gap-3 border-b bg-secondary/50 px-3 py-2">
          <Checkbox
            aria-label={`Take all ${shown.length} shown`}
            checked={allShownPicked}
            indeterminate={shownPickedCount > 0 && !allShownPicked}
            onCheckedChange={(on) => setPickedFor(shown, on)}
            disabled={shown.length === 0}
          />
          <span className="text-sm">
            <span className="font-mono tabular-nums">{shown.length}</span> shown
          </span>
          <span className="ml-auto text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{picked.size}</span> selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={grouped}
            onClick={() => setGrouped((on) => !on)}
          >
            {grouped ? 'Group by inviter' : 'A to Z'}
          </Button>
        </div>

        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nobody matches those filters.
          </p>
        ) : null}

        {groups.map((group) => {
          const groupPicked = group.rows.every((g) => picked.has(g.guestId))
          const groupSome = group.rows.some((g) => picked.has(g.guestId))
          return (
            <section key={group.key}>
              {group.label ? (
                <div className="flex items-center gap-3 border-b bg-secondary/30 px-3 py-1.5">
                  <Checkbox
                    aria-label={`Take all ${group.rows.length} invited by ${group.label}`}
                    checked={groupPicked}
                    indeterminate={groupSome && !groupPicked}
                    onCheckedChange={(on) => setPickedFor(group.rows, on)}
                  />
                  <span className="text-xs font-medium">{group.label}</span>
                  <Counter value={group.rows.length} />
                </div>
              ) : null}

              <ul className="divide-y">
                {group.rows.map((guest) => (
                  <li key={guest.guestId} className="flex items-center gap-3 px-3">
                    <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 py-2 md:min-h-9">
                      <Checkbox
                        checked={picked.has(guest.guestId)}
                        onCheckedChange={(on) => setPickedFor([guest], on)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{guest.name}</span>
                        {!grouped ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {inviterLabel(guest.inviterKey)}
                          </span>
                        ) : null}
                      </span>
                    </label>

                    {!guest.reachable ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                        <PhoneOff aria-hidden="true" />
                        cannot be reached
                      </Badge>
                    ) : null}

                    {guest.invited ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                        <Check aria-hidden="true" />
                        sent
                      </Badge>
                    ) : null}

                    {/* One guest in the wrong place is a correction, not a
                        selection. Their own pill moves them without touching
                        whatever is currently ticked. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant={guest.batch ? 'secondary' : 'ghost'}
                            size="xs"
                            disabled={pending}
                            aria-label={`${guest.name} is in ${destinationLabel(guest.batch)}. Move them.`}
                          />
                        }
                      >
                        {guest.batch ? `Batch ${guest.batch}` : 'No batch'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto min-w-40">
                        {([1, 2, null] as Destination[]).map((option) => (
                          <DropdownMenuItem
                            key={String(option)}
                            disabled={option === guest.batch}
                            onClick={() => move([guest.guestId], option, false)}
                          >
                            Move to {destinationLabel(option).toLowerCase()}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {/* Docked to the bottom, and only present when it has something to act
          on. At rest this screen carries no primary colour at all, which is
          what lets the destination buttons mean "you can act on this". */}
      {picked.size > 0 || lastMove ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 p-3">
            {picked.size > 0 ? (
              <>
                <span className="text-sm">
                  Move <span className="font-mono tabular-nums">{picked.size}</span>{' '}
                  {picked.size === 1 ? 'guest' : 'guests'} to
                </span>
                {([1, 2, null] as Destination[]).map((option) => (
                  <Button
                    key={String(option)}
                    type="button"
                    size="lg"
                    variant={option === null ? 'outline' : 'default'}
                    className="h-11 md:h-9"
                    disabled={pending}
                    onClick={() => move([...picked], option, true)}
                  >
                    {destinationLabel(option)}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => setPicked(new Set())}
                >
                  Clear
                </Button>
              </>
            ) : lastMove ? (
              <>
                <span className="text-sm" role="status">
                  <span className="font-mono tabular-nums">{lastMove.count}</span>{' '}
                  {lastMove.count === 1 ? 'guest' : 'guests'} moved to{' '}
                  {destinationLabel(lastMove.to).toLowerCase()}.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={pending}
                  onClick={undo}
                >
                  <Undo2 aria-hidden="true" />
                  Undo
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
