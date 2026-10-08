'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Gift, Star, Tag } from 'lucide-react'
import { extraPax, resolveScan, type DoorGuest } from '@/domain/checkin'
import type { WeddingEvent } from '@/domain/souvenir'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEnvelopeLabel } from '@/components/envelope-label'
import { inviterLabel } from '@/lib/inviter-label'
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
  guests: everyone,
  event,
  side,
  canUndo,
}: {
  guests: DoorGuest[]
  event: WeddingEvent
  /** One family's desk, or null for both. */
  side: 'fatan' | 'sita' | null
  canUndo: boolean
}) {
  // Narrowed before anything else, so the header counts are this desk's own.
  // A guest who said no is not coming and cannot be ticked, so they are only
  // noise on a list read standing up. Kept if somehow already in, so an
  // arrival is never hidden.
  const guests = useMemo(
    () =>
      everyone.filter(
        (g) =>
          (!side || g.side === side) &&
          (g.rsvpStatus !== 'not_attending' || g.checkedInAt !== null)
      ),
    [everyone, side]
  )
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<{ guest: DoorGuest; what: 'entry' | 'souvenir' } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const envelope = useEnvelopeLabel()

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
  // People beyond what each arrived party said they would bring.
  const extraTotal = guests.reduce(
    (sum, g) => sum + (g.checkedInPax !== null ? extraPax(g, g.checkedInPax) : 0),
    0
  )
  const souvenirs = guests.filter((g) => g.souvenirClaimedAt !== null).length
  // Only an explicit yes can be checked in. Counting them here so the header
  // says how much of the list is not yet ticketable, rather than leaving it to
  // be discovered one failed tap at a time.
  const blocked = guests.filter(
    (g) => g.checkedInAt === null && !resolveScan({ guest: g, event }).canAdmit
  ).length

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
            {extraTotal > 0 ? ` · ${extraTotal} extra pax` : ''}
          </p>
          {blocked > 0 ? (
            <p className="w-full text-sm text-[#A85A04] dark:text-[#FBBF24]">
              <span className="font-mono tabular-nums">{blocked}</span> cannot be checked in yet:
              no confirmed RSVP. Answer for them in the guest list.
            </p>
          ) : null}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name or group"
          className="h-11 text-base"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex gap-2">
            {(['akad', 'resepsi'] as const).map((e) => (
              <Link
                key={e}
                href={listHref(e, side)}
                className={`rounded-full px-3 py-1 ${event === e ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
              >
                {e === 'akad' ? 'Akad' : 'Resepsi'}
              </Link>
            ))}
          </div>
          <div className="flex gap-2">
            {([null, 'fatan', 'sita'] as const).map((s) => (
              <Link
                key={s ?? 'both'}
                href={listHref(event, s)}
                className={`rounded-full px-3 py-1 ${side === s ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
              >
                {s === null ? 'Both sides' : s === 'fatan' ? "Fatan's side" : "Sita's side"}
              </Link>
            ))}
          </div>
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

      {error || envelope.error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error ?? envelope.error}
        </p>
      ) : null}
      {envelope.layer}

      <ul className="divide-y">
        {rows.map((g) => (
          <li key={g.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{g.name}</span>
                {g.isVip ? <Star className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                {/* Arrived larger than they said. Let in, and visible here so
                    the couple can see who brought more. */}
                {g.checkedInPax !== null && extraPax(g, g.checkedInPax) > 0 ? (
                  <span className="shrink-0 rounded-full bg-[#A85A04]/10 px-2 py-0.5 font-mono text-xs tabular-nums text-[#A85A04] dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]">
                    +{extraPax(g, g.checkedInPax)} extra
                  </span>
                ) : null}
              </p>
              {/* The group is what tells one Wati from another, so it sits
                  directly under the name rather than at the end of the meta
                  line where it would truncate away first. */}
              {g.note ? <p className="truncate text-sm">{g.note}</p> : null}
              <p className="truncate text-sm text-muted-foreground">
                {/* The RSVP's headcount, which is what the tick records and who is
                    expected at the door; the invited number only until they answer. */}
                <span className="font-mono tabular-nums">{g.paxConfirmed ?? g.pax}</span> pax · {inviterLabel(g.inviterKey)}
                {g.inviteStatus === 'waitlisted' ? ' · waiting list' : ''}
                {g.rsvpStatus === 'pending' || g.rsvpStatus === null ? ' · no RSVP' : ''}
              </p>
            </div>

            <Toggle
              on={g.checkedInAt !== null}
              disabled={
                pending ||
                (g.checkedInAt !== null && !canUndo) ||
                // Not yet ticketable. Disabled rather than left tappable, so
                // the reason is visible before the tap instead of arriving as
                // a failed write afterwards.
                (g.checkedInAt === null && !resolveScan({ guest: g, event }).canAdmit)
              }
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

            {/* The envelope label, once they are in. Never on, never a state:
                it is an action, so it keeps the outline look of an untoggled
                button and simply prints. */}
            <Toggle
              on={false}
              disabled={envelope.pending || g.checkedInAt === null}
              label={`Print envelope label for ${g.name}`}
              onClick={() => envelope.print(g.id)}
            >
              <Tag className="size-5" aria-hidden="true" />
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

function listHref(event: WeddingEvent, side: 'fatan' | 'sita' | null): string {
  return `/checkin/list?event=${event}${side ? `&side=${side}` : ''}`
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
