'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Search, Trash2 } from 'lucide-react'
import { NO_NAME, formatRupiah, giftSource, normaliseEnvelopeCode, parseAmount } from '@/domain/envelope'
import { addGift, removeEnvelope, saveEnvelopeAmount } from '@/server/actions/envelope-actions'
import type { Envelope, GiftKind } from '@/server/repositories/envelopes-repository'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviterLabel } from '@/lib/inviter-label'
import { cn } from '@/lib/utils'

type GuestOption = { id: string; name: string; inviterKey: string }
type Filter = 'all' | 'uncounted' | GiftKind | 'unlisted' | 'anonymous'

const KIND_LABEL: Record<GiftKind, string> = { envelope: 'Envelope', transfer: 'Transfer', item: 'Present' }

/** An envelope or transfer with no amount yet. A present is never "to count". */
const uncounted = (g: Envelope) => g.kind !== 'item' && g.amount === null

/**
 * Every gift, in one list: the envelopes from the door, transfers, and
 * presents from guests who sent something instead of coming.
 *
 * Counting a pile is typing into the list itself: the amount field is on the
 * row, Enter saves it and moves to the next gift still to count. Holding an
 * envelope, type its code in the search and Enter lands in its row.
 */
export function GiftsView({ envelopes: gifts, guests }: { envelopes: Envelope[]; guests: GuestOption[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputs = useRef(new Map<string, HTMLInputElement>())

  const sum = (list: Envelope[]) => list.reduce((total, g) => total + (g.amount ?? 0), 0)
  const envelopes = gifts.filter((g) => g.kind === 'envelope')
  const transfers = gifts.filter((g) => g.kind === 'transfer')
  const presents = gifts.filter((g) => g.kind === 'item')
  const toCount = gifts.filter(uncounted).length
  const unlisted = gifts.filter((g) => giftSource(g) === 'unlisted')
  const anonymous = gifts.filter((g) => giftSource(g) === 'anonymous')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gifts.filter((g) => {
      if (filter === 'uncounted' && !uncounted(g)) return false
      if (filter === 'unlisted' || filter === 'anonymous') {
        if (giftSource(g) !== filter) return false
      } else if (filter !== 'all' && filter !== 'uncounted' && g.kind !== filter) return false
      if (!q) return true
      return `${g.code ?? ''} ${g.name} ${g.guestName ?? ''} ${g.item ?? ''} ${g.note ?? ''}`.toLowerCase().includes(q)
    })
  }, [gifts, query, filter])

  function focus(id: string) {
    const input = inputs.current.get(id)
    if (!input) return
    input.focus()
    input.select()
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  /** After a save: the next gift in the list that still has no amount. */
  function focusNextAfter(id: string) {
    const at = rows.findIndex((g) => g.id === id)
    const next = [...rows.slice(at + 1), ...rows.slice(0, at)].find(uncounted)
    if (next) focus(next.id)
  }

  /** Enter in the search: an exact code, or a single match, takes you to its row. */
  function jump(e: React.FormEvent) {
    e.preventDefault()
    const code = normaliseEnvelopeCode(query)
    const target = (code && gifts.find((g) => g.code === code)) || (rows.length === 1 ? rows[0] : null)
    if (!target) return
    if (!rows.some((g) => g.id === target.id)) setFilter('all')
    requestAnimationFrame(() => focus(target.id))
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-xl font-medium">Gifts</h1>
          <p className="text-sm text-muted-foreground">
            Envelopes from the door, transfers, and presents. Only the two of you can see this page.
          </p>
        </div>
        <dl className="flex flex-wrap gap-5">
          <Tally label={`Envelopes (${envelopes.length})`} value={formatRupiah(sum(envelopes))} />
          <Tally label={`Transfers (${transfers.length})`} value={formatRupiah(sum(transfers))} />
          <Tally label="Presents" value={String(presents.length)} />
          <Tally label={`Not on the list (${unlisted.length})`} value={formatRupiah(sum(unlisted))} />
          <Tally label={`No name (${anonymous.length})`} value={formatRupiah(sum(anonymous))} />
          <Tally label="Total" value={formatRupiah(sum(gifts))} strong />
        </dl>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={jump} className="min-w-56 flex-1">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50 md:h-9">
            <Search className="size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, or the code on the label, then Enter"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none md:text-sm"
            />
          </label>
        </form>
        <Button className="h-11 md:h-9" onClick={() => setAdding((v) => !v)}>
          <Plus />
          Add gift
        </Button>
      </div>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'All', gifts.length],
            ['uncounted', 'Still to count', toCount],
            ['envelope', 'Envelopes', envelopes.length],
            ['transfer', 'Transfers', transfers.length],
            ['item', 'Presents', presents.length],
            ['unlisted', 'Not on the list', unlisted.length],
            ['anonymous', 'No name', anonymous.length],
          ] as Array<[Filter, string, number]>
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-border ring-inset md:h-8',
              filter === value && 'bg-primary text-primary-foreground ring-0'
            )}
          >
            {label}
            <span className="font-mono text-xs tabular-nums opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {adding ? (
        <AddGift
          guests={guests}
          onDone={(done) => {
            setAdding(false)
            if (done) {
              setMessage(done)
              router.refresh()
            }
          }}
        />
      ) : null}

      {message ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            {gifts.length === 0
              ? 'No gifts yet. Envelopes appear as labels are printed at the door; add transfers and presents with Add gift.'
              : 'Nothing matches.'}
          </li>
        ) : (
          rows.map((g) => (
            <GiftRow
              key={g.id}
              gift={g}
              register={(el) => {
                if (el) inputs.current.set(g.id, el)
                else inputs.current.delete(g.id)
              }}
              onSaved={() => {
                router.refresh()
                focusNextAfter(g.id)
              }}
              onRemoved={() => router.refresh()}
            />
          ))
        )}
      </ul>
    </div>
  )
}

function Tally({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono tabular-nums', strong ? 'text-lg font-semibold' : 'text-base font-medium')}>{value}</dd>
    </div>
  )
}

/**
 * One gift. The amount and the note are typed straight into the row: Enter
 * saves, and the list moves on to the next one still to count.
 */
function GiftRow({
  gift: g,
  register,
  onSaved,
  onRemoved,
}: {
  gift: Envelope
  register: (el: HTMLInputElement | null) => void
  onSaved: () => void
  onRemoved: () => void
}) {
  const [amount, setAmount] = useState(g.amount === null ? '' : formatRupiah(g.amount).replace('Rp ', ''))
  const [note, setNote] = useState(g.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const savedAmount = g.amount
  const savedNote = g.note ?? ''

  function save(moveOn: boolean) {
    const value = amount.trim() === '' ? null : parseAmount(amount)
    if (amount.trim() !== '' && value === null) {
      setError('Write it like 500000, 500.000 or 500rb.')
      return
    }
    if (value === savedAmount && note.trim() === savedNote) {
      if (moveOn) onSaved()
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveEnvelopeAmount(g.id, value, note)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setAmount(value === null ? '' : formatRupiah(value).replace('Rp ', ''))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
      if (moveOn) onSaved()
    })
  }

  const source = giftSource(g)
  const who = g.guestName ?? g.name
  const from = g.inviterKey
    ? inviterLabel(g.inviterKey)
    : source === 'anonymous'
      ? 'Nobody wrote a name'
      : 'Not on the guest list'

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[6.5rem_minmax(0,1fr)_11rem_minmax(0,14rem)_2.5rem]">
      <span className="order-2 flex items-center gap-2 md:order-none">
        {g.code ? (
          <span className="font-mono text-sm tabular-nums">{g.code}</span>
        ) : (
          <span
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium',
              g.kind === 'transfer' ? 'bg-secondary text-secondary-foreground' : 'ring-1 ring-border ring-inset'
            )}
          >
            {KIND_LABEL[g.kind]}
          </span>
        )}
      </span>

      <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
        <span className="block truncate font-medium">{who}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {from}
          {g.guestName && g.guestName !== g.name ? ` · label reads "${g.name}"` : ''}
        </span>
      </span>

      <span className="order-3 md:order-none">
        {g.kind === 'item' ? (
          <span className="block truncate text-sm italic">{g.item}</span>
        ) : (
          <label className="relative block">
            <span className="sr-only">Amount from {who}</span>
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              ref={register}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  save(true)
                }
              }}
              onBlur={() => save(false)}
              placeholder="500rb"
              inputMode="decimal"
              autoComplete="off"
              disabled={pending}
              className={cn(
                'h-11 pr-8 pl-9 text-right font-mono text-base tabular-nums md:h-9 md:text-sm',
                g.amount === null && 'border-dashed'
              )}
            />
            {saved ? (
              <Check aria-label="Saved" className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-emerald-600" />
            ) : null}
          </label>
        )}
        {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
      </span>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save(false)
          }
        }}
        onBlur={() => save(false)}
        placeholder="Note"
        aria-label={`Note for ${who}`}
        autoComplete="off"
        className="order-4 col-span-2 h-11 text-base md:order-none md:col-span-1 md:h-9 md:text-sm"
      />

      <span className="order-2 flex justify-end md:order-none">
        {confirming ? (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeEnvelope(g.id)
                  onRemoved()
                })
              }
            >
              Remove
            </Button>
          </span>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove the gift from ${who}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        )}
      </span>
    </li>
  )
}

/**
 * A gift that did not come through the door: a transfer, a present sent
 * ahead, or an envelope handed over somewhere else (which gets a code, to
 * write on it by hand).
 */
function AddGift({ guests, onDone }: { guests: GuestOption[]; onDone: (message: string | null) => void }) {
  const [kind, setKind] = useState<GiftKind>('transfer')
  const [name, setName] = useState('')
  const [guest, setGuest] = useState<GuestOption | null>(null)
  const [noName, setNoName] = useState(false)
  const [amount, setAmount] = useState('')
  const [item, setItem] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const q = name.trim().toLowerCase()
  const matches = !guest && !noName && q.length >= 2 ? guests.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6) : []
  const who = noName ? NO_NAME : (guest?.name ?? name.trim())

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = amount.trim() === '' ? null : parseAmount(amount)
    if (amount.trim() !== '' && value === null) {
      setError('Write the amount like 500000, 500.000 or 500rb.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await addGift({ kind, guestId: noName ? null : (guest?.id ?? null), name: who, amount: value, item, note })
      if ('error' in result) setError(result.error)
      else
        onDone(
          result.code
            ? `Added ${result.code} for ${who}. Write ${result.code} on the envelope.`
            : `Added: ${KIND_LABEL[kind].toLowerCase()} from ${who}.`
        )
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div role="group" aria-label="Kind of gift" className="flex flex-wrap gap-1.5">
        {(['transfer', 'item', 'envelope'] as GiftKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'h-10 rounded-lg px-4 text-sm font-medium ring-1 ring-border ring-inset md:h-9',
              kind === k && 'bg-primary text-primary-foreground ring-0'
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="relative space-y-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="gift-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={noName}
                onChange={(e) => {
                  setNoName(e.target.checked)
                  setGuest(null)
                }}
                className="size-4 accent-primary"
              />
              No name on it
            </label>
          </div>
          <Input
            id="gift-from"
            autoFocus
            disabled={noName}
            value={noName ? NO_NAME : guest ? guest.name : name}
            onChange={(e) => {
              setGuest(null)
              setName(e.target.value)
            }}
            placeholder="Guest name"
            autoComplete="off"
            className="h-11 text-base md:h-9 md:text-sm"
          />
          {matches.length > 0 ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
              {matches.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setGuest(g)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">{g.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{inviterLabel(g.inviterKey)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {noName
              ? 'Counted under No name.'
              : guest
                ? `On the list, invited by ${inviterLabel(guest.inviterKey)}.`
                : name.trim()
                  ? 'Not matched to a guest. Pick from the list if they are on it.'
                  : ''}
          </p>
        </div>

        {kind === 'item' ? null : (
          <div className="space-y-1">
            <label htmlFor="gift-amount" className="text-xs font-medium text-muted-foreground">
              Amount{kind === 'envelope' ? ' (if counted)' : ''}
            </label>
            <Input
              id="gift-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500rb"
              inputMode="decimal"
              autoComplete="off"
              className="h-11 text-right font-mono text-base md:h-9 md:text-sm"
            />
          </div>
        )}
      </div>

      {kind === 'item' ? (
        <div className="space-y-1">
          <label htmlFor="gift-item" className="text-xs font-medium text-muted-foreground">
            What it is
          </label>
          <Input
            id="gift-item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Rice cooker"
            autoComplete="off"
            className="h-11 text-base md:h-9 md:text-sm"
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="gift-note" className="text-xs font-medium text-muted-foreground">
          Note
        </label>
        <Input
          id="gift-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'transfer' ? 'BCA, 2 Oct' : 'Optional'}
          autoComplete="off"
          className="h-11 text-base md:h-9 md:text-sm"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-11 md:h-9" disabled={pending || !who}>
          {pending ? 'Adding' : `Add ${KIND_LABEL[kind].toLowerCase()}`}
        </Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
