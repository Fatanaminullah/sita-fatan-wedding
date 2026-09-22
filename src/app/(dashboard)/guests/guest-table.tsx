'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ListFilter, Link2, Minus, MoreHorizontal, Pencil, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { describeSendFailure } from '@/domain/whatsapp'

/**
 * True when any invitation this guest holds is still unanswered. A guest
 * invited to nothing is not unanswered: there is nothing to answer, which is a
 * data problem rather than a missing reply.
 */
function isUnanswered(guest: GuestListRow): boolean {
  const held = [
    guest.akad !== 'none' ? guest.akadRsvp : null,
    guest.resepsi !== 'none' ? guest.resepsiRsvp : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null)
  if (held.length === 0) return false
  return held.some((status) => status === 'pending')
}

export type GuestListRow = {
  id: string
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  isVip: boolean
  isPhysicalInvitation: boolean
  /**
   * Which version of the invitation this guest opens: the non-hijab one,
   * with the unveiled photographs, the second gallery set and both event
   * doors. Superadmin sets it, and it defaults from the inviter.
   */
  candid: boolean
  /** The public slug, for /to/<slug>. */
  slug: string | null
  note: string | null
  phone: string | null
  /** Which language variant of a WhatsApp template this guest receives. */
  language: 'en' | 'id'
  akad: 'none' | 'confirmed' | 'waitlisted'
  resepsi: 'none' | 'confirmed' | 'waitlisted'
  /** RSVP said no. A declined seat is given back, so capacity must not count it. */
  akadDeclined: boolean
  resepsiDeclined: boolean
  /**
   * The answer on file per event. The door admits only 'attending', so
   * 'pending' here is a guest who would be refused on the day.
   */
  akadRsvp: 'pending' | 'attending' | 'not_attending' | null
  resepsiRsvp: 'pending' | 'attending' | 'not_attending' | null
  akadPaxConfirmed: number | null
  resepsiPaxConfirmed: number | null
  isWaitlisted: boolean
  /** How far the invitation got at WhatsApp. 'none' means never attempted. */
  inviteDelivery: 'none' | 'failed' | 'sent' | 'delivered' | 'read'
  inviteSentAt: string | null
  /** Why the furthest attempt failed, in Meta's words. */
  inviteError: string | null
  /** When they first opened their own link, bots excluded. */
  firstOpenedAt: string | null
}

type SortKey = 'name' | 'pax' | 'inviterKey' | 'side' | 'type' | 'candid'
type TriState = 'any' | 'yes' | 'no'

/**
 * The filter state, and the query string it lives in.
 *
 * Every filter is in the URL so a view can be sent to somebody: "the guests
 * on Sita's side with no number yet" is a link, not a list of instructions.
 * Reload, back and forward all land on the same table.
 *
 * Three keys keep the names page.tsx already reads server side. The rest are
 * short because they are typed and read by people.
 */
type Filters = {
  search: string
  side: 'any' | 'fatan' | 'sita'
  inviter: string
  type: 'any' | 'family' | 'friend'
  photos: 'any' | 'hijab' | 'nonhijab'
  akad: 'any' | 'invited' | 'not' | 'waitlisted'
  resepsi: 'any' | 'invited' | 'not' | 'waitlisted'
  vip: TriState
  physicalInvitation: TriState
  waitlist: TriState
  missingPhone: TriState
  unanswered: TriState
  delivery: 'any' | GuestListRow['inviteDelivery'] | 'notopened'
}

const FILTER_DEFAULTS: Filters = {
  search: '',
  side: 'any',
  inviter: 'any',
  type: 'any',
  photos: 'any',
  akad: 'any',
  resepsi: 'any',
  vip: 'any',
  physicalInvitation: 'any',
  waitlist: 'any',
  missingPhone: 'any',
  unanswered: 'any',
  delivery: 'any',
}

/** Filter key to query key. `inviter`, `missingPhone` and `unanswered` are fixed by page.tsx. */
const PARAM: Record<keyof Filters, string> = {
  search: 'q',
  side: 'side',
  inviter: 'inviter',
  type: 'type',
  photos: 'photos',
  akad: 'akad',
  resepsi: 'resepsi',
  vip: 'vip',
  physicalInvitation: 'physical',
  waitlist: 'waitlist',
  missingPhone: 'missingPhone',
  unanswered: 'unanswered',
  delivery: 'delivery',
}

/**
 * page.tsx tests `missingPhone === '1'` and `unanswered === '1'`, so those two
 * are written as 1 and 0 rather than yes and no. Reading accepts both, because
 * a link from the dashboard carries 1 and a link copied from this screen used
 * to carry neither.
 */
const TRI_OUT: Record<TriState, string> = { any: '', yes: '1', no: '0' }
function readTri(raw: string | null): TriState | null {
  if (raw === '1' || raw === 'yes') return 'yes'
  if (raw === '0' || raw === 'no') return 'no'
  return null
}
const SERVER_TRI: Array<keyof Filters> = ['missingPhone', 'unanswered']

/**
 * The address bar as it is on first render.
 *
 * Anything absent, empty or unrecognised falls back to the default, so a
 * hand-edited or truncated link degrades to a wider view rather than an empty
 * table or a crash.
 */
function readFilters(defaults: Filters): Filters {
  if (typeof window === 'undefined') return defaults
  const params = new URLSearchParams(window.location.search)
  const next = { ...defaults }

  for (const key of Object.keys(PARAM) as Array<keyof Filters>) {
    const raw = params.get(PARAM[key])
    if (raw === null || raw === '') continue

    if (SERVER_TRI.includes(key) || key === 'vip' || key === 'physicalInvitation' || key === 'waitlist') {
      const tri = readTri(raw)
      if (tri) (next[key] as TriState) = tri
      continue
    }
    if (key === 'search') {
      next.search = raw
      continue
    }
    if (key === 'inviter') {
      next.inviter = raw
      continue
    }
    // The remaining filters are closed sets. An unknown value is ignored
    // rather than trusted: `type=nonsense` must not filter every guest away.
    const allowed = ALLOWED[key]
    if (allowed?.includes(raw)) (next[key] as string) = raw
  }
  return next
}

/** The legal values of each closed-set filter, used to reject a bad link. */
const ALLOWED: Partial<Record<keyof Filters, readonly string[]>> = {
  side: ['any', 'fatan', 'sita'],
  type: ['any', 'family', 'friend'],
  photos: ['any', 'hijab', 'nonhijab'],
  akad: ['any', 'invited', 'not', 'waitlisted'],
  resepsi: ['any', 'invited', 'not', 'waitlisted'],
  delivery: ['any', 'pending', 'sent', 'delivered', 'read', 'failed', 'notopened'],
}

/** Only what differs from the defaults, so an untouched screen has a clean URL. */
function writeFilters(filters: Filters, defaults: Filters): string {
  const params = new URLSearchParams()
  for (const key of Object.keys(PARAM) as Array<keyof Filters>) {
    const value = filters[key]
    if (value === defaults[key] || value === '' || value === 'any') continue
    const out =
      SERVER_TRI.includes(key) || key === 'vip' || key === 'physicalInvitation' || key === 'waitlist'
        ? TRI_OUT[value as TriState]
        : String(value)
    if (out) params.set(PARAM[key], out)
  }
  return params.toString()
}

const selectClass = nativeFieldClass

/**
 * The two columns that stay put while the rest scrolls sideways.
 *
 * Fourteen columns do not fit a laptop, and the thing every other column is
 * about is the name, so reading the far right meant scrolling the name off
 * the screen (owner, 2026-09-22). Name pins left, the actions pin right, and
 * both carry the row's own background or the cells underneath show through.
 * `bg-card` on the head, `bg-inherit` on the cells: a row may be tinted
 * (hover, the waitlist) and the pinned cell has to be tinted with it.
 */
const STICKY_NAME = 'sticky left-0 z-20 bg-card'
const STICKY_ACTIONS = 'sticky right-0 z-20 bg-card text-right'
/* The cells' backgrounds are painted by `tr.guests-row` in globals.css: a
   pinned cell has to be opaque, and the row's own hover tint is not. */
const STICKY_NAME_CELL = 'sticky left-0 z-10'
const STICKY_ACTIONS_CELL = 'sticky right-0 z-10 text-right'

const SIDE_LABEL = { fatan: 'Fatan', sita: 'Sita' } as const
const LANGUAGE_LABEL = { en: 'English', id: 'Indonesian' } as const
const EVENT_FILTER_LABEL = { invited: 'invited', waitlisted: 'waiting', not: 'not invited' } as const

const DELIVERY_LABEL = {
  none: 'Not sent',
  failed: 'Failed',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
} as const

/** A date a person can act on, not an ISO string. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  })
}

/**
 * How far the invitation got, and whether they opened it.
 *
 * One cell rather than two columns: delivery and the click are one story, read
 * left to right, and the interesting cases are the ends of it. A failure is red
 * AND says "Failed" AND carries Meta's own reason, per the Never-Color-Alone
 * Rule, because a failed invitation is a guest who currently believes they were
 * not invited.
 */
function InviteCell({ guest }: { guest: GuestListRow }) {
  const sentOn = shortDate(guest.inviteSentAt)
  const openedOn = shortDate(guest.firstOpenedAt)
  const failure = describeSendFailure(guest.inviteError)

  if (guest.inviteDelivery === 'none') {
    return <span className="text-sm text-muted-foreground">Not sent</span>
  }

  return (
    <span className="block text-sm">
      <span
        className={guest.inviteDelivery === 'failed' ? 'font-medium text-destructive' : undefined}
        title={guest.inviteError ?? undefined}
      >
        {DELIVERY_LABEL[guest.inviteDelivery]}
      </span>
      {failure ? (
        // Short reason on the line, the action under it, Meta's full text on
        // hover. Capped in width so a long reason never runs into the next
        // three columns.
        <span className="block max-w-[15rem] text-xs text-muted-foreground" title={guest.inviteError ?? undefined}>
          <span className="block truncate">{failure.short}</span>
          {failure.action ? <span className="block truncate">{failure.action}</span> : null}
        </span>
      ) : (
        <span className="block text-xs text-muted-foreground">
          {openedOn ? `opened ${openedOn}` : sentOn ? sentOn : 'not opened yet'}
        </span>
      )}
    </span>
  )
}

/**
 * The answer on file, with the pax it confirms.
 *
 * Per event, because a guest can come to the Akad and not the Resepsi, but
 * collapsed to one line when both answers agree: two identical rows in a narrow
 * cell is noise, and the disagreement is the only case worth the space.
 */
function AnswerCell({ guest }: { guest: GuestListRow }) {
  const held = (['akad', 'resepsi'] as const).filter((event) => guest[event] !== 'none')
  if (held.length === 0) {
    return <span className="text-sm text-muted-foreground">Not invited</span>
  }

  const answerOf = (event: 'akad' | 'resepsi') =>
    event === 'akad' ? guest.akadRsvp : guest.resepsiRsvp
  const paxOf = (event: 'akad' | 'resepsi') =>
    event === 'akad' ? guest.akadPaxConfirmed : guest.resepsiPaxConfirmed

  function line(answer: ReturnType<typeof answerOf>, pax: number | null) {
    if (answer === 'attending') {
      return (
        <span>
          Coming
          {pax !== null ? (
            <>
              , <span className="font-mono tabular-nums">{pax}</span> pax
            </>
          ) : null}
        </span>
      )
    }
    if (answer === 'not_attending') return <span>Not coming</span>
    return <span className="text-muted-foreground">No answer</span>
  }

  const agree =
    held.length === 2 &&
    answerOf('akad') === answerOf('resepsi') &&
    paxOf('akad') === paxOf('resepsi')

  if (held.length === 1 || agree) {
    return <span className="text-sm">{line(answerOf(held[0]), paxOf(held[0]))}</span>
  }

  return (
    <span className="block text-sm">
      {held.map((event) => (
        <span key={event} className="block">
          <span className="text-xs text-muted-foreground">
            {event === 'akad' ? 'Akad' : 'Resepsi'}:{' '}
          </span>
          {line(answerOf(event), paxOf(event))}
        </span>
      ))}
    </span>
  )
}

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
 * The guest's own invitation address, on the clipboard.
 *
 * The four parents chase their own lists over WhatsApp by hand, and until
 * now the only way to get someone's link out of this app was to send the
 * whole wave. The link is per guest and never changes once sent, so handing
 * it over is the ordinary case, not a workaround.
 *
 * A guest with no slug yet cannot have one copied, which is a real state
 * rather than an error: it is what an imported row looks like before the
 * slug is minted.
 */
function CopyLink({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!url) return <span className="text-xs text-muted-foreground">No link</span>
  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0"
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          // A browser that refuses the clipboard (an insecure origin, or a
          // permission denied) still shows the address, so it can be read
          // off the screen or copied by hand.
          window.prompt('Copy this link', url)
          return
        }
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}

/**
 * Everything a row can do, behind one control.
 *
 * Two links took the width of a column each and grew every time the list
 * learned a new verb. A menu costs one press for the same actions and keeps
 * the pinned column narrow, which matters because it is pinned: whatever
 * sits here is width the table never gets back.
 */
function RowActions({ url, onEdit, name }: { url: string | null; onEdit: () => void; name: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!url}
          // The menu closes on its own; the label has to say what happened
          // before it does, so the copy is confirmed in place.
          closeOnClick={false}
          onClick={async () => {
            if (!url) return
            try {
              await navigator.clipboard.writeText(url)
            } catch {
              window.prompt('Copy this link', url)
              return
            }
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          }}
        >
          <Link2 className="size-4" />
          {url ? (copied ? 'Copied' : 'Copy link') : 'No link yet'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
  canSetCandid,
  onEdit,
  origin,
}: {
  guest: GuestListRow
  edit: ReturnType<typeof useInlineEdit>
  canWrite: boolean
  /** Superadmin only, same gate the column and the dialog toggle use. */
  canSetCandid: boolean
  onEdit: () => void
  origin: string
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
            <span className="capitalize">{guest.type}</span> ·{' '}
            {LANGUAGE_LABEL[edit.serverValue(guest, 'language') as GuestListRow['language']]}
            {canSetCandid ? <> · {guest.candid ? 'Non-hijab' : 'Hijab'}</> : null}
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
        {editing('language') ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Language</dt>
            <dd className="mt-0.5">
              <EditableCell row={guest} field="language" edit={edit} className="w-full" />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Invitation sent</dt>
          <dd className="mt-0.5">
            <InviteCell guest={guest} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Their answer</dt>
          <dd className="mt-0.5">
            <AnswerCell guest={guest} />
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
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-11 flex-1" onClick={onEdit}>
            Edit
          </Button>
          <div className="flex h-11 items-center">
            <CopyLink url={guest.slug ? `${origin}/to/${guest.slug}` : null} />
          </div>
        </div>
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
  className,
  sortKey,
  sortAsc,
  onSort,
}: {
  column: SortKey
  label: string
  align?: 'right'
  className?: string
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
      className={[align === 'right' ? 'text-right' : '', className ?? ''].filter(Boolean).join(' ') || undefined}
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
  initialUnanswered = false,
  initialInviter,
  canWrite,
  canAnswerRsvp = false,
  canSetCandid = false,
  scopedSide = null,
  origin,
}: {
  guests: GuestListRow[]
  inviters: string[]
  inviterCaps: InviterCaps[]
  initialMissingPhone: boolean
  initialUnanswered?: boolean
  initialInviter?: string
  canWrite: boolean
  canAnswerRsvp?: boolean
  /** Superadmin only: the non-hijab flag on the edit dialog. */
  canSetCandid?: boolean
  /** Where the invitation lives, for the copyable link. */
  origin: string
  /** Set when every guest this role can read belongs to one side. */
  scopedSide?: 'fatan' | 'sita' | null
}) {
  /**
   * Every filter in one object, and the object in the URL.
   *
   * One state rather than thirteen because the URL is written from whatever
   * changed last: with separate states, two setters firing in the same tick
   * would each build a query string from a stale copy of the others and the
   * second would erase the first.
   *
   * `inviter`, `missingPhone` and `unanswered` keep the names page.tsx already
   * reads server side, so a link works whether it is followed cold or typed
   * into a tab that is already here.
   */
  const defaults: Filters = {
    ...FILTER_DEFAULTS,
    inviter: initialInviter ?? 'any',
    missingPhone: initialMissingPhone ? 'yes' : 'any',
    unanswered: initialUnanswered ? 'yes' : 'any',
  }
  // Read once, on the first render, from the address bar rather than from the
  // props: a reload must restore what the person was actually looking at.
  const [filters, setFilters] = useState<Filters>(() => readFilters(defaults))

  const {
    search,
    side,
    inviter,
    type,
    photos,
    akad,
    resepsi,
    vip,
    physicalInvitation,
    waitlist,
    missingPhone,
    unanswered,
    delivery,
  } = filters

  /** One setter per filter, same names the controls already call. */
  function setOne<K extends keyof Filters>(key: K) {
    return (value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }))
  }
  const setSearch = setOne('search')
  const setSide = setOne('side')
  const setInviter = setOne('inviter')
  const setType = setOne('type')
  const setPhotos = setOne('photos')
  const setAkad = setOne('akad')
  const setResepsi = setOne('resepsi')
  const setVip = setOne('vip')
  const setPhysicalInvitation = setOne('physicalInvitation')
  const setWaitlist = setOne('waitlist')
  const setMissingPhone = setOne('missingPhone')
  const setUnanswered = setOne('unanswered')
  const setDelivery = setOne('delivery')

  /**
   * Native replaceState, not router.replace.
   *
   * page.tsx is a server component that reads these same params, so a real
   * navigation would re-run it and re-query all 366 guests on every keystroke
   * in the search box. History is updated in place instead: the address bar is
   * correct and shareable, and nothing refetches.
   */
  useEffect(() => {
    const query = writeFilters(filters, defaults)
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next)
    }
    // defaults is rebuilt every render; the filters are what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])
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
      if (photos === 'hijab' && guest.candid) return false
      if (photos === 'nonhijab' && !guest.candid) return false
      if (!matchEvent(guest.akad, akad)) return false
      if (!matchEvent(guest.resepsi, resepsi)) return false
      if (!matchesTriState(guest.isVip, vip)) return false
      if (!matchesTriState(guest.isPhysicalInvitation, physicalInvitation)) return false
      if (!matchesTriState(guest.isWaitlisted, waitlist)) return false
      if (!matchesTriState(!guest.phone, missingPhone)) return false
      // "Reached but silent" is the row this filter exists for: delivered, and
      // still no click. Everything else here is a straight status match.
      if (delivery === 'notopened') {
        if (guest.inviteDelivery === 'none' || guest.inviteDelivery === 'failed') return false
        if (guest.firstOpenedAt) return false
      } else if (delivery !== 'any' && guest.inviteDelivery !== delivery) {
        return false
      }
      // Unanswered means any invitation they hold is still 'pending'. A guest
      // answered for one event and not the other is unanswered: the second
      // door will still refuse them.
      if (!matchesTriState(isUnanswered(guest), unanswered)) return false
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
    photos,
    type,
    akad,
    resepsi,
    vip,
    physicalInvitation,
    waitlist,
    missingPhone,
    unanswered,
    delivery,
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
    // Back to the defaults this screen was opened with, which empties the
    // query string too. `missingPhone` resets to 'any' rather than to the
    // prop: arriving from the dashboard's "missing a number" link and then
    // pressing Reset should clear that filter, not restore it.
    setFilters({ ...defaults, missingPhone: 'any', unanswered: 'any' })
  }

  // One chip per set filter, so the state stays readable while the panel is
  // closed. Search is not chipped: its value is already visible in the input.
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [
    ...(side !== 'any' ? [{ key: 'side', label: `${SIDE_LABEL[side]} side`, clear: () => setSide('any') }] : []),
    ...(inviter !== 'any' ? [{ key: 'inviter', label: inviterLabel(inviter), clear: () => setInviter('any') }] : []),
    ...(type !== 'any'
      ? [{ key: 'type', label: type === 'family' ? 'Family' : 'Friend', clear: () => setType('any') }]
      : []),
    ...(photos !== 'any'
      ? [
          {
            key: 'photos',
            label: photos === 'hijab' ? 'Hijab photos' : 'Non-hijab photos',
            clear: () => setPhotos('any'),
          },
        ]
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
    ...(unanswered !== 'any'
      ? [
          {
            key: 'unanswered',
            label: unanswered === 'yes' ? 'No answer yet' : 'Answered',
            clear: () => setUnanswered('any'),
          },
        ]
      : []),
    ...(delivery !== 'any'
      ? [
          {
            key: 'delivery',
            label:
              delivery === 'notopened' ? 'Reached, never opened' : DELIVERY_LABEL[delivery],
            clear: () => setDelivery('any'),
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

          {canSetCandid ? (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Photos</span>
              <select
                className={`${selectClass} w-full`}
                value={photos}
                onChange={(e) => setPhotos(e.target.value as typeof photos)}
              >
                <option value="any">Any</option>
                <option value="hijab">Hijab</option>
                <option value="nonhijab">Non-hijab</option>
              </select>
            </label>
          ) : null}

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

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Answer</span>
            <select
              className={`${selectClass} w-full`}
              value={unanswered}
              onChange={(e) => setUnanswered(e.target.value as TriState)}
            >
              <option value="any">Any</option>
              <option value="yes">No answer yet</option>
              <option value="no">Answered</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Invitation sent</span>
            <select
              className={`${selectClass} w-full`}
              value={delivery}
              onChange={(e) => setDelivery(e.target.value as typeof delivery)}
            >
              <option value="any">Any</option>
              <option value="none">Not sent</option>
              <option value="failed">Failed</option>
              <option value="sent">Sent, not confirmed</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="notopened">Reached, never opened</option>
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
            canSetCandid={canSetCandid}
            onEdit={() => setDialog({ mode: 'edit', guest })}
            origin={origin}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            No guest matches these filters.
          </div>
        ) : null}
      </div>

      {/* `isolate` keeps the pinned columns' z-index inside this table. The
          toolbar above pins itself in edit mode at the same z-20, and without
          a stacking context of its own the table's header cells, being later
          in the document, painted over it: the Name and Actions headings
          floated across the filters and the capacity strip. */}
      <div className="isolate hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead column="name" label="Name" className={STICKY_NAME} sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="pax" label="Pax" align="right" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="inviterKey" label="Inviter" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="side" label="Side" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <SortableHead column="type" label="Type" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              {canSetCandid ? (
                <SortableHead column="candid" label="Photos" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              ) : null}
              <TableHead>Language</TableHead>
              <TableHead className="text-center">Akad</TableHead>
              <TableHead className="text-center">Resepsi</TableHead>
              <TableHead className="text-center">VIP</TableHead>
              <TableHead className="text-center">Invitation</TableHead>
              <TableHead>Invitation sent</TableHead>
              <TableHead>Their answer</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Whatsapp</TableHead>
              <TableHead className={STICKY_ACTIONS}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((guest) => (
              // bg-card on the row itself, because the pinned cells inherit
              // it: without a background of their own they would be see
              // through and the scrolled columns would run under the name.
              <TableRow key={guest.id} className="guests-row">
                <TableCell className={`font-medium ${STICKY_NAME_CELL}`}>
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
                {canSetCandid ? (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {guest.candid ? 'Non-hijab' : 'Hijab'}
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {edit.isEditing('language') ? (
                    <EditableCell row={guest} field="language" edit={edit} className="w-36" />
                  ) : (
                    LANGUAGE_LABEL[edit.serverValue(guest, 'language') as GuestListRow['language']]
                  )}
                </TableCell>
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
                <TableCell className="max-w-44">
                  <InviteCell guest={guest} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <AnswerCell guest={guest} />
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
                <TableCell className={STICKY_ACTIONS_CELL}>
                  {canWrite ? (
                    <RowActions
                      url={guest.slug ? `${origin}/to/${guest.slug}` : null}
                      onEdit={() => setDialog({ mode: 'edit', guest })}
                      name={guest.name}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canSetCandid ? 14 : 13}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No guest matches these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <GuestDialog
        state={dialog}
        inviters={inviters}
        canAnswerRsvp={canAnswerRsvp}
        canSetCandid={canSetCandid}
        onClose={() => setDialog({ mode: 'closed' })}
      />
    </div>
  )
}
