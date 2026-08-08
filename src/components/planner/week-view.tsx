'use client'

import Link from 'next/link'
import { addDayKeys, layoutTimedEvents, type DayKey, type DaySegment, type PlannerEvent, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'
import { HourSlotLayer, type SlotDraft } from './slot-layer'

const HOUR_HEIGHT = 48

/** Shared focus and press treatment for the day-header links in this file,
 * matching the pattern already used by `CalendarNav` and `MonthView`
 * (DESIGN.md, the Focus-Is-Sacred Rule: the ring is never suppressed, so
 * every interactive element gets the themed replacement rather than relying
 * on the browser default). */
const HEADER_LINK = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px'

function weekDays(anchorKey: DayKey): DayKey[] {
  const anchor = new Date(`${anchorKey}T00:00:00`)
  const start = addDayKeys(anchorKey, -anchor.getDay())
  return Array.from({ length: 7 }, (_, offset) => addDayKeys(start, offset))
}

function dayLabel(dayKey: DayKey): string {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Two renderings, one component. Below `md` the hour grid is dropped
 * entirely rather than scrolled sideways (DESIGN.md, the No-Sideways Rule):
 * a seven-column hour grid cannot work at phone width, so it becomes a
 * grouped list instead. Every day header still renders, including empty
 * days, so the list keeps its bearings while scrolling.
 *
 * Both day-header links are a full 44px tall rather than the smaller sizes
 * this file's source plan sketched (`h-8` on phone, unsized text on desktop).
 * DESIGN.md's Two Densities Rule ties target size to the surface, not the
 * device: `CalendarNav`, which sits directly above this component, already
 * makes the same call for its own controls ("touch density is chosen from
 * the surface, never from the device"). Unlike `MonthView`'s day-number
 * links, there is no 42-cell density pressure here (7 headers, not 42) to
 * justify `MonthView`'s smaller-box-plus-hit-slop compromise, so the
 * simplest compliant choice is to just make the real box 44px.
 */
export function WeekView({
  anchorKey,
  segments,
  todayKey,
  onOpen,
  onPickSlot,
}: {
  anchorKey: DayKey
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  /**
   * Click on empty grid space. Desktop only: below `md` this view is an
   * agenda list with no hour grid, so there is no time to infer from a tap.
   */
  onPickSlot: (draft: SlotDraft) => void
}) {
  const days = weekDays(anchorKey)

  const itemsFor = (dayKey: DayKey) => segments.filter((s) => s.dayKey === dayKey).map((s) => s.item)
  const allDayFor = (dayKey: DayKey) =>
    segments.filter((s) => s.dayKey === dayKey && s.isAllDay).map((s) => s.item)
  const timedFor = (dayKey: DayKey) =>
    segments
      .filter((s) => s.dayKey === dayKey && !s.isAllDay && s.item.kind === 'event')
      .map((s) => s.item as PlannerItem & PlannerEvent)

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {days.map((dayKey) => {
          const items = itemsFor(dayKey)
          return (
            <section key={dayKey} className="flex flex-col gap-1">
              <Link
                href={`/planner/calendar?view=day&date=${dayKey}`}
                className={`flex h-11 items-center rounded-lg px-2 text-xs font-medium ${HEADER_LINK} ${
                  dayKey === todayKey ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {dayLabel(dayKey)}
              </Link>
              {items.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground">Nothing.</p>
              ) : (
                items.map((item) => (
                  <ItemChip key={`${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
                ))
              )}
            </section>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-card">
          <div />
          {days.map((dayKey) => (
            <Link
              key={dayKey}
              href={`/planner/calendar?view=day&date=${dayKey}`}
              className={`flex h-11 items-center justify-center px-2 text-center text-xs font-medium ${HEADER_LINK} ${
                dayKey === todayKey ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {dayLabel(dayKey)}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-card">
          <span className="px-2 py-1 text-xs text-muted-foreground">All day</span>
          {days.map((dayKey) => (
            <div key={dayKey} className="flex flex-col gap-0.5 border-l p-1">
              {allDayFor(dayKey).map((item) => (
                <ItemChip key={`ad-${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
              ))}
            </div>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-card">
          <div className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]" style={{ height: 24 * HOUR_HEIGHT }}>
            <div className="relative border-r">
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="absolute right-1 font-mono text-xs tabular-nums text-muted-foreground"
                  style={{ top: hour * HOUR_HEIGHT - 6 }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map((dayKey) => (
              <div key={dayKey} className="relative border-l">
                <HourSlotLayer dayKey={dayKey} hourHeightPx={HOUR_HEIGHT} onPick={onPickSlot} />

                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="absolute right-0 left-0 border-t border-border/60"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}
                {layoutTimedEvents(timedFor(dayKey), dayKey).map((layout) => (
                  <div
                    key={layout.event.id}
                    // Each day column here is its own CSS grid track, already
                    // positioned after the gutter column by the grid itself,
                    // so (unlike `DayView`, a single container that has to
                    // subtract an absolute gutter width out of a percentage
                    // formula) `laneIndex / laneCount` needs no gutter term:
                    // lane 0 already starts at this column's own 0%. Checked
                    // by hand for laneCount 2 and 3: the lanes tile edge to
                    // edge with no gap and no overflow past 100%.
                    //
                    // `overflow-hidden`: `layoutTimedEvents` floors a block's
                    // height at 30 minutes, which is exactly 24px at this
                    // view's HOUR_HEIGHT (48), the same as the compact
                    // `ItemChip`'s fixed `h-6`. That is an exact fit with no
                    // slack, so this stays defensive against the same
                    // spill-and-steal-taps failure `DayView` documented for
                    // its own (larger, non-compact) chip.
                    className="absolute overflow-hidden px-0.5"
                    style={{
                      top: (layout.topMinutes / 60) * HOUR_HEIGHT,
                      height: (layout.heightMinutes / 60) * HOUR_HEIGHT,
                      left: `${(layout.laneIndex / layout.laneCount) * 100}%`,
                      width: `${(1 / layout.laneCount) * 100}%`,
                    }}
                  >
                    <ItemChip
                      item={{ kind: 'event', ...layout.event }}
                      todayKey={todayKey}
                      onOpen={onOpen}
                      compact
                      fill
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
