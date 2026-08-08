'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ItemChip } from '@/components/planner/item-chip'
import { ItemSheet } from '@/components/planner/item-sheet'
import { CaptureFab } from '@/components/planner/capture-fab'
import type { DayKey, HorizonBuckets, PlannerItem } from '@/domain/planner'

function Section({
  title,
  items,
  todayKey,
  onOpen,
  tone,
}: {
  title: string
  items: PlannerItem[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  tone?: 'alarm' | 'caution'
}) {
  // Cards with nothing to say render nothing at all, so a calm week is a
  // short screen rather than a wall of empty states.
  if (items.length === 0) return null

  return (
    <Card className={tone === 'alarm' ? 'ring-destructive/30' : tone === 'caution' ? 'ring-warning/30' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={tone === 'alarm' ? 'text-destructive' : tone === 'caution' ? 'text-warning' : undefined}>
            {title}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {items.map((item) => (
          <ItemChip key={`${title}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
        ))}
      </CardContent>
    </Card>
  )
}

export function PlannerHomeCards({
  buckets,
  todayKey,
  daysLeft,
}: {
  buckets: HorizonBuckets
  todayKey: DayKey
  daysLeft: number
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)
  const donePct = buckets.totalCount > 0 ? Math.round((buckets.doneCount / buckets.totalCount) * 100) : 0
  const nothingAtAll = buckets.totalCount === 0

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="font-mono text-[clamp(3rem,14vw,5rem)] leading-none font-medium tracking-tight tabular-nums">
            {daysLeft > 0 ? daysLeft : 0}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {daysLeft > 0 ? 'days until 10 October 2026' : daysLeft === 0 ? 'Today is the day' : 'Married since 10 October 2026'}
          </span>
        </CardContent>
      </Card>

      {nothingAtAll ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Nothing here yet. Add the first thing you need to remember.</p>
          </CardContent>
        </Card>
      ) : null}

      <Section title="Overdue" items={buckets.overdue} todayKey={todayKey} onOpen={setOpenItem} tone="alarm" />
      <Section title="Today" items={buckets.today} todayKey={todayKey} onOpen={setOpenItem} />
      <Section title="Next 7 days" items={buckets.next7} todayKey={todayKey} onOpen={setOpenItem} />
      <Section title="Blocked" items={buckets.flagged} todayKey={todayKey} onOpen={setOpenItem} tone="caution" />
      <Section title="Later this month" items={buckets.thisMonth} todayKey={todayKey} onOpen={setOpenItem} />

      {buckets.totalCount > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="font-mono text-sm tabular-nums">
              {buckets.doneCount} / {buckets.totalCount} done
            </span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${donePct}%` }} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {buckets.unscheduled.length > 0 ? (
        <Link
          href="/planner/tasks"
          className="flex h-11 items-center justify-between rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span>Unscheduled</span>
          <span className="font-mono tabular-nums text-muted-foreground">{buckets.unscheduled.length}</span>
        </Link>
      ) : null}

      <ItemSheet
        item={openItem}
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null)
        }}
        defaultDateKey={todayKey}
      />
      <CaptureFab defaultDateKey={todayKey} />
    </>
  )
}
