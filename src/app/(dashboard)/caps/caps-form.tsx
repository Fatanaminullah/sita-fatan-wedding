'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCaps } from '@/server/actions/caps-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type InviterCap = {
  key: string
  side: 'fatan' | 'sita'
  akadCap: number
  resepsiCap: number
  akadUsed: number
  resepsiUsed: number
}

type VipCap = { side: 'fatan' | 'sita'; vipCap: number; used: number }

const SIDE_LABEL = { fatan: 'Fatan side', sita: 'Sita side' } as const

export function CapsForm({ inviters, vipCaps }: { inviters: InviterCap[]; vipCaps: VipCap[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState(() => ({
    inviters: Object.fromEntries(
      inviters.map((row) => [row.key, { akadCap: row.akadCap, resepsiCap: row.resepsiCap }])
    ),
    vip: Object.fromEntries(vipCaps.map((row) => [row.side, row.vipCap])),
  }))

  const akadTotal = Object.values(draft.inviters).reduce((sum, row) => sum + (row.akadCap || 0), 0)
  const resepsiTotal = Object.values(draft.inviters).reduce((sum, row) => sum + (row.resepsiCap || 0), 0)
  const vipTotal = Object.values(draft.vip).reduce((sum, value) => sum + (value || 0), 0)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveCaps(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inviter</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Akad used</TableHead>
              <TableHead className="w-28 text-right">Akad cap</TableHead>
              <TableHead className="text-right">Resepsi used</TableHead>
              <TableHead className="w-28 text-right">Resepsi cap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inviters.map((row) => {
              const current = draft.inviters[row.key]
              return (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">
                    {row.key}
                    <input type="hidden" name="inviterKey" value={row.key} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{SIDE_LABEL[row.side]}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${row.akadUsed > current.akadCap ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                  >
                    {row.akadUsed}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="text-right tabular-nums"
                      name={`akadCap:${row.key}`}
                      value={current.akadCap}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          inviters: {
                            ...prev.inviters,
                            [row.key]: { ...current, akadCap: Number(event.target.value) },
                          },
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${row.resepsiUsed > current.resepsiCap ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                  >
                    {row.resepsiUsed}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="text-right tabular-nums"
                      name={`resepsiCap:${row.key}`}
                      value={current.resepsiCap}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          inviters: {
                            ...prev.inviters,
                            [row.key]: { ...current, resepsiCap: Number(event.target.value) },
                          },
                        }))
                      }
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">
                Venue total
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{akadTotal}</TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold tabular-nums">{resepsiTotal}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">
          VIP cap per side <span className="text-muted-foreground">(a tier on Resepsi, not a third event)</span>
        </p>
        <div className="flex flex-wrap gap-4">
          {vipCaps.map((row) => (
            <label key={row.side} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-muted-foreground">{SIDE_LABEL[row.side]}</span>
              <Input
                type="number"
                min={0}
                className="w-24 text-right tabular-nums"
                name={`vipCap:${row.side}`}
                value={draft.vip[row.side]}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, vip: { ...prev.vip, [row.side]: Number(event.target.value) } }))
                }
              />
              <span className={row.used > draft.vip[row.side] ? 'text-destructive' : 'text-muted-foreground'}>
                {row.used} used
              </span>
            </label>
          ))}
          <span className="self-center text-sm text-muted-foreground tabular-nums">Venue total {vipTotal}</span>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Caps saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : 'Save caps'}
      </Button>
    </form>
  )
}
