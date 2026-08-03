'use client'

import { Button } from '@/components/ui/button'

// Backstop for the repositories, which all throw on any Supabase error,
// including an RLS denial, which is the common case here (an inviter opening
// a row they can't see). Without this, the whole segment 500s blank.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-2 text-xl font-semibold">Something went wrong.</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        You may not have access to this. Try again, or go back to the dashboard.
      </p>
      {error.digest ? <p className="mb-4 text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button render={<a href="/dashboard" />} variant="outline">
          Dashboard
        </Button>
      </div>
    </main>
  )
}
