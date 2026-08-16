'use client'

import { Button } from '@/components/ui/button'

// `signIn` returns `{ error }` for every expected failure, so this only fires
// when something upstream throws: Supabase down, the username lookup RPC
// missing, a bad env var in a fresh deploy. The dashboard's boundary does not
// cover this route, and the person most likely to meet it is a parent signing
// in for the first time, who would otherwise get Next's raw error screen.
export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <h1 className="mb-2 text-xl font-semibold">Sign in is not working right now.</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        This is a problem on our side, not with your password. Try again in a moment. If it keeps
        happening, tell Fatan or Sita.
      </p>
      {error.digest ? <p className="mb-4 text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </main>
  )
}
