'use client'

import { minutesToClock, slotFromIndex, SLOTS_PER_DAY, type DayKey } from '@/domain/planner'

export type SlotDraft = {
  dateKey: DayKey
  /** Absent for a whole-day target, such as a month cell. */
  startTime?: string
  endTime?: string
}

/**
 * Whisper Oxblood, which DESIGN.md names for exactly this: "the faintest
 * possible surface tint. Hover states and the accent background." Empty
 * calendar space gives no hint that it is clickable, so the hover is the only
 * thing that advertises the feature.
 */
const SLOT_HOVER = 'cursor-pointer transition-colors hover:bg-accent'

/**
 * The click target that turns empty calendar space into a new item.
 *
 * One element per half hour rather than a single overlay with pointer
 * arithmetic. That buys the hover highlight from plain CSS, and each cell
 * already knows its own time, so nothing has to measure a bounding rect or
 * reason about scroll offset at click time.
 *
 * The layer renders BEFORE the events in its container on purpose. Both are
 * positioned, so a later sibling paints above an earlier one: existing chips
 * keep receiving their own clicks and still open for edit, and only genuinely
 * empty space reaches these cells. The consequence is that a fully booked
 * hour has nothing left to click, which is correct rather than a limitation.
 *
 * Pointer-only, deliberately. Making every half hour keyboard reachable would
 * add 48 tab stops to the day view and 336 to the week view, wrecking tab
 * order for everyone to serve a path the capture button already covers: it
 * opens the same form, with the same fields, from one tab stop.
 */
export function HourSlotLayer({
  dayKey,
  hourHeightPx,
  onPick,
}: {
  dayKey: DayKey
  hourHeightPx: number
  onPick: (draft: SlotDraft) => void
}) {
  const slotHeight = hourHeightPx / 2

  return (
    <div aria-hidden className="absolute inset-0">
      {Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
        const { startMinutes, endMinutes } = slotFromIndex(index)
        return (
          <div
            key={index}
            className={`absolute inset-x-0 ${SLOT_HOVER}`}
            style={{ top: index * slotHeight, height: slotHeight }}
            onClick={() =>
              onPick({
                dateKey: dayKey,
                startTime: minutesToClock(startMinutes),
                endTime: minutesToClock(endMinutes),
              })
            }
          />
        )
      })}
    </div>
  )
}

/**
 * The month-cell equivalent. A month cell carries no time, so it seeds only
 * the date and lets the form default the rest.
 */
export function DaySlotLayer({ dayKey, onPick }: { dayKey: DayKey; onPick: (draft: SlotDraft) => void }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 ${SLOT_HOVER}`}
      onClick={() => onPick({ dateKey: dayKey })}
    />
  )
}
