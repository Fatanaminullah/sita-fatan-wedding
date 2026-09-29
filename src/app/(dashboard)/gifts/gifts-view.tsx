'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2 } from 'lucide-react'
import { formatRupiah, normaliseEnvelopeCode, parseAmount } from '@/domain/envelope'
import { addEnvelope, removeEnvelope, saveEnvelopeAmount } from '@/server/actions/envelope-actions'
import type { Envelope } from '@/server/repositories/envelopes-repository'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviterLabel } from '@/lib/inviter-label'
import { nativeFieldClass } from '@/lib/field-class'
import { cn } from '@/lib/utils'

type GuestOption = { id: string; name: string; inviterKey: string }
type Filter = 'all' | 'uncounted' | 'counted'

/**
 * Counting the envelopes, after the wedding.
 *
 * Built for a pile on a table: type the code off the label, Enter, type the
 * amount, Enter, and the cursor is back in the code field for the next one.
 * Nothing needs the mouse. Later, the list below answers "how much did X
 * give" with one search.
 */
export function GiftsView({ envelopes, guests }: { envelopes: Envelope[]; guests: GuestOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [current, setCurrent] = useState<Envelope | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)

  const byCode = useMemo(() => new Map(envelopes.map((e) => [e.code, e])), [envelopes])
  const counted = envelopes.filter((e) => e.amount !== null)
  const total = counted.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return envelopes.filter((e) => {
      if (filter === 'counted' && e.amount === null) return false
      if (filter === 'uncounted' && e.amount !== null) return false
      if (!q) return true
      return `${e.code} ${e.name} ${e.guestName ?? ''} ${e.note ?? ''}`.toLowerCase().includes(q)
    })
  }, [envelopes, query, filter])

  function open(envelope: Envelope) {
    setError(null)
    setSaved(null)
    setCurrent(envelope)
    setCode(envelope.code)
    setAmount(envelope.amount === null ? '' : String(envelope.amount))
    setNote(envelope.note ?? '')
    requestAnimationFrame(() => amountRef.current?.focus())
  }

  function find(e: React.FormEvent) {
    e.preventDefault()
    setSaved(null)
    const normalised = normaliseEnvelopeCode(code)
    if (!normalised) {
      setError('A code is a letter (F, S or U) and a number, like F-0142.')
      return
    }
    const envelope = byCode.get(normalised)
    if (!envelope) {
      setError(`No envelope has the code ${normalised}.`)
      return
    }
    open(envelope)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!current) return
    const value = amount.trim() === '' ? null : parseAmount(amount)
    if (amount.trim() !== '' && value === null) {
      setError('Write the amount in rupiah, like 500000, 500.000 or 500rb.')
      return
    }
    setError(null)
    const envelope = current
    startTransition(async () => {
      const result = await saveEnvelopeAmount(envelope.id, value, note)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSaved(
        value === null
          ? `${envelope.code} cleared.`
          : `${envelope.code} · ${envelope.guestName ?? envelope.name} · ${formatRupiah(value)}`
      )
      setCurrent(null)
      setCode('')
      setAmount('')
      setNote('')
      router.refresh()
      requestAnimationFrame(() => codeRef.current?.focus())
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-xl font-medium">Gifts</h1>
          <p className="text-sm text-muted-foreground">
            Every envelope, by the code on its label. Only the two of you can see this page.
          </p>
        </div>
        <dl className="flex flex-wrap gap-5">
          <Tally label="Envelopes" value={String(envelopes.length)} />
          <Tally label="Counted" value={String(counted.length)} />
          <Tally label="Still to count" value={String(envelopes.length - counted.length)} />
          <Tally label="Total" value={formatRupiah(total)} />
        </dl>
      </header>

      <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start gap-3">
          <form onSubmit={find} className="flex w-full flex-col gap-1 sm:w-44">
            <label htmlFor="gift-code" className="text-xs font-medium text-muted-foreground">
              Code on the label
            </label>
            <Input
              id="gift-code"
              ref={codeRef}
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setCurrent(null)
              }}
              placeholder="F-0142"
              autoComplete="off"
              className="h-11 font-mono text-base uppercase md:h-9"
            />
          </form>

          {current ? (
            <form onSubmit={save} className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-0.5 self-center">
                <p className="truncate font-medium">{current.guestName ?? current.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {current.inviterKey ? inviterLabel(current.inviterKey) : 'Not on the guest list'}
                  {current.guestName && current.guestName !== current.name ? ` · label reads "${current.name}"` : ''}
                </p>
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-44">
                <label htmlFor="gift-amount" className="text-xs font-medium text-muted-foreground">
                  Amount
                </label>
                <Input
                  id="gift-amount"
                  ref={amountRef}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500rb"
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-11 font-mono text-base md:h-9"
                />
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-56">
                <label htmlFor="gift-note" className="text-xs font-medium text-muted-foreground">
                  Note
                </label>
                <Input
                  id="gift-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="A gift, not cash"
                  autoComplete="off"
                  className="h-11 text-base md:h-9 md:text-sm"
                />
              </div>
              <Button type="submit" className="h-11 md:h-9" disabled={pending}>
                {pending ? 'Saving' : 'Save'}
              </Button>
            </form>
          ) : (
            <p className="self-center pt-4 text-sm text-muted-foreground">
              Type the code and press Enter. Then the amount, Enter again.
            </p>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : saved ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Saved: <span className="font-mono tabular-nums">{saved}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code or note"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className={nativeFieldClass}
            aria-label="Show"
          >
            <option value="all">All envelopes</option>
            <option value="uncounted">Still to count</option>
            <option value="counted">Counted</option>
          </select>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Add envelope
          </Button>
        </div>

        {adding ? (
          <AddEnvelope
            guests={guests}
            onDone={(message) => {
              setAdding(false)
              if (message) setSaved(message)
              router.refresh()
            }}
          />
        ) : null}

        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Inviter</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Note</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {envelopes.length === 0
                      ? 'No envelopes yet. They appear here as labels are printed at the door.'
                      : 'Nothing matches that search.'}
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <EnvelopeRow key={e.id} envelope={e} onOpen={() => open(e)} onRemoved={() => router.refresh()} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-base font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function EnvelopeRow({ envelope: e, onOpen, onRemoved }: { envelope: Envelope; onOpen: () => void; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <tr className="cursor-pointer border-b border-border last:border-0 hover:bg-accent" onClick={onOpen}>
      <td className="px-3 py-2 font-mono tabular-nums">{e.code}</td>
      <td className="px-3 py-2">{e.guestName ?? e.name}</td>
      <td className="px-3 py-2 text-muted-foreground">{e.inviterKey ? inviterLabel(e.inviterKey) : 'Not on the list'}</td>
      <td className={cn('px-3 py-2 text-right font-mono tabular-nums', e.amount === null && 'text-muted-foreground')}>
        {e.amount === null ? 'Not counted' : formatRupiah(e.amount)}
      </td>
      <td className="max-w-56 truncate px-3 py-2 text-muted-foreground">{e.note}</td>
      <td className="px-2 py-1 text-right" onClick={(event) => event.stopPropagation()}>
        {confirming ? (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeEnvelope(e.id)
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
            aria-label={`Remove ${e.code}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        )}
      </td>
    </tr>
  )
}

/**
 * An envelope with no label: one that arrived another way, or a second
 * envelope from the same guest. It gets a new code, to write on it by hand.
 */
function AddEnvelope({ guests, onDone }: { guests: GuestOption[]; onDone: (message: string | null) => void }) {
  const [name, setName] = useState('')
  const [guest, setGuest] = useState<GuestOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const q = name.trim().toLowerCase()
  const matches = !guest && q.length >= 2 ? guests.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6) : []

  return (
    <form
      className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const result = await addEnvelope({ guestId: guest?.id ?? null, name: guest?.name ?? name })
          if ('error' in result) setError(result.error)
          else onDone(`${result.code} · ${guest?.name ?? name.trim()}. Write ${result.code} on the envelope.`)
        })
      }}
    >
      <div>
        <h2 className="text-base font-medium">Add an envelope</h2>
        <p className="text-sm text-muted-foreground">
          For an envelope without a label. Pick the guest, or type a name for someone not on the list.
        </p>
      </div>
      <div className="relative">
        <Input
          autoFocus
          value={guest ? guest.name : name}
          onChange={(e) => {
            setGuest(null)
            setName(e.target.value)
          }}
          placeholder="Guest name"
          className="h-9"
        />
        {matches.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
            {matches.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGuest(g)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{inviterLabel(g.inviterKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {guest ? `On the list, invited by ${inviterLabel(guest.inviterKey)}.` : name.trim() ? 'Not matched to a guest: it will be a U- envelope.' : ''}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !(guest || name.trim())}>
          Add envelope
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
