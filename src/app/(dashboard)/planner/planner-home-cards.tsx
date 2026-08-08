'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ItemChip } from '@/components/planner/item-chip'
import { ItemSheet } from '@/components/planner/item-sheet'
import { CaptureFab } from '@/components/planner/capture-fab'
import type { DayKey, HorizonBuckets, PlannerItem, PlannerSubtask } from '@/domain/planner'

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
    // No coloured ring here (DESIGN.md, Shapes: "no colored outlines except
    // the focus ring"; the Ring, Not Shadow Rule wants a plain hairline plus
    // a tonal step, which the bare `Card` already carries). State still
    // reads without it: the title span just below is toned red or amber and
    // paired with the word itself, and every chip inside repeats the state
    // (tint, icon and word) at the item level.
    <Card>
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
  subtasksByTaskId,
}: {
  buckets: HorizonBuckets
  todayKey: DayKey
  daysLeft: number
  subtasksByTaskId: Record<string, PlannerSubtask[]>
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const donePct = buckets.totalCount > 0 ? Math.round((buckets.doneCount / buckets.totalCount) * 100) : 0

  // Progress is deliberately task-only (totalCount/doneCount never touch
  // events), so it cannot answer "is this screen empty". A workspace holding
  // only events has totalCount === 0 while Today or Next 7 days are full;
  // "nothing at all" has to check every bucket the screen can actually
  // render, or the empty-state card would contradict its own siblings.
  const nothingAtAll =
    buckets.overdue.length === 0 &&
    buckets.today.length === 0 &&
    buckets.next7.length === 0 &&
    buckets.thisMonth.length === 0 &&
    buckets.flagged.length === 0 &&
    buckets.unscheduled.length === 0 &&
    buckets.totalCount === 0 &&
    buckets.doneCount === 0

  // Design spec 7.1: after 10 October the countdown "stops counting down and
  // reads as a date marker", and countdown-strip.tsx already drops its
  // numeral once `daysUntilWedding` goes negative rather than clamping it to
  // zero. The hero matches that: a display-size numeral only while there is
  // still something to count down to (before and on the wedding day), and a
  // plain date marker afterward, at Headline size so nothing here reads as a
  // second display-size element (the One Display Rule).
  const isPastWedding = daysLeft < 0

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-1">
          {isPastWedding ? (
            <span className="text-xl leading-none font-medium tracking-tight">Married</span>
          ) : (
            <span className="font-mono text-[clamp(3rem,14vw,5rem)] leading-none font-medium tracking-tight tabular-nums">
              {daysLeft}
            </span>
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {isPastWedding ? '10 October 2026' : daysLeft === 0 ? 'Today is the day' : 'days until 10 October 2026'}
          </span>
        </CardContent>
      </Card>

      {nothingAtAll ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            <Button type="button" variant="outline" onClick={() => setCreatingNew(true)} className="h-11 self-start">
              Add the first thing
            </Button>
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
        open={openItem !== null || creatingNew}
        onOpenChange={(next) => {
          if (!next) {
            setOpenItem(null)
            setCreatingNew(false)
          }
        }}
        defaultDateKey={todayKey}
        subtasks={openItem ? (subtasksByTaskId[openItem.id] ?? []) : []}
      />
      <CaptureFab defaultDateKey={todayKey} />
    </>
  )
}
