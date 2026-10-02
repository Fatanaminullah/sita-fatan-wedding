'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, PanelRightClose, PanelRightOpen, Plus, Search, Trash2, X } from 'lucide-react'
import {
  buildSeating,
  type SeatAssignment,
  type SeatedGuest,
  type SeatingGuest,
  type SeatingTable,
  type SeatingTableView,
} from '@/domain/seating'
import {
  addVipTable,
  removeVipTable,
  renameVipTable,
  seatGuest,
  setVipTableSeats,
  unseatGuest,
} from '@/server/actions/vip-table-actions'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { inviterLabel } from '@/lib/inviter-label'
import { cn } from '@/lib/utils'

type Side = 'all' | 'fatan' | 'sita'

/** Whose seats this person may change. Everyone reads the whole plan. */
export type Manages =
  | { kind: 'all' }
  | { kind: 'side'; side: 'fatan' | 'sita' }
  | { kind: 'inviter'; inviterKey: string }
  | { kind: 'none' }

function managesGuest(manages: Manages, guest: { side: string; inviterKey: string }) {
  if (manages.kind === 'all') return true
  if (manages.kind === 'side') return guest.side === manages.side
  if (manages.kind === 'inviter') return guest.inviterKey === manages.inviterKey
  return false
}
type Result = { ok: true } | { error: string }

// A VIP table at the venue seats eight at most.
const MAX_SEATS = 8

/**
 * The seating plan: tables on the left, unseated VIPs on the right (a bottom
 * sheet on phone). Pick a guest, then a table; on desktop a guest can also be
 * dragged onto a table. Every change is applied here first and saved behind
 * it, so the plan never waits on the network; a failed save puts the server's
 * state back and says why.
 */
export function SeatingBoard({
  tables: serverTables,
  guests,
  assignments: serverAssignments,
  manages,
  canEditTables,
}: {
  tables: SeatingTable[]
  guests: SeatingGuest[]
  assignments: SeatAssignment[]
  /**
   * Whose seats this person changes: the couple anyone, an admin their side,
   * an inviter their own guests, the WO crew nobody. RLS refuses the rest.
   */
  manages: Manages
  /** Adding, renaming, resizing and removing tables: the couple only. */
  canEditTables: boolean
}) {
  const canManage = (guest: { side: string; inviterKey: string }) => managesGuest(manages, guest)
  const readOnly = manages.kind === 'none'
  const router = useRouter()
  const [tables, setTables] = useState(serverTables)
  const [assignments, setAssignments] = useState(serverAssignments)
  // A refresh brings the server's plan; take it over the local copy.
  const [fromServer, setFromServer] = useState({ serverTables, serverAssignments })
  if (fromServer.serverTables !== serverTables || fromServer.serverAssignments !== serverAssignments) {
    setFromServer({ serverTables, serverAssignments })
    setTables(serverTables)
    setAssignments(serverAssignments)
  }

  const [selected, setSelected] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  /** Desktop only: fold the unseated list into a rail to give the tables the width. */
  const [poolCollapsed, setPoolCollapsed] = useState(false)
  // Focus the sheet, not its search field: on a phone a focused field raises
  // the keyboard over the list the guest is about to pick from.
  const sheetRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const seating = useMemo(() => buildSeating(tables, guests, assignments), [tables, guests, assignments])
  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests])
  const selectedGuest = selected ? guestById.get(selected) ?? null : null
  const selectedSeats = selectedGuest
    ? (seating.unseated.find((g) => g.id === selected)?.seats ?? 0)
    : 0

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  function save(work: () => Promise<Result>) {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if ('error' in result) {
        setError(result.error)
        setTables(serverTables)
        setAssignments(serverAssignments)
      }
      router.refresh()
    })
  }

  function seat(guestId: string, tableId: string) {
    setAssignments((current) => [...current.filter((a) => a.guestId !== guestId), { guestId, tableId }])
    setSelected(null)
    save(() => seatGuest(guestId, tableId))
  }

  function unseat(guestId: string) {
    setAssignments((current) => current.filter((a) => a.guestId !== guestId))
    save(() => unseatGuest(guestId))
  }

  function setSeats(id: string, seats: number) {
    if (seats < 1 || seats > MAX_SEATS) return
    setTables((current) => current.map((t) => (t.id === id ? { ...t, seats } : t)))
    save(() => setVipTableSeats(id, seats))
  }

  function rename(id: string, name: string) {
    const table = tables.find((t) => t.id === id)
    const trimmed = name.trim()
    if (!table || !trimmed || trimmed === table.name) return
    setTables((current) => current.map((t) => (t.id === id ? { ...t, name: trimmed } : t)))
    save(() => renameVipTable(id, trimmed))
  }

  function remove(id: string) {
    setTables((current) => current.filter((t) => t.id !== id))
    setAssignments((current) => current.filter((a) => a.tableId !== id))
    save(() => removeVipTable(id))
  }

  function add() {
    save(() => addVipTable())
  }

  function pick(guestId: string) {
    setSelected((current) => (current === guestId ? null : guestId))
    setSheetOpen(false)
  }

  const { totals } = seating

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-xl font-medium">VIP tables</h1>
          <p className="text-sm text-muted-foreground">
            Resepsi, 10 October. A seat is one person, so a party of 2 takes 2 seats.
            {manages.kind === 'none'
              ? ' View only.'
              : manages.kind === 'side'
                ? ' You seat your side’s guests; the rest is view only.'
                : manages.kind === 'inviter'
                  ? ' You seat the guests you invited; the rest is view only.'
                  : ''}
          </p>
        </div>
        <dl className="flex flex-wrap gap-5">
          <Tally label="Tables" value={totals.tables} />
          <Tally label="Seats" value={totals.seats} />
          <Tally label="Seated" value={totals.seated} />
          <Tally
            label="Still to seat"
            value={totals.toSeat}
            note={totals.short > 0 ? `${totals.short} short` : undefined}
            warn={totals.short > 0}
          />
          {totals.overTables > 0 ? (
            <Tally
              label="Over capacity"
              value={totals.overTables}
              note={totals.overTables === 1 ? 'table' : 'tables'}
              warn
            />
          ) : null}
        </dl>
        {!canEditTables ? null : (
          <Button variant="outline" onClick={add} className="hidden md:inline-flex">
            <Plus />
            Add table
          </Button>
        )}
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {selectedGuest ? (
        <div className="sticky top-2 z-10 flex items-center gap-3 rounded-xl bg-secondary py-2 pr-2 pl-3.5 text-sm text-secondary-foreground ring-1 ring-foreground/10">
          <span className="min-w-0 flex-1">
            Seating <b className="font-semibold">{selectedGuest.name}</b>,{' '}
            <span className="font-mono tabular-nums">{selectedSeats}</span> {selectedSeats === 1 ? 'seat' : 'seats'}.
            Pick a table.
          </span>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {/* minmax(0, …) on every track: a truncated name is nowrap, and an auto
          track would grow to fit it, pushing the card off a phone screen. */}
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] items-start gap-4',
          poolCollapsed ? 'md:grid-cols-[minmax(0,1fr)_auto]' : 'md:grid-cols-[minmax(0,1fr)_320px]'
        )}
      >
        <section aria-label="Tables" className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(236px,1fr))]">
          {seating.tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              incoming={selectedGuest ? selectedSeats : 0}
              onSeat={selected ? () => seat(selected, table.id) : null}
              onDrop={(guestId) => seat(guestId, table.id)}
              onUnseat={unseat}
              onSeats={(n) => setSeats(table.id, n)}
              onRename={(name) => rename(table.id, name)}
              onRemove={() => remove(table.id)}
              readOnly={readOnly}
              canEditTable={canEditTables}
              canManage={canManage}
            />
          ))}
          {!canEditTables ? null : (
          <button
            type="button"
            onClick={add}
            className="flex min-h-44 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Plus className="size-4" />
            Add table
          </button>
          )}
        </section>

        {poolCollapsed ? (
          <button
            type="button"
            onClick={() => setPoolCollapsed(false)}
            aria-label={`Show unseated guests (${seating.unseated.length})`}
            title="Show unseated guests"
            className="sticky top-4 hidden w-11 flex-col items-center gap-3 rounded-xl bg-card py-3 text-muted-foreground ring-1 ring-foreground/10 hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
          >
            <PanelRightOpen className="size-4" />
            <span className="font-mono text-sm font-medium text-foreground tabular-nums">{seating.unseated.length}</span>
            <span className="text-xs font-medium [writing-mode:vertical-rl]">Unseated</span>
          </button>
        ) : (
          <aside
            aria-label="Unseated VIP guests"
            className="sticky top-4 hidden max-h-[calc(100vh-2rem)] flex-col rounded-xl bg-card ring-1 ring-foreground/10 md:flex"
          >
            <Pool
              unseated={seating.unseated}
              declined={seating.declined}
              selected={selected}
              onPick={pick}
              onDragStart={setSelected}
              onCollapse={() => setPoolCollapsed(true)}
              canManage={canManage}
              readOnly={readOnly}
            />
          </aside>
        )}
      </div>

      {/* Phone: the list lives in a sheet, opened from the bottom where the thumb is. */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:hidden">
        {readOnly ? (
          <Button variant="outline" className="h-11 flex-1" onClick={() => setSheetOpen(true)}>
            Unseated guests <span className="font-mono tabular-nums">({seating.unseated.length})</span>
          </Button>
        ) : (
          <>
            {canEditTables ? (
              <Button variant="outline" className="h-11 flex-1" onClick={add}>
                <Plus />
                Table
              </Button>
            ) : null}
            <Button className="h-11 flex-[2]" onClick={() => setSheetOpen(true)}>
              Seat a guest <span className="font-mono tabular-nums">({seating.unseated.length})</span>
            </Button>
          </>
        )}
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          ref={sheetRef}
          initialFocus={sheetRef}
          side="bottom"
          className="max-h-[80vh] gap-0 rounded-t-xl p-0"
        >
          <SheetTitle className="sr-only">Unseated VIP guests</SheetTitle>
          <Pool
            unseated={seating.unseated}
            declined={seating.declined}
            selected={selected}
            onPick={pick}
            onDragStart={setSelected}
            canManage={canManage}
            readOnly={readOnly}
            touch
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Tally({ label, value, note, warn }: { label: string; value: number; note?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono text-base font-medium tabular-nums', warn && 'text-warning')}>
        {value}
        {note ? <span className="ml-1 font-sans text-xs">({note})</span> : null}
      </dd>
    </div>
  )
}

function InviterChip({ inviterKey }: { inviterKey: string }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[11px] font-medium text-muted-foreground ring-1 ring-border ring-inset">
      {inviterLabel(inviterKey)}
    </span>
  )
}

function TableCard({
  table,
  incoming,
  onSeat,
  onDrop,
  onUnseat,
  onSeats,
  onRename,
  onRemove,
  readOnly,
  canEditTable,
  canManage,
}: {
  table: SeatingTableView
  /** Seats nobody: no drop target. */
  readOnly: boolean
  /** Rename, resize, remove: the couple only. */
  canEditTable: boolean
  canManage: (guest: { side: string; inviterKey: string }) => boolean
  incoming: number
  onSeat: (() => void) | null
  onDrop: (guestId: string) => void
  onUnseat: (guestId: string) => void
  onSeats: (seats: number) => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const wouldOverflow = onSeat !== null && table.used + incoming > table.seats
  const status =
    table.over > 0 ? (
      <span className="inline-flex h-5 items-center rounded-full bg-warning/10 px-2 text-xs font-medium text-warning">
        Over by {table.over}
      </span>
    ) : table.free === 0 ? (
      <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
        Full
      </span>
    ) : (
      <span className="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
        <span className="mr-1 font-mono tabular-nums">{table.free}</span> open
      </span>
    )

  return (
    <article
      onClick={(e) => {
        if (!onSeat || (e.target as HTMLElement).closest('input,button')) return
        onSeat()
      }}
      onKeyDown={(e) => {
        if (onSeat && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          onSeat()
        }
      }}
      onDragOver={(e) => {
        if (readOnly) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDrop(id)
      }}
      tabIndex={onSeat ? 0 : undefined}
      role={onSeat ? 'button' : undefined}
      aria-label={onSeat ? `Seat here: ${table.name}` : undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow focus-visible:outline-none',
        onSeat && 'cursor-pointer hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary',
        onSeat && wouldOverflow && 'hover:ring-warning focus-visible:ring-warning',
        dragOver && (wouldOverflow ? 'ring-2 ring-warning' : 'ring-2 ring-primary')
      )}
    >
      <div className="flex items-center gap-1.5 pt-2.5 pr-2.5 pl-3.5">
        {!canEditTable ? (
          <h3 className="min-w-0 flex-1 truncate py-0.5 text-base font-medium">{table.name}</h3>
        ) : (
        <input
          key={table.name}
          defaultValue={table.name}
          aria-label="Table name"
          maxLength={60}
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              e.currentTarget.value = table.name
              e.currentTarget.blur()
            }
          }}
          className="-ml-1.5 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-base font-medium hover:border-border focus:border-primary focus:outline-none"
        />
        )}
        {status}
      </div>

      <div className="grid place-items-center pt-1 pb-0.5">
        <TableArt seats={table.seats} used={table.used} incoming={onSeat ? incoming : 0} />
      </div>

      <ul className="flex flex-col px-2">
        {table.guests.length === 0 ? (
          <li className="py-2 text-center text-sm text-muted-foreground">Nobody seated yet</li>
        ) : (
          table.guests.map((guest) => (
            <SeatedRow
              key={guest.id}
              guest={guest}
              onUnseat={canManage(guest) ? () => onUnseat(guest.id) : null}
            />
          ))
        )}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-2 rounded-b-xl border-t border-border bg-secondary/50 py-2 pr-2.5 pl-3.5">
        {!canEditTable ? (
          <>
            <span className="text-xs font-medium text-muted-foreground">Seats</span>
            <span className="py-1 font-mono text-sm font-medium tabular-nums">{table.seats}</span>
          </>
        ) : confirming ? (
          <>
            <span className="text-xs text-muted-foreground">
              Remove? {table.guests.length > 0 ? 'Its guests go back to unseated.' : ''}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-10 md:h-7" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button variant="destructive" size="sm" className="h-10 md:h-7" onClick={onRemove}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-muted-foreground">Seats</span>
            <div
              role="group"
              aria-label={`Seats at ${table.name}`}
              className="inline-flex items-center rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => onSeats(table.seats - 1)}
                disabled={table.seats <= 1}
                aria-label="One seat fewer"
                className="grid size-10 place-items-center rounded-md hover:bg-accent active:translate-y-px disabled:opacity-40 md:size-7"
              >
                <Minus className="size-4" />
              </button>
              <output className="min-w-7 text-center font-mono text-sm font-medium tabular-nums">{table.seats}</output>
              <button
                type="button"
                onClick={() => onSeats(table.seats + 1)}
                disabled={table.seats >= MAX_SEATS}
                aria-label="One seat more"
                className="grid size-10 place-items-center rounded-md hover:bg-accent active:translate-y-px disabled:opacity-40 md:size-7"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirming(true)}
              aria-label={`Remove ${table.name}`}
              className="size-10 text-destructive hover:bg-destructive/10 hover:text-destructive md:size-8"
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </article>
  )
}

function SeatedRow({ guest, onUnseat }: { guest: SeatedGuest; onUnseat: (() => void) | null }) {
  const why = !guest.isVip
    ? 'No longer VIP'
    : guest.resepsiRsvp === 'not_attending'
      ? 'Not coming'
      : 'Not on the Resepsi list'
  return (
    <li className="group flex min-h-9 items-center gap-2 border-t border-border px-1.5 py-1 first:border-t-0">
      <span className={cn('min-w-0 flex-1 truncate text-sm', guest.stale && 'text-muted-foreground line-through')}>
        {guest.name}
      </span>
      {guest.stale ? (
        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-warning/10 px-2 text-xs font-medium text-warning">
          {why}
        </span>
      ) : (
        <InviterChip inviterKey={guest.inviterKey} />
      )}
      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{guest.seats}</span>
      {onUnseat ? (
      <button
        type="button"
        onClick={onUnseat}
        aria-label={`Unseat ${guest.name}`}
        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:size-6 md:opacity-0 md:group-hover:opacity-100"
      >
        <X className="size-4" />
      </button>
      ) : null}
    </li>
  )
}

/** Seats round the table, filled in order; an overflow is drawn in amber past the last real seat. */
function TableArt({ seats, used, incoming }: { seats: number; used: number; incoming: number }) {
  const count = Math.max(seats, used + incoming)
  const cx = 66
  const cy = 66
  const r = 52
  const dots = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    const over = i >= seats
    if (i < used) {
      return <circle key={i} cx={x} cy={y} r={10} className={over ? 'fill-warning' : 'fill-foreground'} />
    }
    if (i < used + incoming) {
      return (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={9}
          fill="none"
          strokeWidth={2}
          strokeDasharray="3 3"
          className={over ? 'stroke-warning' : 'stroke-primary'}
        />
      )
    }
    return <circle key={i} cx={x} cy={y} r={9} fill="none" strokeWidth={1.5} className="stroke-border" />
  })
  return (
    <svg viewBox="0 0 132 132" className="size-28 overflow-visible md:size-32" role="img" aria-label={`${used} of ${seats} seats taken`}>
      <circle cx={cx} cy={cy} r={32} className="fill-accent stroke-border" />
      {dots}
      <text x={cx} y={cy + 1} textAnchor="middle" className="fill-foreground font-mono text-[15px] font-medium">
        {used}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">
        of {seats}
      </text>
    </svg>
  )
}

function Pool({
  unseated,
  declined,
  selected,
  onPick,
  onDragStart,
  onCollapse,
  canManage,
  readOnly = false,
  touch = false,
}: {
  unseated: SeatedGuest[]
  declined: SeatedGuest[]
  selected: string | null
  onPick: (guestId: string) => void
  onDragStart: (guestId: string | null) => void
  /** Present on desktop, where the list can fold into a rail. */
  onCollapse?: () => void
  canManage: (guest: { side: string; inviterKey: string }) => boolean
  readOnly?: boolean
  touch?: boolean
}) {
  const [side, setSide] = useState<Side>('all')
  const [query, setQuery] = useState('')
  const [showDeclined, setShowDeclined] = useState(false)
  const needle = query.trim().toLowerCase()
  const rows = (showDeclined ? [...unseated, ...declined] : unseated).filter(
    (g) => (side === 'all' || g.side === side) && (!needle || g.name.toLowerCase().includes(needle))
  )
  const pax = unseated.reduce((sum, g) => sum + g.seats, 0)

  return (
    <>
      <div className={cn('flex flex-col gap-2.5 border-b border-border p-3.5 pb-2.5', touch && 'pt-4')}>
        {/* On phone the sheet's close button sits top right, over this row. */}
        <h2 className={cn('flex items-center justify-between text-base font-medium', touch && 'pr-10')}>
          Unseated
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-normal text-muted-foreground tabular-nums">
              {unseated.length} · {pax} pax
            </span>
            {onCollapse ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCollapse}
                aria-label="Hide unseated guests"
                title="Hide unseated guests"
                className="-mr-1.5 text-muted-foreground"
              >
                <PanelRightClose />
              </Button>
            ) : null}
          </span>
        </h2>
        <label
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50',
            touch ? 'h-11' : 'h-8'
          )}
        >
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search VIP guests"
            autoComplete="off"
            className={cn('min-w-0 flex-1 bg-transparent text-foreground outline-none', touch ? 'text-base' : 'text-sm')}
          />
        </label>
        <div role="group" aria-label="Side" className="flex gap-1">
          {(['all', 'fatan', 'sita'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={side === value}
              onClick={() => setSide(value)}
              className={cn(
                'rounded-full px-2.5 text-xs font-medium ring-1 ring-border ring-inset focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                touch ? 'h-8 px-3.5' : 'h-6',
                side === value && 'bg-primary text-primary-foreground ring-0'
              )}
            >
              {value === 'all' ? 'All' : value === 'fatan' ? 'Fatan' : 'Sita'}
            </button>
          ))}
        </div>
      </div>

      <ul
        role="listbox"
        aria-label={readOnly ? 'Unseated VIP guests' : 'Pick a guest, then a table'}
        className="flex-1 overflow-auto p-1.5"
      >
        {rows.length === 0 ? (
          <li className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            {unseated.length === 0 ? 'Every VIP guest has a seat.' : 'No VIP guest matches that search.'}
          </li>
        ) : (
          rows.map((guest) => {
            const no = guest.resepsiRsvp === 'not_attending'
            // Read-only rows are information, not choices.
            const inert = no || !canManage(guest)
            const isSelected = selected === guest.id
            const shown = no ? guest.pax : guest.seats
            return (
              <li
                key={guest.id}
                role="option"
                aria-selected={isSelected}
                aria-disabled={inert || undefined}
                tabIndex={inert ? undefined : 0}
                draggable={!inert && !touch}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', guest.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStart(guest.id)
                }}
                onDragEnd={() => onDragStart(null)}
                onClick={() => !inert && onPick(guest.id)}
                onKeyDown={(e) => {
                  if (!inert && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onPick(guest.id)
                  }
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  touch ? 'min-h-13 py-3' : 'py-2',
                  no ? 'opacity-55' : !inert && 'cursor-pointer hover:bg-accent',
                  isSelected && 'bg-secondary text-secondary-foreground hover:bg-secondary'
                )}
              >
                <span className="flex w-[30px] shrink-0 flex-wrap gap-[3px]" aria-hidden>
                  {Array.from({ length: shown }, (_, i) => (
                    <i
                      key={i}
                      className={cn('size-2 rounded-full', isSelected ? 'bg-secondary-foreground' : 'bg-foreground')}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-medium">{guest.name}</b>
                  <small className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <InviterChip inviterKey={guest.inviterKey} />
                    <span>
                      <span className="font-mono tabular-nums">{shown}</span> {shown === 1 ? 'seat' : 'seats'}
                    </span>
                  </small>
                </span>
                <RsvpPill rsvp={guest.resepsiRsvp} />
              </li>
            )
          })
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        {declined.length > 0 ? (
          <>
            <span>
              <span className="font-mono tabular-nums">{declined.length}</span> said not coming,{' '}
              {showDeclined ? 'shown' : 'hidden'}
            </span>
            <button
              type="button"
              onClick={() => setShowDeclined((v) => !v)}
              className="font-medium text-primary underline underline-offset-3"
            >
              {showDeclined ? 'Hide' : 'Show'}
            </button>
          </>
        ) : (
          <span>Not-coming guests are left out.</span>
        )}
      </div>
    </>
  )
}

function RsvpPill({ rsvp }: { rsvp: SeatingGuest['resepsiRsvp'] }) {
  if (rsvp === 'attending') {
    return (
      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
        Coming
      </span>
    )
  }
  if (rsvp === 'not_attending') {
    return (
      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-destructive/10 px-2 text-xs font-medium text-destructive">
        Not coming
      </span>
    )
  }
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
      No answer
    </span>
  )
}
