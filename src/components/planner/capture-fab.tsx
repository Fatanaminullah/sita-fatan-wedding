'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemSheet } from '@/components/planner/item-sheet'
import { quickCaptureTask } from '@/server/actions/planner-actions'
import type { DayKey } from '@/domain/planner'

/**
 * The interaction the planner lives or dies on: one field, keyboard already
 * up, save and it exists. Date defaults to today, assignee to both. Everything
 * else is an edit performed later, or never.
 */
export function CaptureFab({ defaultDateKey }: { defaultDateKey: DayKey }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  // Quick capture is a task-only, one-field shortcut: it has no room for an
  // event's start/end time or location, and no toggle to ask for one without
  // stopping being a one-field form. This owns the full `ItemSheet` in its
  // blank, new-item state (`item={null}`) as the escape hatch, so an event
  // (or a task that needs more than a title) is one deliberate tap away
  // instead of unreachable once the planner has any content. It is a second
  // `ItemSheet` instance alongside whichever one the mounting screen already
  // owns for editing existing items; that is safe because `ItemSheetForm`
  // namespaces every field id off its own `useId()` call, per the note on
  // `ItemSheet` itself.
  const [fullFormOpen, setFullFormOpen] = useState(false)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await quickCaptureTask(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setError(null)
      setOpen(false)
    })
  }

  function openFullForm() {
    setError(null)
    setOpen(false)
    setFullFormOpen(true)
  }

  return (
    <>
      {/* float-ambient (DESIGN.md, Elevation & Depth) is the only shadow this
          system allows, and only on dialogs, bottom sheets and this button.
          Both values are needed: the light rgba reads as mud once .dark is
          active, so the dark value is a separate declaration, not a tweak of
          the light one. */}
      <button
        type="button"
        aria-label="Add a task"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      >
        <Plus className="size-6" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
      >
        <SheetContent
          side="bottom"
          // `onOpenAutoFocus` does not exist on this library's Popup: this is
          // shadcn on Base UI, not Radix. Base UI's real equivalent is
          // `initialFocus`, which by default focuses the popup itself (not
          // the first field) when the dialog was opened by touch, precisely
          // to avoid yanking the virtual keyboard open uninvited. Quick
          // capture is the one place that behavior is wrong: the whole point
          // is the keyboard already being up, so this pins focus to the
          // title input regardless of how the sheet was opened.
          initialFocus={inputRef}
          className="shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <SheetHeader>
            <SheetTitle>Quick add</SheetTitle>
          </SheetHeader>
          <form action={onSubmit} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="dueDate" value={defaultDateKey} />
            <label htmlFor={titleId} className="sr-only">
              Task title
            </label>
            <Input
              ref={inputRef}
              id={titleId}
              name="title"
              placeholder="What needs doing?"
              autoComplete="off"
              className="h-11 text-base md:text-sm"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={isPending} className="h-11">
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            {/* The escape hatch to the full form. A text link, not a second
                filled button, so Save stays the one primary action in this
                sheet (DESIGN.md: Operations Blue is spent on action and
                current-selection only). `min-h-11` plus `h-auto` keeps the
                Two Densities Rule's 44px touch target even though the label
                wraps to two lines on a narrow phone; the base Button
                component already carries the focus ring the Focus-Is-Sacred
                Rule requires. */}
            <Button
              type="button"
              variant="link"
              onClick={openFullForm}
              className="h-auto min-h-11 w-full justify-center px-0 py-1 text-center text-sm font-normal text-wrap"
            >
              Need a date, a time or an event? Open the full form.
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <ItemSheet item={null} open={fullFormOpen} onOpenChange={setFullFormOpen} defaultDateKey={defaultDateKey} />
    </>
  )
}
