'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { updateGuestField, type EditableField } from '@/server/actions/guest-actions'
import { Input } from '@/components/ui/input'
import type { GuestListRow } from './guest-table'

export type { EditableField }

const EVENT_OPTIONS = [
  { value: 'confirmed', label: 'Invited' },
  { value: 'waitlisted', label: 'Waiting' },
  { value: 'none', label: 'Not invited' },
]

export const EDITABLE_FIELDS: Array<{
  field: EditableField
  label: string
  inputType: 'text' | 'number' | 'select'
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}> = [
  { field: 'phone', label: 'Whatsapp', inputType: 'text', placeholder: '0812 3456 7890' },
  { field: 'note', label: 'Note', inputType: 'text', placeholder: 'Kel. Uti' },
  { field: 'akad', label: 'Akad', inputType: 'select', options: EVENT_OPTIONS },
  { field: 'resepsi', label: 'Resepsi', inputType: 'select', options: EVENT_OPTIONS },
  { field: 'pax', label: 'Pax', inputType: 'number' },
  { field: 'name', label: 'Name', inputType: 'text' },
]

type Draft = { value: string; failed?: string }
type Drafts = Record<string, Partial<Record<EditableField, Draft>>>
type Overrides = Record<string, Partial<Record<EditableField, string | number | null>>>
type CellStatus = 'idle' | 'saving' | 'saved' | 'error'

const DRAFTS_KEY = 'guests.inline-edit.drafts.v1'
const MODE_KEY = 'guests.inline-edit.mode.v1'
const FIELDS_KEY = 'guests.inline-edit.fields.v1'

// Stable fallbacks: useSyncExternalStore compares snapshots by identity, so a
// fresh {} on every read would loop forever.
const NO_DRAFTS: Drafts = {}
const PHONE_ONLY: EditableField[] = ['phone']
const EDIT_MODE_OFF = false

// The in-memory map is the source of truth and localStorage is its mirror, not
// the other way round. That way a blocked or full localStorage (private
// windows, quota) costs the reload safety net and nothing else: the table
// still edits normally for as long as the tab is open.
const cache = new Map<string, unknown>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab writing the same key invalidates our copy.
  const onStorage = (event: StorageEvent) => {
    if (event.key) cache.delete(event.key)
    onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function snapshot<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let value = fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    value = fallback
  }
  cache.set(key, value)
  return value
}

function usePersisted<T>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(key, fallback),
    () => fallback
  )

  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (previous: T) => T)(snapshot(key, fallback)) : next
      cache.set(key, resolved)
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved))
      } catch {
        // See the note above: losing the mirror is survivable, losing the
        // screen is not.
      }
      emit()
    },
    [key, fallback]
  )

  return [value, set] as const
}

export function cellKey(guestId: string, field: EditableField) {
  return `${guestId}:${field}`
}

/**
 * Inline editing for the guest table, built around one assumption: the person
 * doing it is holding a phone in one hand and typing with the other, and the
 * page can die at any moment. So every keystroke goes to localStorage first,
 * and a draft is only dropped once the server has confirmed the write.
 */
export function useInlineEdit(rows: GuestListRow[]) {
  const [editMode, setEditMode] = usePersisted(MODE_KEY, EDIT_MODE_OFF)
  const [fields, setFields] = usePersisted(FIELDS_KEY, PHONE_ONLY)
  const [drafts, setDrafts] = usePersisted(DRAFTS_KEY, NO_DRAFTS)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [status, setStatus] = useState<Record<string, CellStatus>>({})
  const [flags, setFlags] = useState<string[]>([])
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const pendingCount = useMemo(
    () => Object.values(drafts).reduce((sum, row) => sum + Object.keys(row).length, 0),
    [drafts]
  )

  // Leaving with edit mode on is almost always an accident, and an unsaved
  // cell is a phone number nobody will remember. Browsers show their own
  // wording; all we control is whether the prompt appears at all.
  useEffect(() => {
    if (!editMode && pendingCount === 0) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editMode, pendingCount])

  useEffect(() => {
    const timers = savedTimers.current
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer)
    }
  }, [])

  const serverValue = useCallback(
    (row: GuestListRow, field: EditableField): string => {
      const override = overrides[row.id]?.[field]
      const raw = override !== undefined ? override : row[field]
      return raw === null || raw === undefined ? '' : String(raw)
    },
    [overrides]
  )

  const valueOf = useCallback(
    (row: GuestListRow, field: EditableField): string => {
      const draft = drafts[row.id]?.[field]
      return draft ? draft.value : serverValue(row, field)
    },
    [drafts, serverValue]
  )

  const setDraft = useCallback((guestId: string, field: EditableField, value: string) => {
    setDrafts((previous) => ({
      ...previous,
      [guestId]: { ...previous[guestId], [field]: { value } },
    }))
  }, [setDrafts])

  const clearDraft = useCallback((guestId: string, field: EditableField) => {
    setDrafts((previous) => {
      const row = { ...previous[guestId] }
      delete row[field]
      const next = { ...previous }
      if (Object.keys(row).length === 0) delete next[guestId]
      else next[guestId] = row
      return next
    })
  }, [setDrafts])

  /**
   * Saves an explicit value rather than reading the draft map, because a
   * `<select>` commits in the same handler that set the draft, when the map
   * this closure captured is still one render behind.
   */
  const commitValue = useCallback(
    async (row: GuestListRow, field: EditableField, value: string) => {
      const key = cellKey(row.id, field)

      // Typed, then typed it back: nothing to save, and no reason to leave a
      // draft behind blocking the unload guard.
      if (value === serverValue(row, field)) {
        clearDraft(row.id, field)
        return
      }
      const draft = { value }

      setStatus((previous) => ({ ...previous, [key]: 'saving' }))
      const formData = new FormData()
      formData.set('guestId', row.id)
      formData.set('field', field)
      formData.set('value', draft.value)

      try {
        const result = await updateGuestField(formData)
        if ('error' in result) {
          setDrafts((previous) => ({
            ...previous,
            [row.id]: { ...previous[row.id], [field]: { value: draft.value, failed: result.error } },
          }))
          setStatus((previous) => ({ ...previous, [key]: 'error' }))
          return
        }
        setOverrides((previous) => ({
          ...previous,
          [row.id]: { ...previous[row.id], [field]: result.value },
        }))
        clearDraft(row.id, field)
        if (result.flags.length > 0) setFlags((previous) => [...new Set([...previous, ...result.flags])])
        setStatus((previous) => ({ ...previous, [key]: 'saved' }))
        savedTimers.current[key] = setTimeout(
          () => setStatus((previous) => ({ ...previous, [key]: 'idle' })),
          1500
        )
      } catch (error) {
        // Network loss lands here. The draft stays exactly where it is.
        const message = error instanceof Error ? error.message : 'Save failed'
        setDrafts((previous) => ({
          ...previous,
          [row.id]: { ...previous[row.id], [field]: { value: draft.value, failed: message } },
        }))
        setStatus((previous) => ({ ...previous, [key]: 'error' }))
      }
    },
    [serverValue, clearDraft, setDrafts]
  )

  const commit = useCallback(
    async (row: GuestListRow, field: EditableField) => {
      const draft = drafts[row.id]?.[field]
      if (!draft) return
      await commitValue(row, field, draft.value)
    },
    [drafts, commitValue]
  )

  const saveAll = useCallback(async () => {
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const [guestId, row] of Object.entries(drafts)) {
      const target = byId.get(guestId)
      if (!target) continue
      for (const field of Object.keys(row) as EditableField[]) {
        await commit(target, field)
      }
    }
  }, [drafts, rows, commit])

  const discardDrafts = useCallback(() => {
    setDrafts(NO_DRAFTS)
    setStatus({})
  }, [setDrafts])

  const toggleField = useCallback((field: EditableField) => {
    setFields((previous) =>
      previous.includes(field) ? previous.filter((item) => item !== field) : [...previous, field]
    )
  }, [setFields])

  return {
    editMode,
    setEditMode,
    fields,
    toggleField,
    drafts,
    pendingCount,
    status,
    flags,
    dismissFlags: () => setFlags([]),
    valueOf,
    serverValue,
    setDraft,
    commit,
    commitValue,
    saveAll,
    discardDrafts,
    isEditing: (field: EditableField) => editMode && fields.includes(field),
  }
}

export type InlineEdit = ReturnType<typeof useInlineEdit>

export function EditableCell({
  row,
  field,
  edit,
  className,
}: {
  row: GuestListRow
  field: EditableField
  edit: InlineEdit
  className?: string
}) {
  const definition = EDITABLE_FIELDS.find((item) => item.field === field)!
  const key = cellKey(row.id, field)
  const state = edit.status[key] ?? 'idle'
  const failed = edit.drafts[row.id]?.[field]?.failed
  const dirty = Boolean(edit.drafts[row.id]?.[field]) && !failed
  const stateClass = `${failed ? 'border-destructive' : dirty ? 'border-warning' : ''} ${
    state === 'saved' ? 'border-chart-3' : ''
  }`

  // A three-way status has no half-typed state to protect, so it saves on
  // change instead of on blur: one click, one write, no second gesture.
  if (definition.inputType === 'select') {
    return (
      <span className="flex flex-col gap-1">
        <select
          value={edit.valueOf(row, field)}
          onChange={(event) => {
            edit.setDraft(row.id, field, event.target.value)
            void edit.commitValue(row, field, event.target.value)
          }}
          aria-label={`${definition.label} for ${row.name}`}
          className={`flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${stateClass} ${className ?? ''}`}
        >
          {definition.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {failed ? <span className="text-xs text-destructive">{failed}</span> : null}
        {state === 'saving' ? <span className="text-xs text-muted-foreground">Saving...</span> : null}
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-1">
      <Input
        value={edit.valueOf(row, field)}
        type={definition.inputType}
        min={definition.inputType === 'number' ? 1 : undefined}
        placeholder={definition.placeholder}
        onChange={(event) => edit.setDraft(row.id, field, event.target.value)}
        onBlur={() => edit.commit(row, field)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            edit.setDraft(row.id, field, edit.serverValue(row, field))
          }
        }}
        aria-label={`${definition.label} for ${row.name}`}
        className={`h-8 ${stateClass} ${className ?? ''}`}
      />
      {failed ? <span className="text-xs text-destructive">{failed}</span> : null}
      {state === 'saving' ? <span className="text-xs text-muted-foreground">Saving...</span> : null}
    </span>
  )
}
