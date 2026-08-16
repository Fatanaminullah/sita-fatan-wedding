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
        <Label htmlFor="identifier">Username or email</Label>
        <Input id="identifier" name="identifier" required autoFocus autoComplete="username" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? 'Signing in...' : 'Sign in'}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {/* There is no self-service reset, by design: accounts are created and
          reset by an admin. Without this line a locked-out parent reads the
          same sentence as a typo and has no next step but to phone somebody
          and guess who. The error string itself stays deliberately vague for
          every failure, so it never reveals which usernames exist. */}
      <p className="text-sm text-muted-foreground">
        Forgot your password? Ask Fatan or Sita to reset it for you.
      </p>
    </form>
  )
}
