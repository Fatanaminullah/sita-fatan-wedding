'use client'

// Backstop for the repositories, which all throw on any Supabase error —
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
      <p className="mb-4 text-sm text-gray-600">
        You may not have access to this. Try again, or go back to the dashboard.
      </p>
      {error.digest ? <p className="mb-4 text-xs text-gray-400">Ref: {error.digest}</p> : null}
      <div className="flex gap-3">
        <button onClick={() => reset()} className="rounded bg-black px-3 py-2 text-sm text-white">
          Try again
        </button>
        <a href="/dashboard" className="rounded border px-3 py-2 text-sm">
          Dashboard
        </a>
      </div>
    </main>
  )
}
