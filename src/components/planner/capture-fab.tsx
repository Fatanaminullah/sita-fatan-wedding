'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
