'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ListFilter, Minus, Pencil, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GuestDialog, type GuestDialogState } from './guest-dialog'
import { CapacityStrip, type CapacityRow, type InviterCaps } from './capacity-strip'
import { EDITABLE_FIELDS, EditableCell, useInlineEdit, type EditableField } from './inline-edit'
import { inviterLabel } from '@/lib/inviter-label'
import { nativeFieldClass } from '@/lib/field-class'

export type GuestListRow = {
  id: string
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  isVip: boolean
  isPhysicalInvitation: boolean
  note: string | null
  phone: string | null
  akad: 'none' | 'confirmed' | 'waitlisted'
  resepsi: 'none' | 'confirmed' | 'waitlisted'
  /** RSVP said no. A declined seat is given back, so capacity must not count it. */
  akadDeclined: boolean
  resepsiDeclined: boolean
  isWaitlisted: boolean
}

type SortKey = 'name' | 'pax' | 'inviterKey' | 'side' | 'type'
type TriState = 'any' | 'yes' | 'no'

const selectClass = nativeFieldClass

const SIDE_LABEL = { fatan: 'Fatan', sita: 'Sita' } as const
const EVENT_FILTER_LABEL = { invited: 'invited', waitlisted: 'waiting', not: 'not invited' } as const

function EventCell({ status }: { status: GuestListRow['akad'] }) {
  if (status === 'none') {
    return (
      <span className="flex justify-center text-muted-foreground/50" title="Not invited">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">No</span>
      </span>
    )
  }
  if (status === 'waitlisted') {
    return (
      <span className="flex justify-center">
        <Badge variant="outline" className="text-warning">
          Waiting
        </Badge>
      </span>
    )
  }
  return (
    <span className="flex justify-center text-foreground" title="Invited">
      <Check className="size-4" aria-hidden />
      <span className="sr-only">Yes</span>
    </span>
  )
}

/** The card layout's equivalent of `EventCell`: words, not glyphs, since a
 *  card has room for them and a tick mark alone tells a first-time reader
 *  nothing about which of the two ceremonies it belongs to. */
function StatusWord({ status }: { status: GuestListRow['akad'] }) {
  if (status === 'none') return <span className="text-muted-foreground">Not invited</span>
  if (status === 'waitlisted') return <span className="text-warning">Waiting</span>
  return <span>Invited</span>
}

/**
 * Below `md` the twelve-column table becomes one card per guest. DESIGN.md's
 * No-Sideways Rule forbids horizontal scrolling of primary content on a phone,
 * and the four parents are phone-only users of this exact screen, so the table
 * was unusable for the audience it matters most to. Inline edit is preserved
 * rather than dropped: a parent filling in a missing phone number is the single
 * most common thing this screen is opened for.
 */
function GuestCard({
  guest,
  edit,
  canWrite,
  onEdit,
}: {
  guest: GuestListRow
  edit: ReturnType<typeof useInlineEdit>
  canWrite: boolean
  onEdit: () => void
}) {
  const editing = (field: EditableField) => edit.isEditing(field)
  const phone = edit.valueOf(guest, 'phone')
  const note = edit.valueOf(guest, 'note')

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing('name') ? (
            <EditableCell row={guest} field="name" edit={edit} className="w-full" />
          ) : (
            <p className="font-medium break-words">{edit.valueOf(guest, 'name')}</p>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {inviterLabel(guest.inviterKey)} · {SIDE_LABEL[guest.side]} ·{' '}
            <span className="capitalize">{guest.type}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          {editing('pax') ? (
            <EditableCell row={guest} field="pax" edit={edit} className="w-20 text-right" />
          ) : (
            <p className="text-sm tabular-nums">
              <span className="font-medium">{edit.valueOf(guest, 'pax')}</span> pax
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Akad</dt>
          <dd className="mt-0.5">
            {editing('akad') ? (
              <EditableCell row={guest} field="akad" edit={edit} className="w-full" />
            ) : (
              <StatusWord status={edit.serverValue(guest, 'akad') as GuestListRow['akad']} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Resepsi</dt>
          <dd className="mt-0.5">
            {editing('resepsi') ? (
              <EditableCell row={guest} field="resepsi" edit={edit} className="w-full" />
            ) : (
              <StatusWord status={edit.serverValue(guest, 'resepsi') as GuestListRow['resepsi']} />
            )}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Whatsapp</dt>
          <dd className="mt-0.5">
            {editing('phone') ? (
              <EditableCell row={guest} field="phone" edit={edit} className="w-full" />
            ) : phone ? (
              <span className="tabular-nums">{phone}</span>
            ) : (
              <Badge variant="outline" className="text-warning">
                No phone
              </Badge>
            )}
          </dd>
        </div>
      </dl>

      {guest.isVip || guest.isPhysicalInvitation ? (
        <div className="flex flex-wrap gap-2">
          {guest.isVip ? <Badge variant="secondary">VIP</Badge> : null}
          {guest.isPhysicalInvitation ? <Badge variant="outline">Physical invitation</Badge> : null}
        </div>
      ) : null}

      {editing('note') ? (
        <div>
          <p className="text-xs text-muted-foreground">Note</p>
          <EditableCell row={guest} field="note" edit={edit} className="mt-0.5 w-full" />
        </div>
      ) : note ? (
        <p className="text-sm text-muted-foreground break-words">{note}</p>
      ) : null}

      {canWrite ? (
        <Button variant="outline" className="h-11 w-full" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
    </div>
  )
}

function matchesTriState(value: boolean, filter: TriState): boolean {
  if (filter === 'any') return true
  return filter === 'yes' ? value : !value
}

function SortableHead({
  column,
  label,
  align,
  sortKey,
  sortAsc,
  onSort,
}: {
  column: SortKey
  label: string
  align?: 'right'
  sortKey: SortKey
  sortAsc: boolean
  onSort: (column: SortKey) => void
}) {
  const active = sortKey === column
  return (
    // The arrow glyph is the only sort signal, and it is invisible to a screen
    // reader. aria-sort puts the same fact in the accessibility tree, and the
    // button's own label says what activating it will do.
    <TableHead
      className={align === 'right' ? 'text-right' : undefined}
      aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}, ${active && sortAsc ? 'currently ascending' : active ? 'currently descending' : 'not sorted'}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active ? (
          sortAsc ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
        ) : null}
      </button>
    </TableHead>
  )
}

export function GuestTable({
  guests,
  inviters,
  inviterCaps,
  initialMissingPhone,
  initialInviter,
  canWrite,
  scopedSide = null,
}: {
  guests: GuestListRow[]
  inviters: string[]
  inviterCaps: InviterCaps[]
  initialMissingPhone: boolean
  initialInviter?: string
  canWrite: boolean
  /** Set when every guest this role can read belongs to one side. */
  scopedSide?: 'fatan' | 'sita' | null
}) {
  const [search, setSearch] = useState('')
  const [side, setSide] = useState<'any' | 'fatan' | 'sita'>('any')
  const [inviter, setInviter] = useState(initialInviter ?? 'any')
  const [type, setType] = useState<'any' | 'family' | 'friend'>('any')
  const [akad, setAkad] = useState<'any' | 'invited' | 'not' | 'waitlisted'>('any')
  const [resepsi, setResepsi] = useState<'any' | 'invited' | 'not' | 'waitlisted'>('any')
  const [vip, setVip] = useState<TriState>('any')
  const [physicalInvitation, setPhysicalInvitation] = useState<TriState>('any')
  const [waitlist, setWaitlist] = useState<TriState>('any')
  const [missingPhone, setMissingPhone] = useState<TriState>(initialMissingPhone ? 'yes' : 'any')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dialog, setDialog] = useState<GuestDialogState>({ mode: 'closed' })
  const edit = useInlineEdit(guests)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matchEvent = (status: GuestListRow['akad'], filter: 'any' | 'invited' | 'not' | 'waitlisted') => {
      if (filter === 'any') return true
      if (filter === 'invited') return status === 'confirmed'
      if (filter === 'waitlisted') return status === 'waitlisted'
      return status === 'none'
    }

    const rows = guests.filter((guest) => {
      if (needle) {
        const haystack = `${guest.name} ${guest.note ?? ''} ${guest.phone ?? ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      if (side !== 'any' && guest.side !== side) return false
      if (inviter !== 'any' && guest.inviterKey !== inviter) return false
      if (type !== 'any' && guest.type !== type) return false
      if (!matchEvent(guest.akad, akad)) return false
      if (!matchEvent(guest.resepsi, resepsi)) return false
      if (!matchesTriState(guest.isVip, vip)) return false
      if (!matchesTriState(guest.isPhysicalInvitation, physicalInvitation)) return false
      if (!matchesTriState(guest.isWaitlisted, waitlist)) return false
      if (!matchesTriState(!guest.phone, missingPhone)) return false
      return true
    })

    const direction = sortAsc ? 1 : -1
    return rows.sort((a, b) => {
      if (sortKey === 'pax') return (a.pax - b.pax) * direction
      // Sort the inviter column by what the user sees, not the stored key:
      // "Umi Fatan" belongs under U even though the key says "Mama Fatan".
      if (sortKey === 'inviterKey') {
        return inviterLabel(a.inviterKey).localeCompare(inviterLabel(b.inviterKey)) * direction
      }
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * direction
    })
  }, [
    guests,
    search,
    side,
    inviter,
    type,
    akad,
    resepsi,
    vip,
    physicalInvitation,
    waitlist,
    missingPhone,
    sortKey,
    sortAsc,
  ])

  // Capacity is a fact about the whole list, so it is counted from `guests`
  // and never from `filtered`: narrowing the table must not make room appear.
  // Values come from `serverValue`, which includes edits the server has
  // confirmed but not a half-typed pax still sitting in a draft.
  const capacityRows: CapacityRow[] = useMemo(() => {
    const totals = new Map(inviterCaps.map((cap) => [cap.key, { ...cap, akadUsed: 0, resepsiUsed: 0 }]))
    for (const guest of guests) {
      const row = totals.get(guest.inviterKey)
      if (!row) continue
      const pax = Number(edit.serverValue(guest, 'pax')) || 0
      if (edit.serverValue(guest, 'akad') === 'confirmed' && !guest.akadDeclined) row.akadUsed += pax
      if (edit.serverValue(guest, 'resepsi') === 'confirmed' && !guest.resepsiDeclined) row.resepsiUsed += pax
    }
    return [...totals.values()]
  }, [guests, inviterCaps, edit])

  const shownPax = filtered.reduce((sum, guest) => sum + guest.pax, 0)
  const filtersActive =
    Boolean(search) ||
    side !== 'any' ||
    inviter !== (initialInviter ?? 'any') ||
    type !== 'any' ||
    akad !== 'any' ||
    resepsi !== 'any' ||
    vip !== 'any' ||
    physicalInvitation !== 'any' ||
    waitlist !== 'any' ||
    missingPhone !== 'any'

  function resetFilters() {
    setSearch('')
    setSide('any')
    setInviter(initialInviter ?? 'any')
    setType('any')
    setAkad('any')
    setResepsi('any')
    setVip('any')
    setPhysicalInvitation('any')
    setWaitlist('any')
    setMissingPhone('any')
  }

  // One chip per set filter, so the state stays readable while the panel is
  // closed. Search is not chipped: its value is already visible in the input.
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [
    ...(side !== 'any' ? [{ key: 'side', label: `${SIDE_LABEL[side]} side`, clear: () => setSide('any') }] : []),
    ...(inviter !== 'any' ? [{ key: 'inviter', label: inviterLabel(inviter), clear: () => setInviter('any') }] : []),
    ...(type !== 'any'
      ? [{ key: 'type', label: type === 'family' ? 'Family' : 'Friend', clear: () => setType('any') }]
      : []),
    ...(akad !== 'any'
      ? [{ key: 'akad', label: `Akad: ${EVENT_FILTER_LABEL[akad]}`, clear: () => setAkad('any') }]
      : []),
    ...(resepsi !== 'any'
      ? [{ key: 'resepsi', label: `Resepsi: ${EVENT_FILTER_LABEL[resepsi]}`, clear: () => setResepsi('any') }]
      : []),
    ...(vip !== 'any' ? [{ key: 'vip', label: vip === 'yes' ? 'VIP only' : 'Not VIP', clear: () => setVip('any') }] : []),
    ...(physicalInvitation !== 'any'
      ? [
          {
            key: 'physical',
            label: physicalInvitation === 'yes' ? 'Physical card' : 'Digital only',
            clear: () => setPhysicalInvitation('any'),
          },
        ]
      : []),
    ...(waitlist !== 'any'
      ? [
          {
            key: 'waitlist',
            label: waitlist === 'yes' ? 'On waiting list' : 'Not waiting',
            clear: () => setWaitlist('any'),
          },
        ]
      : []),
    ...(missingPhone !== 'any'
      ? [
          {
            key: 'phone',
            label: missingPhone === 'yes' ? 'Missing phone' : 'Has phone',
            clear: () => setMissingPhone('any'),
          },
        ]
      : []),
  ]

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((previous) => !previous)
      return
    }
    setSortKey(key)
    setSortAsc(true)
  }

  return (
    <div className="space-y-4">
      {/* Everything above the row count pins to the top in edit mode: the
          search box, the field toggles and the capacity meters are what
          someone works against while going down a long column. The negative
          margins let the pinned block cover the page padding, otherwise rows
          would show through the gap on either side. */}
      <div
        className={
          canWrite && edit.editMode
            ? 'sticky top-0 z-20 -mx-4 space-y-4 border-b bg-background px-4 py-3 md:-mx-6 md:px-6'
            : 'space-y-4'
        }
      >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, note or phone"
            className="pl-8"
          />
        </div>

        <Button
          size="sm"
          variant={filtersOpen ? 'secondary' : 'outline'}
          aria-expanded={filtersOpen}
          aria-controls="guest-filters"
          onClick={() => setFiltersOpen((previous) => !previous)}
        >
          <ListFilter className="size-4" aria-hidden /> Filters
          {activeChips.length > 0 ? <span className="tabular-nums">({activeChips.length})</span> : null}
        </Button>

        {filtersActive ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="size-4" aria-hidden /> Reset
          </Button>
        ) : null}

        {canWrite ? (
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={edit.editMode ? 'default' : 'outline'}
              onClick={() => edit.setEditMode(!edit.editMode)}
            >
              <Pencil className="size-4" aria-hidden /> {edit.editMode ? 'Editing' : 'Edit mode'}
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus className="size-4" aria-hidden /> Add guest
            </Button>
          </div>
        ) : null}
      </div>

      {filtersOpen ? (
        <div id="guest-filters" className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* A side-scoped role can only ever read one side, so the filter
              is two dead options and one no-op. Hidden rather than reduced to
              a single choice, which would be a control that cannot change
              anything. */}
          {scopedSide ? null : (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Side</span>
              <select
                className={`${selectClass} w-full`}
                value={side}
                onChange={(e) => setSide(e.target.value as typeof side)}
              >
                <option value="any">Any</option>
                <option value="fatan">Fatan side</option>
                <option value="sita">Sita side</option>
              </select>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Inviter</span>
            <select className={`${selectClass} w-full`} value={inviter} onChange={(e) => setInviter(e.target.value)}>
              <option value="any">Any</option>
              {inviters.map((key) => (
                <option key={key} value={key}>
                  {inviterLabel(key)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
            <select
              className={`${selectClass} w-full`}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="any">Any</option>
              <option value="family">Family</option>
              <option value="friend">Friend</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Akad</span>
            <select
              className={`${selectClass} w-full`}
              value={akad}
              onChange={(e) => setAkad(e.target.value as typeof akad)}
            >
              <option value="any">Any</option>
              <option value="invited">Invited</option>
              <option value="waitlisted">Waiting</option>
              <option value="not">Not invited</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Resepsi</span>
            <select
              className={`${selectClass} w-full`}
              value={resepsi}
              onChange={(e) => setResepsi(e.target.value as typeof resepsi)}
            >
              <option value="any">Any</option>
              <option value="invited">Invited</option>
              <option value="waitlisted">Waiting</option>
              <option value="not">Not invited</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">VIP</span>
            <select className={`${selectClass} w-full`} value={vip} onChange={(e) => setVip(e.target.value as TriState)}>
              <option value="any">Any</option>
              <option value="yes">VIP only</option>
              <option value="no">Not VIP</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Invitation</span>
            <select
              className={`${selectClass} w-full`}
              value={physicalInvitation}
              onChange={(e) => setPhysicalInvitation(e.target.value as TriState)}
            >
              <option value="any">Any</option>
              <option value="yes">Physical only</option>
              <option value="no">Digital only</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Waiting list</span>
            <select
              className={`${selectClass} w-full`}
              value={waitlist}
              onChange={(e) => setWaitlist(e.target.value as TriState)}
            >
              <option value="any">Any</option>
              <option value="yes">On the waiting list</option>
              <option value="no">Not waiting</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Phone</span>
            <select
              className={`${selectClass} w-full`}
              value={missingPhone}
              onChange={(e) => setMissingPhone(e.target.value as TriState)}
            >
              <option value="any">Any</option>
              <option value="yes">Missing phone</option>
              <option value="no">Has phone</option>
            </select>
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                aria-label={`Clear filter: ${chip.label}`}
                onClick={chip.clear}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {canWrite && edit.editMode ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-accent p-3 text-sm">
          <span className="font-medium">Editing:</span>
          {EDITABLE_FIELDS.map(({ field, label }) => (
            <label key={field} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={edit.fields.includes(field)}
                onChange={() => edit.toggleField(field as EditableField)}
              />
              {label}
            </label>
          ))}
          <span className="text-muted-foreground">
            Saves when you leave a cell or press Enter. Escape undoes it.
          </span>
          {edit.pendingCount > 0 ? (
            <span className="flex items-center gap-2">
              <span className="text-warning tabular-nums">{edit.pendingCount} unsaved</span>
              <Button size="sm" variant="outline" onClick={() => edit.saveAll()}>
                Save all
              </Button>
              <Button size="sm" variant="ghost" onClick={edit.discardDrafts}>
                Discard
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}

      {edit.pendingCount > 0 && !edit.editMode ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>
            <span className="font-medium tabular-nums">{edit.pendingCount}</span> unsaved edit
            {edit.pendingCount === 1 ? '' : 's'} restored from before. Nothing was lost.
          </span>
          <Button size="sm" variant="outline" onClick={() => edit.saveAll()}>
            Save them
          </Button>
          <Button size="sm" variant="ghost" onClick={edit.discardDrafts}>
            Discard
          </Button>
        </div>
      ) : null}

      {edit.flags.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <ul className="list-inside list-disc space-y-1">
            {edit.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={edit.dismissFlags}>
            Dismiss
          </Button>
        </div>
      ) : null}

        <CapacityStrip rows={capacityRows} />
      </div>

      <p className="text-sm text-muted-foreground tabular-nums">
        {filtered.length} of {guests.length} entries, {shownPax} pax
      </p>

      {/* Cards below md, table from md up. Both render the same filtered set
          and the same inline-edit state; only the geometry differs. */}
      <div className="space-y-3 md:hidden">
        {filtered.map((guest) => (
          <GuestCard
            key={guest.id}
            guest={guest}
            edit={edit}
            canWrite={canWrite}
            onEdit={() => setDialog({ mode: 'edit', guest })}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            No guest matches these filters.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead column="name" label="Name" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="pax" label="Pax" align="right" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="inviterKey" label="Inviter" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="side" label="Side" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="type" label="Type" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <TableHead className="text-center">Akad</TableHead>
              <TableHead className="text-center">Resepsi</TableHead>
              <TableHead className="text-center">VIP</TableHead>
              <TableHead className="text-center">Invitation</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Whatsapp</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((guest) => (
              <TableRow key={guest.id}>
                <TableCell className="font-medium">
                  {edit.isEditing('name') ? (
                    <EditableCell row={guest} field="name" edit={edit} className="min-w-40" />
                  ) : (
                    edit.valueOf(guest, 'name')
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {edit.isEditing('pax') ? (
                    <EditableCell row={guest} field="pax" edit={edit} className="w-20 text-right" />
                  ) : (
                    edit.valueOf(guest, 'pax')
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{inviterLabel(guest.inviterKey)}</TableCell>
                <TableCell className="text-muted-foreground">{SIDE_LABEL[guest.side]}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{guest.type}</TableCell>
                <TableCell>
                  {edit.isEditing('akad') ? (
                    <EditableCell row={guest} field="akad" edit={edit} className="w-32" />
                  ) : (
                    <EventCell status={edit.serverValue(guest, 'akad') as GuestListRow['akad']} />
                  )}
                </TableCell>
                <TableCell>
                  {edit.isEditing('resepsi') ? (
                    <EditableCell row={guest} field="resepsi" edit={edit} className="w-32" />
                  ) : (
                    <EventCell status={edit.serverValue(guest, 'resepsi') as GuestListRow['resepsi']} />
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {guest.isVip ? <Badge variant="secondary">VIP</Badge> : <span className="text-muted-foreground/50">-</span>}
                </TableCell>
                <TableCell className="text-center">
                  {guest.isPhysicalInvitation ? (
                    <Badge variant="outline">Physical</Badge>
                  ) : (
                    <span className="text-muted-foreground/50">Digital</span>
                  )}
                </TableCell>
                <TableCell
                  className={edit.isEditing('note') ? '' : 'max-w-40 truncate text-muted-foreground'}
                  title={guest.note ?? ''}
                >
                  {edit.isEditing('note') ? (
                    <EditableCell row={guest} field="note" edit={edit} className="min-w-36" />
                  ) : (
                    edit.valueOf(guest, 'note')
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {edit.isEditing('phone') ? (
                    <EditableCell row={guest} field="phone" edit={edit} className="w-44" />
                  ) : edit.valueOf(guest, 'phone') ? (
                    edit.valueOf(guest, 'phone')
                  ) : (
                    <Badge variant="outline" className="text-warning">
                      missing
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => setDialog({ mode: 'edit', guest })}
                    >
                      Edit
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                  No guest matches these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <GuestDialog state={dialog} inviters={inviters} onClose={() => setDialog({ mode: 'closed' })} />
    </div>
  )
}
