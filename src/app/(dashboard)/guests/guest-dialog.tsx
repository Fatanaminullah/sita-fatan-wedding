'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createGuest, deleteGuest, updateGuest, type GuestFormResult } from '@/server/actions/guest-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { GuestListRow } from './guest-table'

const fieldClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export type GuestDialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; guest: GuestListRow }

function EventSelect({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string
  name: string
  label: string
  defaultValue: GuestListRow['akad']
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} className={fieldClass} defaultValue={defaultValue}>
        <option value="none">Not invited</option>
        <option value="confirmed">Invited</option>
        <option value="waitlisted">Waiting list</option>
      </select>
    </div>
  )
}

export function GuestDialog({
  state,
  inviters,
  onClose,
}: {
  state: GuestDialogState
  inviters: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [flags, setFlags] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const guest = state.mode === 'edit' ? state.guest : null
  const open = state.mode !== 'closed'

  function close() {
    setError(null)
    setFlags([])
    setConfirmingDelete(false)
    onClose()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    setFlags([])
    startTransition(async () => {
      const result: GuestFormResult = guest ? await updateGuest(formData) : await createGuest(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
      // Over-cap and phone flags are the whole point of "warn, allow, flag":
      // the row is already saved, so hold the dialog open to say what happened
      // rather than closing over the warning.
      if (result.flags.length > 0) {
        setFlags(result.flags)
        return
      }
      close()
    })
  }

  function handleDelete() {
    if (!guest) return
    const formData = new FormData()
    formData.set('guestId', guest.id)
    startTransition(async () => {
      const result = await deleteGuest(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
      close()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{guest ? `Edit ${guest.name}` : 'Add guest'}</DialogTitle>
          <DialogDescription>
            {guest
              ? 'Every field is editable. Side follows the inviter.'
              : 'Over-cap entries still save, they are flagged afterwards.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {guest ? <input type="hidden" name="guestId" value={guest.id} /> : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" name="name" defaultValue={guest?.name ?? ''} required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-pax">Pax</Label>
              <Input
                id="guest-pax"
                name="pax"
                type="number"
                min={1}
                defaultValue={guest?.pax ?? 1}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-inviter">Inviter</Label>
              <select
                id="guest-inviter"
                name="inviterKey"
                className={fieldClass}
                defaultValue={guest?.inviterKey ?? (inviters.length === 1 ? inviters[0] : '')}
                required
              >
                <option value="" disabled>
                  Select inviter
                </option>
                {inviters.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-type">Type</Label>
              <select
                id="guest-type"
                name="type"
                className={fieldClass}
                defaultValue={guest?.type ?? 'friend'}
                required
              >
                <option value="family">Family</option>
                <option value="friend">Friend</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-phone">Whatsapp</Label>
              <Input
                id="guest-phone"
                name="phone"
                defaultValue={guest?.phone ?? ''}
                placeholder="0812 3456 7890"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <EventSelect id="guest-akad" name="akad" label="Akad" defaultValue={guest?.akad ?? 'none'} />
            <EventSelect
              id="guest-resepsi"
              name="resepsi"
              label="Resepsi"
              defaultValue={guest?.resepsi ?? 'confirmed'}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guest-note">Note</Label>
            <Input id="guest-note" name="note" defaultValue={guest?.note ?? ''} placeholder="Kel. Uti, SMA, CNI" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isVip"
              defaultChecked={guest?.isVip ?? false}
              className="size-4 rounded border-input"
            />
            VIP (a tier on Resepsi, capped per side)
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {flags.length > 0 ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="mb-1 font-medium">Saved, with warnings:</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                {flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {guest ? (
              confirmingDelete ? (
                <span className="flex items-center gap-2">
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
                    Delete for good
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              )
            ) : (
              <span />
            )}

            <span className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={close}>
                {flags.length > 0 ? 'Done' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving...' : guest ? 'Save changes' : 'Add guest'}
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
