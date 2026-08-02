'use client'

import { useActionState } from 'react'
import { signIn } from '@/server/actions/auth-actions'

type FormState = { error?: string }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await signIn(formData)
  return result ?? {}
}

export function LoginForm() {
  const [state, formAction] = useActionState(submitAction, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="rounded border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-black px-3 py-2 text-white">
        Sign in
      </button>
      {state.error ? <p className="text-red-600">{state.error}</p> : null}
    </form>
  )
}
