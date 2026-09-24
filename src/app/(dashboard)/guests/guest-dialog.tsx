'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createGuest, deleteGuest, setGuestCandid, updateGuest, type GuestFormResult } from '@/server/actions/guest-actions'
import { RsvpSection } from './rsvp-section'
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
import { inviterLabel } from '@/lib/inviter-label'

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
  canAnswerRsvp = false,
  canSetCandid = false,
  onClose,
}: {
  state: GuestDialogState
  inviters: string[]
  canAnswerRsvp?: boolean
  canSetCandid?: boolean
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
      // The home-photo flag is its own action with its own guard, saved
      // after the row so a refused flag never loses the rest of the edit.
      if (canSetCandid) {
        const want = formData.get('candid') === 'on'
        const have = guest?.candid ?? false
        if (want !== have) {
          const fd = new FormData()
          fd.set('guestId', result.guestId)
          fd.set('candid', want ? 'on' : 'off')
          const r = await setGuestCandid(fd)
          if ('error' in r) {
            setError(r.error)
            return
          }
        }
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
                    {inviterLabel(key)}
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

          {/* Edit only, and deliberately not on the create form.
              guests_default_language derives the language from `candid` on
              INSERT (20260920120000), so an explicit English for a guest on
              the hijab invitation would be overridden and the field would be
              lying. On UPDATE the trigger only intervenes when `candid`
              changes in the same statement, which this form never writes, so
              a choice made here stands. */}
          {guest ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-language">Language</Label>
              <select
                id="guest-language"
                name="language"
                className="h-9 rounded-lg border bg-background px-2 text-sm"
                defaultValue={guest.language}
              >
                <option value="en">English</option>
                <option value="id">Indonesian</option>
              </select>
              <p className="text-xs text-muted-foreground">
                The WhatsApp message and the invitation page both open in this.
              </p>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isVip"
              defaultChecked={guest?.isVip ?? false}
              className="size-4 rounded border-input"
            />
            VIP (a tier on Resepsi, capped per side)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPhysicalInvitation"
              defaultChecked={guest?.isPhysicalInvitation ?? false}
              className="size-4 rounded border-input"
            />
            Physical invitation (printed card instead of digital)
          </label>

          {/* Only for a guest already marked physical, because handing over a
              card nobody is printing is not a state. Ticking the box above for
              the first time therefore shows this on the next open, which is
              the right order: print it, hand it over, tick it.

              The hidden companion field is what tells "unticked" apart from
              "this form never asked": an unticked checkbox sends nothing. */}
          {guest?.isPhysicalInvitation ? (
            <>
              <input type="hidden" name="physicalGivenOffered" value="1" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="physicalGiven"
                  defaultChecked={Boolean(guest.physicalGivenAt)}
                  className="size-4 rounded border-input"
                />
                Card handed over
              </label>
            </>
          ) : null}

          {canSetCandid ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="candid" defaultChecked={guest?.candid ?? false} className="size-4 rounded border-input" />
              Non-hijab invitation (unveiled photographs, both events shown; superadmin only)
            </label>
          ) : null}

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

          {/* Outside the form's own submit on purpose: each answer saves by
              itself, so fixing a phone number does not mean re-answering, and
              answering does not mean re-saving the whole guest. Only shown on
              an existing guest, since a guest being created has no invitation
              to answer yet. */}
          {guest && canAnswerRsvp ? <RsvpSection guest={guest} /> : null}

          {/* flex-col, not the footer's default flex-col-reverse. Reversed put
              Delete at the bottom of a phone screen, directly under the thumb,
              which The Thumb Rule in DESIGN.md exists to prevent: destructive
              actions never live in the thumb zone. Delete now sits above the
              pair, and Cancel and Save share the width below it. */}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {guest ? (
              confirmingDelete ? (
                <span className="flex items-center gap-2 self-start">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-11 sm:h-8"
                    onClick={handleDelete}
                    disabled={pending}
                  >
                    Delete for good
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 sm:h-8"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep
                  </Button>
                </span>
              ) : (
                // Touch density on a phone, ops density from sm up. Left
                // rather than stretched, so a full-width destructive button
                // never reads as the obvious thing to press.
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 self-start text-destructive sm:h-8 sm:self-auto"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              )
            ) : (
              <span />
            )}

            <span className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={close}>
                {flags.length > 0 ? 'Done' : 'Cancel'}
              </Button>
              <Button type="submit" className="h-11 sm:h-9" disabled={pending}>
                {pending ? 'Saving...' : guest ? 'Save changes' : 'Add guest'}
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
