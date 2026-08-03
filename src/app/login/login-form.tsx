'use client'

import { useActionState } from 'react'
import { signIn } from '@/server/actions/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error?: string }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await signIn(formData)
  return result ?? {}
}

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(submitAction, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoFocus autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? 'Signing in...' : 'Sign in'}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  )
}
