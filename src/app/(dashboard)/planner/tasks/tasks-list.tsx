'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { ItemChip } from '@/components/planner/item-chip'
import { ItemSheet } from '@/components/planner/item-sheet'
import { CaptureFab } from '@/components/planner/capture-fab'
import type { DayKey, PlannerItem, PlannerSubtask, PlannerTask } from '@/domain/planner'

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/**
 * Pill geometry (`rounded-full`) is right here even though it is a control,
 * not a status indicator: DESIGN.md's Chips section names "solid blue for a
 * selected filter" as one of the pill's sanctioned variants, so a filter
 * chip is the one kind of control the Pill Is Status Rule already carves
 * out room for.
 *
 * Height is `h-11`, not the Chips section's own 28px touch figure, for the
 * same reason `calendar-nav.tsx`'s view switcher is `h-11` rather than
 * `h-9`: DESIGN.md's Two Densities Rule picks density from the surface, not
 * from a component's default, and these are the primary controls on a
 * touch-density planner page. The generic chip height governs a chip
 * sitting inside an `ItemChip` row; here the chip *is* the control.
 *
 * The unselected tone is a hairline outline with no fill, not the
 * `secondary`/wash-blue token: wash-blue is the Chips section's "set but
 * neutral value" variant, not "not currently selected". Filling every
 * unselected option would put color on this row at rest, which is what the
 * Spent Color Rule rules out.
 */
const CHIP_SELECTED = 'bg-primary text-primary-foreground'
const CHIP_UNSELECTED = 'ring-1 ring-foreground/10 text-foreground hover:bg-muted'
const CHIP_FOCUS =
  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px transition-colors'

export function TasksList({
  tasks,
  todayKey,
  hideDone,
  assignee,
  subtasksByTaskId,
}: {
  tasks: PlannerTask[]
  todayKey: DayKey
  hideDone: boolean
  assignee: 'all' | 'fatan' | 'sita'
  subtasksByTaskId: Record<string, PlannerSubtask[]>
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)

  const visible = tasks.filter((task) => {
    if (hideDone && task.status === 'done') return false
    if (assignee !== 'all' && task.assignee !== assignee && task.assignee !== 'both') return false
    return true
  })

  const dated = visible.filter((task) => task.dueDate !== null)
  const undated = visible.filter((task) => task.dueDate === null)

  const byMonth = new Map<string, PlannerTask[]>()
  for (const task of dated) {
    const monthKey = task.dueDate!.slice(0, 7)
    byMonth.set(monthKey, [...(byMonth.get(monthKey) ?? []), task])
  }
  const months = [...byMonth.keys()].sort()

  function filterHref(next: Partial<{ hideDone: boolean; assignee: string }>) {
    const params = new URLSearchParams()
    const nextAssignee = next.assignee ?? assignee
    const nextHideDone = next.hideDone ?? hideDone
    if (nextAssignee !== 'all') params.set('assignee', nextAssignee)
    if (nextHideDone) params.set('hideDone', '1')
    const query = params.toString()
    return query ? `/planner/tasks?${query}` : '/planner/tasks'
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'fatan', 'sita'] as const).map((option) => (
          <Link
            key={option}
            href={filterHref({ assignee: option })}
            aria-current={option === assignee ? 'page' : undefined}
            className={`flex h-11 items-center rounded-full px-3 text-xs font-medium capitalize ${CHIP_FOCUS} ${
              option === assignee ? CHIP_SELECTED : CHIP_UNSELECTED
            }`}
          >
            {option}
          </Link>
        ))}
        <Link
          href={filterHref({ hideDone: !hideDone })}
          aria-current={hideDone ? 'page' : undefined}
          className={`flex h-11 items-center gap-1 rounded-full px-3 text-xs font-medium ${CHIP_FOCUS} ${
            hideDone ? CHIP_SELECTED : CHIP_UNSELECTED
          }`}
        >
          {/* Selection here is never color alone (DESIGN.md, the
              Never-Color-Alone Rule): the assignee chips above are a
              mutually exclusive set where the filled pill itself is the
              signal, same as the day/week/month switcher in
              calendar-nav.tsx, but "Hide done" is a true on/off toggle with
              only one chip to look at, so it gets its own non-color tell. */}
          {hideDone ? <Check className="size-3 shrink-0" aria-hidden /> : null}
          Hide done
        </Link>
      </div>

      {months.map((monthKey) => (
        <section key={monthKey} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">{monthLabel(monthKey)}</h2>
          {byMonth.get(monthKey)!.map((task) => (
            <ItemChip
              key={task.id}
              item={{ kind: 'task', ...task }}
              todayKey={todayKey}
              onOpen={setOpenItem}
              showDate
            />
          ))}
        </section>
      ))}

      {undated.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">Unscheduled</h2>
          {undated.map((task) => (
            <ItemChip key={task.id} item={{ kind: 'task', ...task }} todayKey={todayKey} onOpen={setOpenItem} />
          ))}
        </section>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches this filter. Add a task with the button below.</p>
      ) : null}

      <ItemSheet
        item={openItem}
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null)
        }}
        defaultDateKey={todayKey}
        subtasks={openItem ? (subtasksByTaskId[openItem.id] ?? []) : []}
      />
      <CaptureFab defaultDateKey={todayKey} />
    </>
  )
}
