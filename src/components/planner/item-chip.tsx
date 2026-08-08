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

/** The day an item sits on, for lists where no grid position implies it. */
function dateLabel(item: PlannerItem): string | null {
  const dayKey = item.kind === 'task' ? item.dueDate : item.startsAt.slice(0, 10)
  if (!dayKey) return null
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
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
 * component holds up to two real controls (a checkbox and an open button), so
 * despite its filename it behaves as a control, not a status indicator, and
 * takes the control radius instead.
 *
 * Every tone is filled, including the ordinary one. An earlier version made
 * the ordinary tone a hairline outline, reading DESIGN.md's Spent Color Rule
 * literally, and on a white grid with hairline hour lines that left nothing
 * separating a chip from the surface beneath it. The wash-blue fill is what
 * DESIGN.md's own Chips section calls "a chip that is on but not urgent",
 * and overdue red, blocked amber and done grey still read clearly against it.
 *
 * Compact (the month-grid variant) drops the checkbox entirely rather than
 * shrinking it: DESIGN.md's Two Densities Rule sets a 44px minimum touch
 * target for planner surfaces, and a month-grid cell has no room for one. The
 * compact leading glyph is a decorative, non-interactive status indicator
 * instead, and the body button is the surface's only control; completing a
 * task happens after opening it.
 */
export function ItemChip({
  item,
  todayKey,
  onOpen,
  compact = false,
  fill = false,
  showDate = false,
}: {
  item: PlannerItem
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  compact?: boolean
  /** Stretch to the container's height, for hour-grid blocks that encode duration. */
  fill?: boolean
  /**
   * Prefix the day. The calendar views leave this off because a chip's
   * position in the grid already says which day it is; a flat list like
   * planner home has no such cue, so "Next 7 days" would otherwise show
   * seven undated rows.
   */
  showDate?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const done = item.kind === 'task' && item.status === 'done'
  const overdue = isOverdue(item, todayKey)
  const flagged = item.kind === 'task' && item.isFlagged && !done
  const time = timeLabel(item)
  const date = showDate ? dateLabel(item) : null

  const tone = done
    ? 'bg-muted text-muted-foreground'
    : overdue
      ? 'bg-destructive/10 text-destructive'
      : flagged
        ? 'bg-warning/10 text-warning'
        : 'bg-secondary text-secondary-foreground'

  // `fill` stretches the chip to whatever box it is given, which on an hour
  // grid is the event's real duration. Without it a six hour shoot and a
  // thirty minute fitting render identically and the grid stops meaning
  // anything. The title anchors to the top rather than centring, so a tall
  // block reads from its start time down.
  // No min-height in fill mode. The block's own height is the truth there,
  // and `layoutTimedEvents` already floors it at 30 minutes so it can never
  // collapse to nothing. A `min-h-11` taller than a 28px half-hour block (the
  // day view's row height is 56px) simply gets clipped by the wrapper's
  // `overflow-hidden`, taking the chip's bottom edge and rounded corners with
  // it and leaving what looks like a box that is only bordered along the top.
  const height = fill ? 'h-full items-start py-0.5' : `items-center ${compact ? 'h-6' : 'h-11'}`

  // A hairline edge in the chip's own text colour, so each tone gets a
  // matching one for free (DESIGN.md, the Ring, Not Shadow Rule: separation
  // is a hairline plus a tonal step). Without it two back-to-back events on
  // the hour grid share an edge and merge into one continuous block of fill.
  // `inset` so the ring costs no layout height: a 30 minute block is exactly
  // 24px at the week view's row height, with no slack for a border box.
  const edge = 'ring-1 ring-inset ring-current/25'

  return (
    <div
      className={`flex w-full gap-1.5 rounded-lg px-2 ${compact ? 'text-xs' : 'text-sm'} ${height} ${tone} ${edge}`}
    >
      {item.kind === 'task' ? (
        compact ? (
          // Compact rides in a month-grid cell with no room for a real 44px
          // target (DESIGN.md, the Two Densities Rule), so this is decorative
          // only: no aria-label, no click handler. Completing a task happens
          // after opening it via the body button below, where a full-size
          // checkbox is available.
          <span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center rounded-md border border-current/40"
          >
            {done ? <Check className="size-3" /> : null}
          </span>
        ) : (
          <button
            type="button"
            aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
            disabled={isPending}
            onClick={() => startTransition(() => void toggleTaskStatus(item.id, !done))}
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:opacity-50"
          >
            <span className="flex size-6 items-center justify-center rounded-md border border-current/40">
              {done ? <Check className="size-3" /> : null}
            </span>
          </button>
        )
      ) : (
        <Clock className="size-3 shrink-0" aria-hidden />
      )}

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border border-transparent text-left focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        {date ? <span className="shrink-0 font-mono tabular-nums opacity-70">{date}</span> : null}
        {time ? <span className="shrink-0 font-mono tabular-nums opacity-70">{time}</span> : null}
        <span className={`truncate ${done ? 'line-through' : ''}`}>
          {item.title}
          {/* Compact drops the checkbox, so "done" has no other accessible
              announcement left; the non-compact checkbox's own aria-label
              already carries that state, so this stays compact-only. */}
          {compact && done ? <span className="sr-only">, done</span> : null}
        </span>
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
