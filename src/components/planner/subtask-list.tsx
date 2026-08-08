'use client'

import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { addSubtask, toggleSubtask, removeSubtask } from '@/server/actions/planner-actions'
import type { PlannerSubtask } from '@/domain/planner'

export function SubtaskList({ taskId, subtasks }: { taskId: string; subtasks: PlannerSubtask[] }) {
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  function onAdd() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    startTransition(() => void addSubtask(taskId, title))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Subtasks</span>

      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex h-11 items-center gap-2">
          {/* DESIGN.md's Two Densities Rule sets a 44px minimum touch target.
              The checkbox itself should read as a small box (matching the
              other checkbox affordances in this module), so the visible
              border sits on an inner `size-6` span while the button
              underneath it carries the full `size-11` hit target. */}
          <button
            type="button"
            aria-label={subtask.isDone ? `Mark ${subtask.title} as not done` : `Mark ${subtask.title} as done`}
            disabled={isPending}
            onClick={() => startTransition(() => void toggleSubtask(subtask.id, !subtask.isDone))}
            className="flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:opacity-50"
          >
            <span className="flex size-6 items-center justify-center rounded-md border border-input">
              {subtask.isDone ? <Check className="size-3" /> : null}
            </span>
          </button>
          {/* Done is never color alone (DESIGN.md, the Never-Color-Alone
              Rule): the muted tone is paired with a strikethrough. */}
          <span className={`min-w-0 flex-1 truncate text-sm ${subtask.isDone ? 'text-muted-foreground line-through' : ''}`}>
            {subtask.title}
          </span>
          <button
            type="button"
            aria-label={`Remove ${subtask.title}`}
            disabled={isPending}
            onClick={() => startTransition(() => void removeSubtask(subtask.id))}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the surrounding task form.
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          placeholder="Add a subtask"
          className="h-11 text-base md:text-sm"
        />
      </div>
    </div>
  )
}
