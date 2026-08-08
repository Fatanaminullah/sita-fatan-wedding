'use client'

import { useId, useState, useTransition } from 'react'
import { ResponsiveModal } from './responsive-modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SubtaskList } from './subtask-list'
import { saveTask, saveEvent, removeTask, removeEvent } from '@/server/actions/planner-actions'
import type { DayKey, PlannerItem, PlannerSubtask } from '@/domain/planner'

type Kind = 'task' | 'event'

function timeOf(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dayOf(iso: string): DayKey {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * The fields, the task/event toggle, and the save/delete logic all live in
 * here rather than in `ItemSheet` directly, so that `ItemSheet` can key this
 * component by the edited item's identity without tearing down the
 * `Sheet`/`SheetContent` shell that owns the open/close transition.
 *
 * Why the key is needed, not just nice to have: every field below is an
 * uncontrolled input using `defaultValue`/`defaultChecked`, and React reads
 * those exactly once, at mount. `ItemSheet` stays mounted across the whole
 * calendar session while `item` swaps from one task to another (or to an
 * event, or to null) as the user opens different chips, so without a key
 * every field would keep showing whichever item was current the first time
 * this ever mounted. The `kind` state below has the same problem one level
 * up: `useState(item?.kind ?? 'task')` only reads `item` on the initial
 * render, so once frozen it does not track later items either. Keying on
 * `item?.id ?? 'new'` (done in `ItemSheet`) forces a full remount, and a full
 * remount is what actually resets both.
 */
function ItemSheetForm({
  item,
  defaultDateKey,
  onOpenChange,
  subtasks,
}: {
  item: PlannerItem | null
  defaultDateKey: DayKey
  onOpenChange: (open: boolean) => void
  subtasks: PlannerSubtask[]
}) {
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'task')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Two `ItemSheet`s can be mounted at once (planner home and the calendar),
  // and this component remounts on every item swap besides. A hardcoded id
  // would collide across instances, breaking every `<Label htmlFor>` in the
  // second one to mount. `useId` is stable for this instance's lifetime and
  // unique across instances, so every id below is namespaced off it.
  const uid = useId()

  const activeKind: Kind = item ? item.kind : kind

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = activeKind === 'task' ? await saveTask(formData) : await saveEvent(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setError(null)
      onOpenChange(false)
    })
  }

  function onDelete() {
    if (!item) return
    startTransition(async () => {
      const result = item.kind === 'task' ? await removeTask(item.id) : await removeEvent(item.id)
      if ('error' in result) {
        setError(result.error)
        return
      }
      onOpenChange(false)
    })
  }

  return (
    <>
      {item ? (
        // DESIGN.md's Thumb Rule: controls used every time (Save, at the
        // bottom of the form below) belong in the bottom-thumb zone on
        // phone, but destructive actions are named as the explicit
        // exception and must not. The brief's original layout put Delete
        // right next to Save at the very bottom of a bottom sheet, which is
        // the single most thumb-reachable spot on the whole screen. Moving
        // it up here, right under the title and on its own, puts it where
        // reaching it takes a deliberate motion instead of a reflex tap.
        <div className="px-4">
          <Button type="button" variant="destructive" disabled={isPending} onClick={onDelete} className="h-11">
            Delete
          </Button>
        </div>
      ) : (
        <div className="mx-4 flex gap-1 rounded-lg bg-muted p-1">
          {(['task', 'event'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === activeKind}
              onClick={() => setKind(option)}
              className={`h-11 flex-1 rounded-md text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px ${
                option === activeKind ? 'bg-card text-foreground' : 'text-muted-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <form action={onSubmit} className="flex flex-col gap-3 p-4">
        {item ? <input type="hidden" name="id" value={item.id} /> : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-title`}>Title</Label>
          <Input
            id={`${uid}-title`}
            name="title"
            defaultValue={item?.title ?? ''}
            className="h-11 text-base md:text-sm"
          />
        </div>

        {activeKind === 'task' ? (
          <>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${uid}-due`}>Due</Label>
                <Input
                  id={`${uid}-due`}
                  name="dueDate"
                  type="date"
                  defaultValue={item?.kind === 'task' ? (item.dueDate ?? '') : defaultDateKey}
                  className="h-11 text-base md:text-sm"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${uid}-due-end`}>Until (optional)</Label>
                <Input
                  id={`${uid}-due-end`}
                  name="dueEndDate"
                  type="date"
                  defaultValue={item?.kind === 'task' ? (item.dueEndDate ?? '') : ''}
                  className="h-11 text-base md:text-sm"
                />
              </div>
            </div>

            <label className="flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isFlagged"
                defaultChecked={item?.kind === 'task' ? item.isFlagged : false}
                className="size-5"
              />
              Blocked on someone else
            </label>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-date`}>Date</Label>
              <Input
                id={`${uid}-date`}
                name="date"
                type="date"
                defaultValue={item?.kind === 'event' ? dayOf(item.startsAt) : defaultDateKey}
                className="h-11 text-base md:text-sm"
              />
            </div>

            <label className="flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allDay"
                defaultChecked={item?.kind === 'event' ? item.allDay : false}
                className="size-5"
              />
              All day
            </label>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${uid}-start`}>Start</Label>
                <Input
                  id={`${uid}-start`}
                  name="startTime"
                  type="time"
                  defaultValue={item?.kind === 'event' ? timeOf(item.startsAt) : '09:00'}
                  className="h-11 text-base md:text-sm"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${uid}-end`}>End</Label>
                <Input
                  id={`${uid}-end`}
                  name="endTime"
                  type="time"
                  defaultValue={item?.kind === 'event' ? timeOf(item.endsAt) : '10:00'}
                  className="h-11 text-base md:text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-location`}>Location</Label>
              <Input
                id={`${uid}-location`}
                name="location"
                defaultValue={item?.kind === 'event' ? (item.location ?? '') : ''}
                className="h-11 text-base md:text-sm"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-assignee`}>Who</Label>
          <select
            id={`${uid}-assignee`}
            name="assignee"
            defaultValue={item?.assignee ?? 'both'}
            className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
          >
            <option value="both">Both</option>
            <option value="fatan">Fatan</option>
            <option value="sita">Sita</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-notes`}>Notes</Label>
          <textarea
            id={`${uid}-notes`}
            name="notes"
            rows={3}
            defaultValue={item?.notes ?? ''}
            className="rounded-lg border border-input bg-transparent p-2.5 text-base md:text-sm"
          />
        </div>

        {item?.kind === 'task' ? <SubtaskList taskId={item.id} subtasks={subtasks} /> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={isPending} className="h-11">
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </>
  )
}

export function ItemSheet({
  item,
  open,
  onOpenChange,
  defaultDateKey,
  subtasks = [],
}: {
  item: PlannerItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDateKey: DayKey
  subtasks?: PlannerSubtask[]
}) {
  // Base UI keeps the popup mounted for its whole ~200ms closing transition,
  // but every caller (calendar-surface today, planner home and the task
  // list shortly) nulls `item` the instant it asks to close, before that
  // transition finishes. Rendering `item` directly would flip the keyed
  // `ItemSheetForm` below to its blank "new" state for the whole time the
  // sheet is visibly sliding away. Holding the last non-null item here fixes
  // that for every caller at once. It only stands in while `open` is false:
  // a genuinely fresh "new" session opens with `item` null and `open` true,
  // and that branch always reads `item` directly, never the held one, so it
  // still renders blank. And because the held value updates to any new
  // non-null `item` as soon as one arrives, opening item A, closing, then
  // opening a different item B shows B, not a stale A: `displayItem` tracks
  // `item` itself the moment `open` is true again.
  const [lastItem, setLastItem] = useState<PlannerItem | null>(item)
  if (item !== null && item !== lastItem) {
    setLastItem(item)
  }
  const displayItem = open ? item : (item ?? lastItem)

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={displayItem ? 'Edit' : 'New'}>
      {/* The close button is positioned absolutely inside the modal's own
          content element (see ui/sheet.tsx and ui/dialog.tsx), so the scroll
          container has to be this wrapper around the form only. Capping
          height and scrolling on the content itself would carry the close
          button off screen with the rest on a short viewport. `min-h-0` lets
          this flex child actually shrink below its content's height instead
          of forcing the modal to grow past `max-h-[85vh]`. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ItemSheetForm
          key={displayItem?.id ?? 'new'}
          item={displayItem}
          defaultDateKey={defaultDateKey}
          onOpenChange={onOpenChange}
          subtasks={subtasks}
        />
      </div>
    </ResponsiveModal>
  )
}
