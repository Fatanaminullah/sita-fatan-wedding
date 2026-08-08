'use client'

import { useTransition } from 'react'
import { AlertTriangle, Check, Clock, Pin } from 'lucide-react'
import { toggleTaskStatus } from '@/server/actions/planner-actions'
import type { DayKey, PlannerItem } from '@/domain/planner'

function timeLabel(item: PlannerItem): string | null {
  if (item.kind !== 'event' || item.allDay) return null
  const start = new Date(item.startsAt)
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
}

function isOverdue(item: PlannerItem, todayKey: DayKey): boolean {
  if (item.kind !== 'task' || item.status === 'done') return false
  const end = item.dueEndDate ?? item.dueDate
  return !!end && end < todayKey
}

/**
 * State is never carried by colour alone (DESIGN.md, the Never-Color-Alone
 * Rule): overdue is red plus the word (or, in the compact month-grid variant
 * where there is no room for the word, a warning glyph with its own
 * accessible name), done is muted plus a strikethrough, flagged is amber
 * plus a pin.
 *
 * Corner radius is `rounded-lg`, not a pill: DESIGN.md's Pill Is Status Rule
 * reserves fully-rounded geometry for status badges and filter chips. This
 * component holds two real controls (a checkbox and an open button), so
 * despite its filename it behaves as a control, not a status indicator, and
 * takes the control radius instead.
 */
export function ItemChip({
  item,
  todayKey,
  onOpen,
  compact = false,
}: {
  item: PlannerItem
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  compact?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const done = item.kind === 'task' && item.status === 'done'
  const overdue = isOverdue(item, todayKey)
  const flagged = item.kind === 'task' && item.isFlagged && !done
  const time = timeLabel(item)

  const tone = done
    ? 'text-muted-foreground'
    : overdue
      ? 'bg-destructive/10 text-destructive'
      : flagged
        ? 'bg-warning/10 text-warning'
        : 'bg-secondary text-secondary-foreground'

  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded-lg px-2 ${compact ? 'h-6 text-xs' : 'h-11 text-sm'} ${tone}`}
    >
      {item.kind === 'task' ? (
        <button
          type="button"
          aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
          disabled={isPending}
          onClick={() => startTransition(() => void toggleTaskStatus(item.id, !done))}
          className={`flex ${compact ? 'size-4' : 'size-6'} shrink-0 items-center justify-center rounded-md border border-current/40 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:opacity-50`}
        >
          {done ? <Check className="size-3" /> : null}
        </button>
      ) : (
        <Clock className="size-3 shrink-0" aria-hidden />
      )}

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        {time ? <span className="shrink-0 font-mono tabular-nums opacity-70">{time}</span> : null}
        <span className={`truncate ${done ? 'line-through' : ''}`}>{item.title}</span>
        {flagged ? <Pin className="size-3 shrink-0" aria-label="Blocked" /> : null}
        {overdue ? (
          compact ? (
            <AlertTriangle className="ml-auto size-3 shrink-0" aria-label="Overdue" />
          ) : (
            <span className="ml-auto shrink-0 text-xs">Overdue</span>
          )
        ) : null}
      </button>
    </div>
  )
}
