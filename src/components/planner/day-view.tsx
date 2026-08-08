'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { layoutTimedEvents, type DayKey, type DaySegment, type PlannerEvent, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const HOUR_HEIGHT = 56
const SCROLL_TO_HOUR = 7
/** The hour-label gutter width. Matches the `left-14` Tailwind utility used below. */
const GUTTER = '3.5rem'

/**
 * The clock is read through `useSyncExternalStore`, not `useState` +
 * `useEffect`, for two reasons.
 *
 * First, correctness: this "use client" component is still server-rendered
 * for the first HTML paint (Next.js renders every component tree once on the
 * server regardless of the directive). Computing `new Date()` directly during
 * render, as an earlier draft of this file did, bakes a server-clock value
 * into the SSR'd `style.top`; the browser then computes a different value at
 * hydration and React logs a "Warning: Prop `style` did not match" console
 * warning while it patches the DOM to the client's number.
 * `useSyncExternalStore`'s `getServerSnapshot` parameter exists specifically
 * for values like this one, that are legitimately allowed to differ between
 * server and client: React uses it for the server render *and* the first
 * client render (so the two match and hydration is silent), then re-renders
 * once more right after mount with the real `getSnapshot` value.
 *
 * Second, lint: an equivalent `useEffect(() => setNow(...), [...])` trips
 * `react-hooks/set-state-in-effect` ("Calling setState synchronously within
 * an effect can trigger cascading renders"), which this repo's `npm run
 * lint` treats as an error.
 *
 * This fixes the hydration mismatch, not the separate question of whether
 * `date.getHours()` reads the right timezone at all: see task-12-report.md
 * for why that is a pre-existing, out-of-scope assumption shared with
 * `todayKey` in `page.tsx`.
 *
 * The subscription itself ticks roughly once a minute so the line actually
 * moves rather than freezing at whatever instant the post-hydration
 * catch-up render happened to run.
 */
function subscribeToClockTick(callback: () => void) {
  const id = setInterval(callback, 60_000)
  return () => clearInterval(id)
}

function getNowMinutes(): number {
  const date = new Date()
  return date.getHours() * 60 + date.getMinutes()
}

/** Unknown until the client has mounted; negative means "don't draw the line yet". */
function getServerNowMinutes(): number {
  return -1
}

export function DayView({
  dayKey,
  segments,
  todayKey,
  onOpen,
}: {
  dayKey: DayKey
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
  }, [dayKey])

  const onThisDay = segments.filter((segment) => segment.dayKey === dayKey)
  const allDayItems = onThisDay.filter((segment) => segment.isAllDay).map((segment) => segment.item)
  const timedEvents = onThisDay
    .filter((segment) => !segment.isAllDay && segment.item.kind === 'event')
    .map((segment) => segment.item as PlannerItem & PlannerEvent)
  const layouts = layoutTimedEvents(timedEvents, dayKey)

  const nowMinutes = useSyncExternalStore(subscribeToClockTick, getNowMinutes, getServerNowMinutes)
  const showNowLine = dayKey === todayKey && nowMinutes >= 0
  const nowLabel = showNowLine
    ? `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`
    : ''

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1 border-b bg-card p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">All day</span>
        {allDayItems.length === 0 ? (
          <span className="px-1 pb-1 text-xs text-muted-foreground">Nothing due.</span>
        ) : (
          allDayItems.map((item) => (
            <ItemChip key={`allday-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
          ))
        )}
      </div>

      <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto bg-card">
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute right-0 left-0 border-t border-border/60"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2 left-2 bg-card pr-1 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {showNowLine ? (
            // Operations Blue, not Alarm Red: DESIGN.md reserves red for
            // "something is already wrong" and already spends it on overdue
            // chips in this same view, while blue is explicitly the "you are
            // here" token (the current day in the month grid uses it too).
            // The now-line is a neutral temporal reference, not an alarm.
            //
            // DESIGN.md's Never-Color-Alone Rule: the line itself carries no
            // information for a colourblind or low-vision reader, so "now" is
            // spelled out as real text (matching how ItemChip pairs "Overdue"
            // text with red, not just a red tint) rather than relying on an
            // aria-label on an otherwise empty div.
            //
            // `pointer-events-none` on the whole marker, plus keeping the
            // label inside the gutter rather than at the lane-0 x-origin:
            // an event actually in progress renders in the same space this
            // marker crosses, and a marker is not allowed to steal a tap
            // meant for real content.
            <div
              className="pointer-events-none absolute inset-x-0 z-10 -translate-y-1/2"
              style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
            >
              <span className="absolute left-1 shrink-0 rounded-full bg-primary/10 px-1.5 py-px font-mono text-xs font-medium tabular-nums text-primary">
                Now {nowLabel}
              </span>
              <div className="absolute right-0 left-14 h-0.5 bg-primary" aria-hidden="true" />
            </div>
          ) : null}

          {layouts.map((layout) => (
            <div
              key={layout.event.id}
              // `overflow-hidden`: `layoutTimedEvents` floors a block's
              // height at 30 minutes (28px here), but `ItemChip`'s non-compact
              // variant is a fixed 44px, so any event shorter than about 47
              // minutes would otherwise spill past its own block and, being
              // later in DOM order for a same-lane neighbour, paint over and
              // intercept taps meant for that neighbour. Clipping to the
              // block keeps every chip's hit area inside its own time slot.
              className="absolute overflow-hidden px-1"
              style={{
                top: (layout.topMinutes / 60) * HOUR_HEIGHT,
                height: (layout.heightMinutes / 60) * HOUR_HEIGHT,
                // Lanes tile the space AFTER the gutter, not the full row
                // width: both terms are fractions of `(100% - GUTTER)`, so
                // lane 0 starts at the gutter and the last lane's right edge
                // lands exactly on the container's right edge for any
                // laneCount. See task-12-report.md for the arithmetic that
                // shows the naive `laneIndex/laneCount * 100%` version (using
                // the full row width as the fraction's base while still
                // subtracting an absolute gutter term) leaves a
                // `GUTTER/laneCount`-wide gap between lanes and overflows the
                // right edge by `GUTTER * (laneCount - 1) / laneCount`.
                left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${layout.laneIndex / layout.laneCount})`,
                width: `calc((100% - ${GUTTER}) / ${layout.laneCount})`,
              }}
            >
              <ItemChip
                item={{ kind: 'event', ...layout.event }}
                todayKey={todayKey}
                onOpen={onOpen}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
