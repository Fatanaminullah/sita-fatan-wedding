'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, Ban, Gift, LayoutDashboard, ListChecks, Mail, Menu, Minus, Plus, Printer, QrCode, Search, Settings2, Star, Tag, X } from 'lucide-react'
import { DOOR_PAX_LIMIT, extraPax, resolveScan, resolveSouvenirScan, vipLabel, type DoorGuest } from '@/domain/checkin'
import type { WeddingEvent } from '@/domain/souvenir'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrivalGreeting } from '@/components/invitation/arrival-greeting'
import { inviterLabel } from '@/lib/inviter-label'
import { checkInGuest, claimSouvenir, lookupByToken, searchRoster } from '@/server/actions/checkin-actions'
import { useEnvelopeLabel } from '@/components/envelope-label'
import { Scanner, type Facing } from './scanner'

/**
 * One station, two jobs.
 *
 * The Resepsi runs two of these on separate devices: a door that admits people
 * and a table that hands out souvenirs. They share a lookup, a roster and a
 * result card, and differ only in which action the card offers and which rule
 * decides the outcome. Building them as one screen with a setting rather than
 * two near-identical routes keeps that shared half genuinely shared.
 *
 * The setting is chosen once and remembered, because a queue must never be
 * asked to wait while someone re-picks which door they are standing at.
 */

type Station = 'checkin' | 'souvenir'
/**
 * How the guest says they will give. Optional, asked by the usher, and never
 * saved: it only decides what happens on Check In. An envelope prints its
 * label automatically; QRIS has already been shown by then.
 */
type GiftWay = 'envelope' | 'qris' | null
type View =
  | { kind: 'idle' }
  | { kind: 'result'; guest: DoorGuest }
  | { kind: 'greeting'; guest: DoorGuest; paxArrived: number }

const STORE_KEY = 'door-station'

const EVENT_NAME: Record<WeddingEvent, string> = { akad: 'Akad', resepsi: 'Resepsi' }

export function Station({ canUndo }: { canUndo: boolean }) {
  const [station, setStation] = useState<Station>('checkin')
  const [event, setEvent] = useState<WeddingEvent>('resepsi')
  // Front camera by default. The tablet stands facing the guest, so the
  // front lens is the one pointed at the QR they are holding up; the back
  // one would be aimed at the usher. Switchable because a station that ends
  // up handheld wants the opposite, and remembered so a tablet that sleeps
  // at the door wakes up still pointing the right way.
  const [facing, setFacing] = useState<Facing>('user')
  // Three states, not two: "not read yet" is real and must render as neither
  // door. The tablet is server-rendered before it can reach localStorage, and
  // flashing the wrong event name at a queue for one frame is a defect.
  const [loaded, setLoaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // The guest just let in, whose envelope is in the usher's hand. Kept after
  // the greeting so the label can be printed while the next guest steps up.
  const [lastAdmitted, setLastAdmitted] = useState<DoorGuest | null>(null)
  const [unlistedOpen, setUnlistedOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const envelope = useEnvelopeLabel()

  // Restore the station's identity. Written on change, so a tablet that goes
  // to sleep at the door wakes up still knowing which door it is.
  useEffect(() => {
    let cancelled = false

    async function load() {
      let saved: { station?: Station; event?: WeddingEvent; facing?: Facing } | null = null
      try {
        const raw = window.localStorage.getItem(STORE_KEY)
        saved = raw
          ? (JSON.parse(raw) as { station?: Station; event?: WeddingEvent; facing?: Facing })
          : null
      } catch {
        // Storage blocked or holding something we did not write. Ask again.
        saved = null
      }
      if (cancelled) return
      if (saved?.station) setStation(saved.station)
      if (saved?.event) setEvent(saved.event)
      if (saved?.facing) setFacing(saved.facing)
      setSettingsOpen(!saved?.station || !saved?.event)
      setLoaded(true)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const remember = useCallback((next: { station: Station; event: WeddingEvent; facing: Facing }) => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
    } catch {
      // A tablet with storage blocked still works; it just asks again on reload.
    }
  }, [])

  const handleCode = useCallback(
    (raw: string) => {
      if (view.kind !== 'idle' || pending) return
      setError(null)
      startTransition(async () => {
        const result = await lookupByToken(raw, event)
        if ('error' in result) {
          setError(result.error)
          return
        }
        if (!result.guest) {
          setError('That ticket is not on the list. Find them by name instead.')
          return
        }
        setView({ kind: 'result', guest: result.guest })
      })
    },
    [event, pending, view.kind]
  )

  function admit(guest: DoorGuest, paxArrived: number, gift: GiftWay) {
    setError(null)
    startTransition(async () => {
      const result = await checkInGuest({ guestId: guest.id, event, paxArrived })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setLastAdmitted(guest)
      setView({ kind: 'greeting', guest, paxArrived })
      // Printed behind the greeting, so the label is in the tray by the time
      // the usher turns round. With no printer connected, the print screen
      // waits until the greeting clears rather than covering it.
      if (gift === 'envelope') envelope.print(guest.id)
    })
  }

  function give(guest: DoorGuest) {
    setError(null)
    startTransition(async () => {
      const result = await claimSouvenir({ guestId: guest.id, event })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setView({ kind: 'idle' })
    })
  }

  // Before the station knows which door it is, it shows nothing that could be
  // wrong. The monogram alone is true at every door.
  if (!loaded) {
    return <div className="min-h-dvh" aria-busy="true" />
  }

  if (view.kind === 'greeting') {
    return (
      <ArrivalGreeting
        name={view.guest.name}
        paxArrived={view.paxArrived}
        event={event}
        // The display-sized copy, not the 6720px camera original: this has to
        // paint the moment someone is admitted.
        photoSrc="/bg-welcome-guest-display.jpg"
        vipLabel={vipLabel(view.guest)}
        onDone={() => setView({ kind: 'idle' })}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {/* The way back to the rest of the app (owner, 2026-10-08). Behind a
              menu rather than in the header, so nothing a guest reads over the
              desk is a link, and a stray tap opens a sheet rather than leaving. */}
          <Button
            type="button"
            variant="ghost"
            className="size-11 p-0"
            aria-label="Menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg px-2 py-1 text-left"
          >
            <span className="block text-xs uppercase tracking-widest text-muted-foreground">
              {station === 'checkin' ? 'Door' : 'Souvenirs'}
            </span>
            <span className="block text-base font-medium">{EVENT_NAME[event]}</span>
          </button>
        </div>
        <div className="flex gap-2">
          {station === 'checkin' ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 px-3"
              onClick={() => setUnlistedOpen(true)}
              aria-label="Envelope label for someone not on the list"
            >
              <Tag className="size-4" aria-hidden="true" />
              Label
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-4"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4" aria-hidden="true" />
            Find by name
          </Button>
        </div>
      </header>

      {envelope.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {envelope.error}
        </p>
      ) : null}

      {station === 'checkin' && view.kind === 'idle' && lastAdmitted ? (
        <div className="flex items-center gap-3 rounded-xl bg-secondary py-2 pr-2 pl-3.5 text-secondary-foreground">
          <Tag className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm">
            Envelope from <b className="font-semibold">{lastAdmitted.name}</b>
          </span>
          <Button
            type="button"
            className="h-11 gap-2 px-4"
            disabled={envelope.pending}
            onClick={() => envelope.print(lastAdmitted.id)}
          >
            <Printer className="size-4" aria-hidden="true" />
            {envelope.pending ? 'Printing' : 'Print label'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="size-11 p-0"
            aria-label="Dismiss"
            onClick={() => setLastAdmitted(null)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {view.kind === 'idle' ? (
        <Scanner
          onCode={handleCode}
          paused={pending}
          facing={facing}
          onToggleFacing={() => {
            const next: Facing = facing === 'user' ? 'environment' : 'user'
            setFacing(next)
            remember({ station, event, facing: next })
          }}
        />
      ) : (
        <ResultCard
          guest={view.guest}
          station={station}
          event={event}
          pending={pending}
          canUndo={canUndo}
          onAdmit={admit}
          onGive={give}
          onDismiss={() => setView({ kind: 'idle' })}
          onPrintLabel={station === 'checkin' ? () => envelope.print(view.guest.id) : null}
          printing={envelope.pending}
        />
      )}

      {settingsOpen ? (
        <StationSettings
          station={station}
          event={event}
          onSave={(next) => {
            setStation(next.station)
            setEvent(next.event)
            remember({ ...next, facing })
            setSettingsOpen(false)
          }}
        />
      ) : null}

      {unlistedOpen ? (
        <UnlistedLabelSheet
          pending={envelope.pending}
          onPrint={(name) => {
            envelope.printUnlisted(name)
            setUnlistedOpen(false)
          }}
          onClose={() => setUnlistedOpen(false)}
        />
      ) : null}

      {envelope.layer}

      {menuOpen ? (
        <StationMenu
          onSettings={() => {
            setMenuOpen(false)
            setSettingsOpen(true)
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      {searchOpen ? (
        <SearchSheet
          event={event}
          onPick={(guest) => {
            setSearchOpen(false)
            setView({ kind: 'result', guest })
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ result */

function ResultCard({
  guest,
  station,
  event,
  pending,
  canUndo,
  onAdmit,
  onGive,
  onDismiss,
  onPrintLabel,
  printing,
}: {
  guest: DoorGuest
  station: Station
  event: WeddingEvent
  pending: boolean
  canUndo: boolean
  onAdmit: (guest: DoorGuest, pax: number, gift: GiftWay) => void
  onGive: (guest: DoorGuest) => void
  onDismiss: () => void
  /** Offered for a guest already inside, whose envelope may still need its label. */
  onPrintLabel: (() => void) | null
  printing: boolean
}) {
  const entry = resolveScan({ guest, event })
  const souvenir = resolveSouvenirScan({ guest, event })
  const [pax, setPax] = useState(entry.suggestedPax)
  const [gift, setGift] = useState<GiftWay>(null)
  const [qrisOpen, setQrisOpen] = useState(false)
  const extra = extraPax(guest, pax)
  const vip = vipLabel(guest)

  const warning =
    station === 'checkin' ? entryWarning(guest, entry.outcome) : souvenirWarning(souvenir.outcome, guest)

  const canAct = station === 'checkin' ? entry.canAdmit : souvenir.canGive

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4">
        {warning ? (
          /* Amber is attention, red is refusal, per DESIGN.md. A guest who
             declined and came anyway is amber because they still get in; a
             guest with no invitation is red because they do not. Never colour
             alone: the state is a word and an icon before it is a hue. */
          <div
            className={
              warning.severity === 'refused'
                ? 'flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive'
                : 'flex items-start gap-3 rounded-xl border border-[#A85A04]/40 bg-[#A85A04]/10 p-4 text-[#A85A04] dark:border-[#FBBF24]/40 dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]'
            }
          >
            {warning.severity === 'refused' ? (
              <Ban className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium">{warning.title}</p>
              <p className="text-sm opacity-90">{warning.detail}</p>
            </div>
          </div>
        ) : null}

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-medium">{guest.name}</h2>
          </div>
          {vip ? (
            // A band, not a chip: the one fact the usher has to act on (walk
            // them to their table), readable across the desk.
            <div className="my-2 flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground">
              <Star className="size-6 shrink-0 fill-current" aria-hidden="true" />
              <span className="text-xl font-semibold tracking-wide">{vip}</span>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Invited by {inviterLabel(guest.inviterKey)} · {guest.pax} invited
            {guest.paxConfirmed !== null ? ` · ${guest.paxConfirmed} confirmed` : ' · no answer'}
          </p>
          {entry.souvenirDue ? (
            <p className="flex items-center gap-1.5 pt-1 text-sm">
              <Gift className="size-4" aria-hidden="true" />
              Souvenir not collected yet
            </p>
          ) : null}
        </div>

        {station === 'checkin' && canAct ? (
          <div>
            <p className="pb-2 text-sm font-medium">How many arrived?</p>
            {/* One stepper, pre-filled with what they said. The usual case is
                no tap at all; a bigger or smaller party is one tap per person,
                on targets sized for a thumb at a busy desk. */}
            <div className="flex items-stretch overflow-hidden rounded-xl border">
              <button
                type="button"
                onClick={() => setPax((p) => Math.max(1, p - 1))}
                disabled={pax <= 1}
                aria-label="One fewer person"
                className="flex w-20 items-center justify-center bg-secondary transition-colors active:bg-secondary/60 disabled:opacity-35"
              >
                <Minus className="size-6" aria-hidden="true" />
              </button>
              <output
                aria-live="polite"
                className="flex flex-1 flex-col items-center justify-center py-2"
              >
                <span className="font-mono text-4xl font-semibold tabular-nums">{pax}</span>
                <span className="text-xs text-muted-foreground">
                  {guest.paxConfirmed !== null ? `${guest.paxConfirmed} confirmed` : `${guest.pax} invited`}
                </span>
              </output>
              <button
                type="button"
                onClick={() => setPax((p) => Math.min(DOOR_PAX_LIMIT, p + 1))}
                disabled={pax >= DOOR_PAX_LIMIT}
                aria-label="One more person"
                className="flex w-20 items-center justify-center bg-secondary transition-colors active:bg-secondary/60 disabled:opacity-35"
              >
                <Plus className="size-6" aria-hidden="true" />
              </button>
            </div>
            {extra > 0 ? (
              <p className="flex items-center gap-1.5 pt-2 text-sm font-medium text-[#A85A04] dark:text-[#FBBF24]">
                <AlertTriangle className="size-4" aria-hidden="true" />
                {extra} more than {guest.paxConfirmed !== null ? 'confirmed' : 'invited'}
              </p>
            ) : null}
          </div>
        ) : null}

        {station === 'checkin' && canAct ? (
          <div>
            <p className="pb-2 text-sm font-medium">
              Gift <span className="font-normal text-muted-foreground">(optional, ask how they would like to give)</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGift(gift === 'envelope' ? null : 'envelope')}
                aria-pressed={gift === 'envelope'}
                className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-base transition-[background-color,border-color] duration-150 ${
                  gift === 'envelope' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'
                }`}
              >
                <Mail className="size-4" aria-hidden="true" />
                Envelope
              </button>
              <button
                type="button"
                onClick={() => {
                  // Choosing it shows it: the guest scans now, and Check In
                  // comes after.
                  setGift('qris')
                  setQrisOpen(true)
                }}
                aria-pressed={gift === 'qris'}
                className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-base transition-[background-color,border-color] duration-150 ${
                  gift === 'qris' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'
                }`}
              >
                <QrCode className="size-4" aria-hidden="true" />
                QRIS
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* The Thumb Rule: what gets used every guest sits at the bottom. */}
      <div className="sticky bottom-0 space-y-2 bg-background pt-4">
        {canAct ? (
          <Button
            type="button"
            className="h-14 w-full text-base"
            disabled={pending}
            onClick={() => (station === 'checkin' ? onAdmit(guest, pax, gift) : onGive(guest))}
          >
            {station === 'checkin' ? 'Check In' : 'Hand over the souvenir'}
          </Button>
        ) : null}
        {onPrintLabel && guest.checkedInAt ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full gap-2"
            disabled={printing}
            onClick={onPrintLabel}
          >
            <Printer className="size-4" aria-hidden="true" />
            {printing ? 'Printing' : 'Print envelope label'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={canAct ? 'outline' : 'default'}
          className={canAct ? 'h-12 w-full' : 'h-14 w-full text-base'}
          onClick={onDismiss}
        >
          {canAct ? 'Cancel' : 'Next guest'}
        </Button>
        {!canAct && canUndo ? (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Corrections are made in the guest list.
          </p>
        ) : null}
      </div>
      {qrisOpen ? <QrisOverlay onClose={() => setQrisOpen(false)} /> : null}
    </div>
  )
}

/** Where an usher goes from the door, and back. */
function StationMenu({ onSettings, onClose }: { onSettings: () => void; onClose: () => void }) {
  const item = 'flex h-14 w-full items-center gap-3 rounded-xl border bg-background px-4 text-base font-medium'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <nav
        aria-label="Menu"
        className="w-full max-w-lg space-y-2 rounded-2xl bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Link href="/dashboard" className={item}>
          <LayoutDashboard className="size-5" aria-hidden="true" />
          Dashboard
        </Link>
        <Link href="/checkin/list" className={item}>
          <ListChecks className="size-5" aria-hidden="true" />
          Door guest list
        </Link>
        <button type="button" onClick={onSettings} className={item}>
          <Settings2 className="size-5" aria-hidden="true" />
          Station setup
        </button>
        <Button type="button" variant="outline" className="h-12 w-full" onClick={onClose}>
          Close
        </Button>
      </nav>
    </div>
  )
}

/**
 * The decorated QRIS, full screen, turned toward the guest.
 *
 * The same card the invitation offers. The tablet faces the guest, so this is
 * for them to scan from their own phone; the usher closes it when they are
 * done and then checks them in.
 */
function QrisOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FAF4F0]" role="dialog" aria-label="QRIS">
      {/* eslint-disable-next-line @next/next/no-img-element -- static, full size, no layout to protect */}
      <img src="/qris-card.png" alt="QRIS for Sita and Fatan" className="min-h-0 flex-1 object-contain p-4" />
      <div className="p-4">
        <Button type="button" className="h-14 w-full text-base" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

type Warning = { title: string; detail: string; severity: 'refused' | 'notice' }

function entryWarning(
  guest: DoorGuest,
  outcome: ReturnType<typeof resolveScan>['outcome']
): Warning | null {
  switch (outcome) {
    case 'already_in':
      return {
        title: 'Already checked in',
        detail: guest.checkedInByName
          ? `${timeOf(guest.checkedInAt)}, by ${guest.checkedInByName}.`
          : `Checked in at ${timeOf(guest.checkedInAt)}.`,
        severity: 'notice',
      }
    case 'not_invited':
      return {
        title: 'Not on the list for this event',
        // Says what fixes it. A refusal with no next step is what jams a door.
        detail: 'They cannot be checked in here. If this is wrong, it has to be corrected in the guest list first.',
        severity: 'refused',
      }
    case 'waitlisted':
      return {
        title: 'Still on the waiting list',
        detail: 'They were never moved up, so no ticket was ever sent. Moving them up in the guest list is what lets them in.',
        severity: 'refused',
      }
    case 'declined':
      return {
        title: 'Recorded as not coming',
        detail: 'No ticket was issued for them. If that is wrong, it has to be changed in the guest list first.',
        severity: 'refused',
      }
    case 'no_rsvp':
      return {
        title: 'No RSVP on record',
        detail: 'Check them in as usual. It is noted for the couple.',
        severity: 'notice',
      }
    default:
      return null
  }
}

function souvenirWarning(
  outcome: ReturnType<typeof resolveSouvenirScan>['outcome'],
  guest: DoorGuest
): Warning | null {
  if (outcome === 'already_claimed') {
    return {
      title: 'Souvenir already collected',
      detail:
        guest.souvenirClaimedVia === 'akad_table'
          ? `Collected at the Akad, ${timeOf(guest.souvenirClaimedAt)}.`
          : `Collected here at ${timeOf(guest.souvenirClaimedAt)}.`,
      severity: 'notice',
    }
  }
  if (outcome === 'not_invited') {
    return {
      title: 'Not on the list for this event',
      detail: 'No souvenir for this one. They should not have got past the door either.',
      severity: 'refused',
    }
  }
  return null
}

function timeOf(iso: string | null): string {
  if (!iso) return 'earlier'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/* ----------------------------------------------------------------- search */

function SearchSheet({
  event,
  onPick,
  onClose,
}: {
  event: WeddingEvent
  onPick: (guest: DoorGuest) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [rows, setRows] = useState<DoorGuest[]>([])
  const [pending, startTransition] = useTransition()

  /**
   * Searches only on submit, never as you type.
   *
   * The tablet faces the guest. Live results would put a list of other
   * people's names in front of whoever is standing at the door, and an empty
   * query used to return the entire roster the moment the sheet opened. The
   * usher types a name and presses enter; nothing is on screen before that.
   */
  function run(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      const result = await searchRoster(q, event)
      setSearched(q)
      setRows('ok' in result ? result.guests : [])
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <form onSubmit={run} className="flex items-center gap-2 border-b p-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Clear the previous answer the moment the question changes, so
            // stale names never sit under a different search term.
            if (rows.length) setRows([])
            if (searched) setSearched('')
          }}
          placeholder="Name or group, then enter"
          enterKeyHint="search"
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11 shrink-0 px-4" disabled={!query.trim() || pending}>
          Search
        </Button>
        <Button type="button" variant="ghost" className="size-11 shrink-0 p-0" onClick={onClose}>
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Close search</span>
        </Button>
      </form>

      {searched ? (
        <ul className="flex-1 divide-y overflow-y-auto">
          {rows.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {g.name}
                    {g.isVip ? <Star className="size-3.5" aria-hidden="true" /> : null}
                  </span>
                  {g.note ? <span className="block text-sm">{g.note}</span> : null}
                  <span className="block text-sm text-muted-foreground">
                    {inviterLabel(g.inviterKey)} · {g.paxConfirmed ?? g.pax} pax
                    {g.checkedInAt ? ' · already in' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Nothing matching “{searched}” on this list.
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="flex-1 p-6 text-center text-sm text-muted-foreground">
          {pending ? 'Searching…' : 'Type a name or group, then press enter.'}
        </p>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- settings */

function StationSettings({
  station,
  event,
  onSave,
}: {
  station: Station
  event: WeddingEvent
  onSave: (next: { station: Station; event: WeddingEvent }) => void
}) {
  const [s, setS] = useState<Station>(station)
  const [e, setE] = useState<WeddingEvent>(event)

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40 p-4">
      <div className="space-y-5 rounded-xl bg-card p-5 shadow-lg">
        <div>
          <h2 className="text-lg font-medium">Which station is this?</h2>
          <p className="text-sm text-muted-foreground">Set once. The tablet remembers.</p>
        </div>

        <Choice
          label="Job"
          value={s}
          options={[
            { value: 'checkin', label: 'Letting people in' },
            { value: 'souvenir', label: 'Handing out souvenirs' },
          ]}
          onChange={setS}
        />
        <Choice
          label="Event"
          value={e}
          options={[
            { value: 'akad', label: 'Akad' },
            { value: 'resepsi', label: 'Resepsi' },
          ]}
          onChange={setE}
        />

        <Button type="button" className="h-12 w-full" onClick={() => onSave({ station: s, event: e })}>
          Start
        </Button>
      </div>
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="pb-2 text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={`h-12 rounded-lg border px-4 text-left transition-[background-color,border-color] duration-150 ${
              o.value === value ? 'border-primary bg-secondary' : 'bg-background'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- unlisted label */

/**
 * An envelope from somebody who is not on the list. The usher copies the name
 * written on the envelope; the label gets a U- code of its own.
 */
function UnlistedLabelSheet({
  pending,
  onPrint,
  onClose,
}: {
  pending: boolean
  onPrint: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-lg space-y-4 rounded-xl bg-card p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onPrint(name)
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Label for someone not on the list</h2>
            <p className="pt-1 text-sm text-muted-foreground">Copy the name written on the envelope.</p>
          </div>
          <Button type="button" variant="ghost" className="size-11 p-0" aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name on the envelope"
          className="h-11 text-base"
          maxLength={80}
        />
        <Button type="submit" className="h-12 w-full gap-2" disabled={pending || !name.trim()}>
          <Printer className="size-4" aria-hidden="true" />
          Print label
        </Button>
      </form>
    </div>
  )
}
