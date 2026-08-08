'use client'

import { useState, useSyncExternalStore } from 'react'
import { MonthView } from '@/components/planner/month-view'
import { DayView } from '@/components/planner/day-view'
import { WeekView } from '@/components/planner/week-view'
import { CalendarNav, type CalendarView } from '@/components/planner/calendar-nav'
import { CaptureFab } from '@/components/planner/capture-fab'
import { ItemSheet } from '@/components/planner/item-sheet'
import { useSwipePeriod } from '@/components/planner/use-swipe-period'
import type { SlotDraft } from '@/components/planner/slot-layer'
import { useIsMobile } from '@/hooks/use-mobile'
import type { DayKey, DaySegment, PlannerItem, PlannerSubtask } from '@/domain/planner'

/**
 * `useIsMobile` (`src/hooks/use-mobile.ts`) is a lazy `useState` initializer,
 * `useState<boolean>(getIsMobile)`, not a `useSyncExternalStore` with a
 * `getServerSnapshot`. A lazy initializer runs fresh in whatever environment
 * is rendering: on the server `window` is undefined so it yields `false`,
 * but on hydration React re-executes the component in the real browser,
 * where it yields the true viewport answer on the FIRST client render, not
 * a later one. So on a phone with no `?view=`, the server sends `MonthView`'s
 * markup while the first client render already wants `DayView`'s, two
 * structurally different trees, which React reports as a hydration error
 * and recovers from by discarding and client-rendering that subtree.
 *
 * `hasMounted` exists to keep the first client render identical to the
 * server's regardless of what `useIsMobile` already knows, deferring the
 * device-dependent branch until a render that is demonstrably past
 * hydration. It is not wired through `useEffect` + `setState`: that pattern
 * trips this repo's `react-hooks/set-state-in-effect` lint rule as an error
 * (see `day-view.tsx`'s clock for the same constraint), and it is also just
 * a slower way to reach the same render. Instead this reuses the
 * `useSyncExternalStore` trick `DayView`'s clock uses: `getServerSnapshot`
 * returns `false` for both the SSR pass and the first client pass, so the
 * two agree and hydration stays silent, and React's own built-in
 * post-hydration snapshot check then finds `getSnapshot`'s `true` and forces
 * exactly one more render with the real value, no manual effect required.
 * `use-mobile.ts` itself is untouched: this lives entirely in this file.
 */
function subscribeNever() {
  return () => {}
}
function getMountedSnapshot() {
  return true
}
function getServerMountedSnapshot() {
  return false
}

export function CalendarSurface({
  view,
  viewWasExplicit,
  dateKey,
  monthKey,
  segments,
  todayKey,
  subtasksByTaskId,
}: {
  view: CalendarView
  /** True when the URL's `?view=` was one of the three known values. False
   * when it was absent or malformed, in which case the server already fell
   * back to `month` (see `readView` in `page.tsx`) purely so it has
   * something to fetch a data range for; the actual default view is a
   * client-only decision, resolved below. */
  viewWasExplicit: boolean
  dateKey: DayKey
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
  subtasksByTaskId: Record<string, PlannerSubtask[]>
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)
  /** Set by a click on empty calendar space, to open the form pre-seeded. */
  const [draft, setDraft] = useState<SlotDraft | null>(null)

  // One modal, two jobs, so the two states must never both be set: whichever
  // the user just asked for wins and clears the other. Without this, opening
  // an item and then clicking a slot would leave `openItem` set, and the edit
  // branch would silently win over the slot the user actually clicked.
  function editItem(item: PlannerItem) {
    setDraft(null)
    setOpenItem(item)
  }

  function pickSlot(next: SlotDraft) {
    setOpenItem(null)
    setDraft(next)
  }
  const hasMounted = useSyncExternalStore(subscribeNever, getMountedSnapshot, getServerMountedSnapshot)
  const isMobile = useIsMobile()
  // The server cannot know the viewport, so an unspecified view resolves
  // here, and only once `hasMounted` is true (see the comment above): that
  // keeps the server render and the first client render both `month`, so
  // hydration stays silent, then flips to `day` on a phone in the very next
  // render. That trades the hydration error for a brief, visible flash from
  // the month grid to the day view on a phone with no explicit `?view=`,
  // which is the correct trade.
  const resolvedView: CalendarView = viewWasExplicit ? view : hasMounted && isMobile ? 'day' : 'month'
  // `resolvedView`, not the raw `view` prop: the swipe must page whichever
  // view the user is actually looking at, including the client-only mobile
  // default that `view` alone does not capture.
  const swipe = useSwipePeriod({ view: resolvedView, dateKey })

  return (
    <>
      <CalendarNav view={resolvedView} dateKey={dateKey} />
      <div {...swipe} className="touch-pan-y">
        {resolvedView === 'month' ? (
          <MonthView
            monthKey={monthKey}
            segments={segments}
            todayKey={todayKey}
            onOpen={editItem}
            onPickSlot={pickSlot}
          />
        ) : resolvedView === 'day' ? (
          <DayView
            dayKey={dateKey}
            segments={segments}
            todayKey={todayKey}
            onOpen={editItem}
            onPickSlot={pickSlot}
          />
        ) : (
          <WeekView
            anchorKey={dateKey}
            segments={segments}
            todayKey={todayKey}
            onOpen={editItem}
            onPickSlot={pickSlot}
          />
        )}
      </div>
      {/* One sheet serves both jobs. `openItem` set means edit that item;
          `draft` set means create a new one seeded from the clicked slot.
          They are mutually exclusive because each setter clears the other. */}
      <ItemSheet
        item={openItem}
        open={openItem !== null || draft !== null}
        onOpenChange={(next) => {
          if (!next) {
            setOpenItem(null)
            setDraft(null)
          }
        }}
        defaultDateKey={draft?.dateKey ?? dateKey}
        // A slot with a time came from an hour grid, so it means an event at
        // that hour. A month cell has no time, so it means a task on that day.
        defaultKind={draft?.startTime ? 'event' : 'task'}
        defaultStartTime={draft?.startTime ?? '09:00'}
        defaultEndTime={draft?.endTime ?? '10:00'}
        subtasks={openItem ? (subtasksByTaskId[openItem.id] ?? []) : []}
      />
      <CaptureFab defaultDateKey={dateKey} />
    </>
  )
}
