'use client'

import { minutesToClock, slotFromOffset, type DayKey } from '@/domain/planner'

export type SlotDraft = {
  dateKey: DayKey
  /** Absent for a whole-day target, such as a month cell. */
  startTime?: string
  endTime?: string
}

/**
 * The click target that turns empty calendar space into a new item.
 *
 * It renders BEFORE the events in its container on purpose. Both are
 * positioned, so a later sibling paints above an earlier one: existing chips
 * keep receiving their own clicks and still open for edit, and only genuinely
 * empty space reaches this layer. The consequence is that a fully booked hour
 * has nothing left to click, which is the correct behaviour rather than a
 * limitation.
 *
 * Pointer-only, deliberately. Making every half hour keyboard reachable would
 * add 24 tab stops to the day view and 168 to the week view, which would ruin
 * tab order for everyone to serve a path the capture button already covers:
 * it opens the same form, with the same fields, from one tab stop.
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
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      onClick={(event) => {
        // `currentTarget` is this layer, so the offset is measured against the
        // grid itself rather than whatever nested element was under the cursor.
        const top = event.currentTarget.getBoundingClientRect().top
        const { startMinutes, endMinutes } = slotFromOffset(event.clientY - top, hourHeightPx)
        onPick({
          dateKey: dayKey,
          startTime: minutesToClock(startMinutes),
          endTime: minutesToClock(endMinutes),
        })
      }}
    />
  )
}

/**
 * The month-cell equivalent. A month cell carries no time, so it seeds only
 * the date and lets the form default the rest.
 */
export function DaySlotLayer({ dayKey, onPick }: { dayKey: DayKey; onPick: (draft: SlotDraft) => void }) {
  return <div aria-hidden className="absolute inset-0" onClick={() => onPick({ dateKey: dayKey })} />
}
