'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Gift, Star } from 'lucide-react'
import type { DoorGuest } from '@/domain/checkin'
import type { WeddingEvent } from '@/domain/souvenir'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  checkInGuest,
  claimSouvenir,
  undoCheckIn,
  undoSouvenir,
} from '@/server/actions/checkin-actions'

/**
 * One row per guest, two toggles.
 *
 * Touch density throughout, not the ops density the guest tables use: this is
 * a wedding-day surface held standing up, and DESIGN.md's Two Densities Rule
 * assigns those to 44px minimum targets regardless of screen size.
 *
 * Ticking is instant. Un-ticking asks first, because the two mistakes are not
 * symmetrical: a wrong tick is a number to correct later, and a wrong un-tick
 * at the souvenir table is a second souvenir leaving the table.
 */
export function DoorList({
  guests,
  event,
  canUndo,
}: {
  guests: DoorGuest[]
  event: WeddingEvent
  canUndo: boolean
}) {
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<{ guest: DoorGuest; what: 'entry' | 'souvenir' } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return guests
    // Matches the group as well as the name, so "Keluarga A" pulls up that
    // whole family at once. Same rule the server-side search follows.
    return guests.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.note ?? '').toLowerCase().includes(q)
    )
  }, [guests, query])

  const arrived = guests.filter((g) => g.checkedInAt !== null).length
  const souvenirs = guests.filter((g) => g.souvenirClaimedAt !== null).length

  function run(fn: () => Promise<{ error: string } | { ok: true }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if ('error' in result) setError(result.error)
    })
  }

  function toggleEntry(guest: DoorGuest) {
    if (guest.checkedInAt) {
      setConfirming({ guest, what: 'entry' })
      return
    }
    run(() =>
      checkInGuest({
        guestId: guest.id,
        event,
        // The tick-list has no stepper: at the Akad the party is standing in
        // front of whoever is ticking, and asking for a headcount per row
        // would make the fast path slower than the scan it replaced. Their
        // confirmed number is taken as read and corrected from the scan
        // station if it matters.
        paxArrived: guest.paxConfirmed ?? guest.pax,
      })
    )
  }

  function toggleSouvenir(guest: DoorGuest) {
    if (guest.souvenirClaimedAt) {
      setConfirming({ guest, what: 'souvenir' })
      return
    }
    run(() => claimSouvenir({ guestId: guest.id, event }))
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <header className="sticky top-0 z-10 -mx-4 space-y-3 bg-background px-4 pb-3 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-medium">
            {event === 'akad' ? 'Akad' : 'Resepsi'} guest list
          </h1>
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {arrived} / {guests.length} arrived · {souvenirs} souvenirs
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name or group"
          className="h-11 text-base"
        />
        <div className="flex gap-2 text-sm">
          <Link
            href="/checkin/list?event=akad"
            className={`rounded-full px-3 py-1 ${event === 'akad' ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
          >
            Akad
          </Link>
          <Link
            href="/checkin/list?event=resepsi"
            className={`rounded-full px-3 py-1 ${event === 'resepsi' ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
          >
            Resepsi
          </Link>
        </div>

        {/* Column labels for the two toggles. Without them the buttons are a
            tick and a gift box with no stated meaning, which is exactly the
            "icon-only control" the design rules warn about. Part of the sticky
            header so they stay put while the list scrolls. */}
        <div className="flex items-end gap-3 border-b pb-1.5">
          <span className="flex-1 text-xs uppercase tracking-widest text-muted-foreground">
            Guest
          </span>
          <span className="w-11 text-center text-xs uppercase tracking-widest text-muted-foreground">
            In
          </span>
          <span className="w-11 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Souv
          </span>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <ul className="divide-y">
        {rows.map((g) => (
          <li key={g.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{g.name}</span>
                {g.isVip ? <Star className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              </p>
              {/* The group is what tells one Wati from another, so it sits
                  directly under the name rather than at the end of the meta
                  line where it would truncate away first. */}
              {g.note ? <p className="truncate text-sm">{g.note}</p> : null}
              <p className="truncate text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{g.pax}</span> pax · {g.inviterKey}
                {g.inviteStatus === 'waitlisted' ? ' · waiting list' : ''}
                {g.rsvpStatus === 'not_attending' ? ' · said no' : ''}
              </p>
            </div>

            <Toggle
              on={g.checkedInAt !== null}
              disabled={pending || (g.checkedInAt !== null && !canUndo)}
              label={`Mark ${g.name} arrived`}
              onClick={() => toggleEntry(g)}
            >
              <Check className="size-5" aria-hidden="true" />
            </Toggle>

            <Toggle
              on={g.souvenirClaimedAt !== null}
              disabled={pending || (g.souvenirClaimedAt !== null && !canUndo)}
              label={`Mark ${g.name} given a souvenir`}
              onClick={() => toggleSouvenir(g)}
            >
              <Gift className="size-5" aria-hidden="true" />
            </Toggle>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted-foreground">
            Nobody matching that on this list.
          </li>
        ) : null}
      </ul>

      {confirming ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl bg-card p-5 shadow-lg">
            <div>
              <h2 className="text-base font-medium">
                {confirming.what === 'entry' ? 'Undo their arrival?' : 'Undo their souvenir?'}
              </h2>
              <p className="pt-1 text-sm text-muted-foreground">
                {confirming.what === 'entry'
                  ? `${confirming.guest.name} will count as not yet arrived.`
                  : `${confirming.guest.name} will be able to collect another souvenir.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={() => setConfirming(null)}
              >
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11 flex-1"
                onClick={() => {
                  const { guest, what } = confirming
                  setConfirming(null)
                  run(() => (what === 'entry' ? undoCheckIn(guest.id, event) : undoSouvenir(guest.id)))
                }}
              >
                Undo
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Toggle({
  on,
  disabled,
  label,
  onClick,
  children,
}: {
  on: boolean
  disabled: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-lg border transition-[background-color,border-color] duration-150 active:translate-y-px disabled:opacity-50 ${
        on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
      }`}
    >
      {children}
    </button>
  )
}
