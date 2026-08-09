'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { InviterRow, SideRow } from '@/domain/summary'
import { inviterLabel } from '@/lib/inviter-label'

const AXIS = { fontSize: 12, fill: 'var(--muted-foreground)' }

/**
 * Used pax per inviter for one event, against that inviter's own cap.
 * Caps differ per inviter, so the cap is drawn as a per-bar marker rather
 * than one reference line: a single line would be a lie on five of six rows.
 */
export function InviterCapacityChart({
  rows,
  event,
}: {
  rows: InviterRow[]
  event: 'akad' | 'resepsi'
}) {
  const data = rows.map((row) => {
    const used = event === 'akad' ? row.akadUsed : row.resepsiUsed
    const cap = event === 'akad' ? row.akadCap : row.resepsiCap
    return {
      inviter: inviterLabel(row.inviterKey),
      used,
      cap,
      remaining: (event === 'akad' ? row.akadRemaining : row.resepsiRemaining),
      // Headroom stacks on top of used, so the full bar length is the cap and
      // an over-cap inviter is the only one whose bar runs past it.
      headroom: Math.max(0, cap - used),
    }
  })
  const max = Math.max(...data.map((d) => Math.max(d.used, d.cap)), 1)

  const config: ChartConfig = {
    used: { label: 'Pax invited', color: event === 'akad' ? 'var(--chart-1)' : 'var(--chart-3)' },
    headroom: { label: 'Seats left', color: 'var(--muted)' },
  }

  return (
    <ChartContainer config={config} className="h-60 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }} barSize={14}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" domain={[0, Math.ceil(max * 1.1)]} hide />
        <YAxis
          type="category"
          dataKey="inviter"
          width={86}
          tickLine={false}
          axisLine={false}
          tick={AXIS}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const row = item.payload as (typeof data)[number]
                return (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{row.inviter}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {value} / {row.cap} pax
                      <span className={row.remaining < 0 ? 'ml-2 text-destructive' : 'ml-2 text-muted-foreground'}>
                        {row.remaining < 0 ? `${-row.remaining} over` : `${row.remaining} left`}
                      </span>
                    </span>
                  </span>
                )
              }}
            />
          }
        />
        <Bar dataKey="used" stackId="cap" radius={[4, 0, 0, 4]}>
          {data.map((row) => (
            <Cell key={row.inviter} fill={row.remaining < 0 ? 'var(--destructive)' : 'var(--color-used)'} />
          ))}
        </Bar>
        <Bar dataKey="headroom" stackId="cap" fill="var(--color-headroom)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey={(entry: unknown) => {
              const row = entry as (typeof data)[number]
              return `${row.used}/${row.cap}`
            }}
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Pax per event, split by side. Two series, so a legend is always present. */
export function SideSplitChart({ sides }: { sides: SideRow[] }) {
  const bySide = (side: 'fatan' | 'sita') => sides.find((row) => row.side === side)
  const fatan = bySide('fatan')
  const sita = bySide('sita')

  const data = [
    { measure: 'Akad', fatan: fatan?.akadUsed ?? 0, sita: sita?.akadUsed ?? 0 },
    { measure: 'Resepsi', fatan: fatan?.resepsiUsed ?? 0, sita: sita?.resepsiUsed ?? 0 },
    { measure: 'VIP', fatan: fatan?.vipUsed ?? 0, sita: sita?.vipUsed ?? 0 },
  ]

  const config: ChartConfig = {
    fatan: { label: 'Fatan side', color: 'var(--chart-1)' },
    sita: { label: 'Sita side', color: 'var(--chart-2)' },
  }

  return (
    <ChartContainer config={config} className="h-60 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 16, bottom: 4 }} barGap={2} barSize={28}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="measure" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="fatan" fill="var(--color-fatan)" radius={[4, 4, 0, 0]}>
          <LabelList position="top" offset={6} className="fill-foreground" fontSize={12} />
        </Bar>
        <Bar dataKey="sita" fill="var(--color-sita)" radius={[4, 4, 0, 0]}>
          <LabelList position="top" offset={6} className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/**
 * Family vs friend is two numbers that sum to a whole, so it is one stacked
 * bar rather than a chart with axes. Both segments are labeled directly.
 */
export function TypeSplitBar({ family, friend }: { family: number; friend: number }) {
  const total = family + friend
  if (total === 0) return <p className="text-sm text-muted-foreground">No guests yet.</p>
  const familyPct = Math.round((family / total) * 100)

  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md">
        <div className="flex items-center justify-start" style={{ width: `${familyPct}%`, background: 'var(--chart-1)' }} />
        <div className="flex-1" style={{ background: 'var(--chart-2)' }} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-xs" style={{ background: 'var(--chart-1)' }} />
          <span className="text-muted-foreground">Family</span>
          <span className="font-medium tabular-nums">{family} pax</span>
          <span className="text-muted-foreground tabular-nums">({familyPct}%)</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-xs" style={{ background: 'var(--chart-2)' }} />
          <span className="text-muted-foreground">Friend</span>
          <span className="font-medium tabular-nums">{friend} pax</span>
          <span className="text-muted-foreground tabular-nums">({100 - familyPct}%)</span>
        </span>
      </div>
    </div>
  )
}
