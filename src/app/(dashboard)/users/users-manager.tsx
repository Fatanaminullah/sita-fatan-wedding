'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createUser,
  deleteUser,
  resetPassword,
  updateUser,
  type ManagedUser,
} from '@/server/actions/user-actions'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { inviterLabel } from '@/lib/inviter-label'

const fieldClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

const ROLE_HINT: Record<ManagedUser['role'], string> = {
  superadmin: 'Everything: planner, audit, caps, accounts, both sides',
  admin: 'Guest management and day-of tools for one side. No planner, audit, caps or accounts',
  inviter: 'Their own guests only',
  usher: 'Resepsi check-in only, no guest list',
  viewer: 'Read-only counts',
}

type Dialog =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; user: ManagedUser }
  | { mode: 'reset'; user: ManagedUser }

export function UsersManager({
  users,
  inviters,
  currentUserId,
}: {
  users: ManagedUser[]
  inviters: string[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<Dialog>({ mode: 'closed' })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [role, setRole] = useState<ManagedUser['role']>('inviter')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  function close() {
    setDialog({ mode: 'closed' })
    setError(null)
    setRole('inviter')
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createUser(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNotice(`Account created. Hand over the password yourself, it is not emailed.`)
      close()
      router.refresh()
    })
  }

  function openEdit(user: ManagedUser) {
    setRole(user.role)
    setDialog({ mode: 'edit', user })
  }

  function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await updateUser(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNotice('Account updated. A changed role applies from their next page load.')
      close()
      router.refresh()
    })
  }

  function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await resetPassword(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNotice('Password changed. Tell them the new one directly.')
      close()
    })
  }

  function handleDelete(userId: string) {
    const formData = new FormData()
    formData.set('userId', userId)
    startTransition(async () => {
      const result = await deleteUser(formData)
      if ('error' in result) {
        setNotice(null)
        setError(result.error)
        return
      }
      setConfirmingDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">{users.length} accounts</p>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="size-4" aria-hidden /> Add account
        </Button>
      </div>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error && dialog.mode === 'closed' ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Last sign in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userId}>
                <TableCell className="font-medium">{user.fullName}</TableCell>
                <TableCell className="font-mono text-sm">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'superadmin' || user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.inviterKey ? inviterLabel(user.inviterKey) : user.side ? `${user.side} side` : 'all'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'never'}
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex items-center justify-end gap-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openEdit(user)}
                    >
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => setDialog({ mode: 'reset', user })}
                    >
                      <KeyRound className="size-3.5" aria-hidden /> Reset password
                    </Button>
                    {user.userId === currentUserId ? null : confirmingDelete === user.userId ? (
                      <>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-destructive"
                          disabled={pending}
                          onClick={() => handleDelete(user.userId)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-destructive"
                        onClick={() => setConfirmingDelete(user.userId)}
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </Button>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog.mode === 'create'} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              You set the password and hand it over. Nothing is emailed to them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-name">Full name</Label>
              <Input id="user-name" name="fullName" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-username">Username</Label>
              <Input id="user-username" name="username" required autoComplete="off" placeholder="mama.fatan" />
              <p className="text-xs text-muted-foreground">
                What they type to sign in. Lowercase letters, digits, dot, dash, underscore.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-email">Email (optional)</Label>
              <Input id="user-email" name="email" type="email" />
              <p className="text-xs text-muted-foreground">
                Only a second way to sign in. Nothing is ever sent to it, leave it blank if they have none.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-password">Password</Label>
              <Input id="user-password" name="password" minLength={8} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                name="role"
                className={fieldClass}
                value={role}
                onChange={(event) => setRole(event.target.value as ManagedUser['role'])}
              >
                <option value="superadmin">superadmin</option>
                <option value="admin">admin</option>
                <option value="inviter">inviter</option>
                <option value="usher">usher</option>
                <option value="viewer">viewer</option>
              </select>
              <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
            </div>
            {role === 'inviter' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-inviter">Inviter key</Label>
                <select id="user-inviter" name="inviterKey" className={fieldClass} required defaultValue="">
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
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-side">{role === 'admin' ? 'Side' : 'Side (optional)'}</Label>
              <select id="user-side" name="side" className={fieldClass} defaultValue="" required={role === 'admin'}>
                <option value="" disabled={role === 'admin'}>
                  {role === 'admin' ? 'Select side' : 'Not tied to a side'}
                </option>
                <option value="fatan">Fatan</option>
                <option value="sita">Sita</option>
              </select>
              {role === 'admin' ? (
                <p className="text-xs text-muted-foreground">An admin manages one side of the wedding.</p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Creating...' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.mode === 'edit'} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit account{dialog.mode === 'edit' ? ` for ${dialog.user.fullName}` : ''}</DialogTitle>
            <DialogDescription>
              Role and scope apply from their next page load. Username and password have their own actions.
            </DialogDescription>
          </DialogHeader>
          <form
            key={dialog.mode === 'edit' ? dialog.user.userId : 'closed'}
            onSubmit={handleEdit}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="userId" value={dialog.mode === 'edit' ? dialog.user.userId : ''} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                name="fullName"
                required
                defaultValue={dialog.mode === 'edit' ? dialog.user.fullName : ''}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                name="username"
                required
                autoComplete="off"
                className="font-mono"
                defaultValue={dialog.mode === 'edit' ? dialog.user.username : ''}
              />
              <p className="text-xs text-muted-foreground">
                A changed username takes effect immediately; the old one stops working.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                name="role"
                className={fieldClass}
                value={role}
                disabled={dialog.mode === 'edit' && dialog.user.userId === currentUserId}
                onChange={(event) => setRole(event.target.value as ManagedUser['role'])}
              >
                <option value="superadmin">superadmin</option>
                <option value="admin">admin</option>
                <option value="inviter">inviter</option>
                <option value="usher">usher</option>
                <option value="viewer">viewer</option>
              </select>
              {/* A disabled select posts nothing, so carry the unchanged role. */}
              {dialog.mode === 'edit' && dialog.user.userId === currentUserId ? (
                <input type="hidden" name="role" value={role} />
              ) : null}
              <p className="text-xs text-muted-foreground">
                {dialog.mode === 'edit' && dialog.user.userId === currentUserId
                  ? 'You cannot change your own role.'
                  : ROLE_HINT[role]}
              </p>
            </div>
            {role === 'inviter' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-inviter">Inviter key</Label>
                <select
                  id="edit-inviter"
                  name="inviterKey"
                  className={fieldClass}
                  required
                  defaultValue={dialog.mode === 'edit' ? (dialog.user.inviterKey ?? '') : ''}
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
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-side">{role === 'admin' ? 'Side' : 'Side (optional)'}</Label>
              <select
                id="edit-side"
                name="side"
                className={fieldClass}
                required={role === 'admin'}
                defaultValue={dialog.mode === 'edit' ? (dialog.user.side ?? '') : ''}
              >
                <option value="" disabled={role === 'admin'}>
                  {role === 'admin' ? 'Select side' : 'Not tied to a side'}
                </option>
                <option value="fatan">Fatan</option>
                <option value="sita">Sita</option>
              </select>
              {role === 'admin' ? (
                <p className="text-xs text-muted-foreground">An admin manages one side of the wedding.</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving...' : 'Save account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.mode === 'reset'} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reset password{dialog.mode === 'reset' ? ` for ${dialog.user.fullName}` : ''}
            </DialogTitle>
            <DialogDescription>
              Takes effect immediately. Their existing sessions keep working until they sign out.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={dialog.mode === 'reset' ? dialog.user.userId : ''} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input id="reset-password" name="password" minLength={8} required autoFocus />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving...' : 'Set password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
