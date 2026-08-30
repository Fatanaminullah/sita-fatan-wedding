import Link from 'next/link'
import { ScanLine } from 'lucide-react'
import type { DoorSummary } from '@/domain/door-summary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * The dashboard an usher gets.
 *
 * The ordinary dashboard is built on `guests` and `guest_events`, which an
 * usher has no policy on, so it would render every figure as zero: nothing
 * errors, and a volunteer reads "0 arrived" as a fact about the evening. This
 * shows only what the door itself recorded, which is the part they can read
 * and also the part they care about.
 *
 * No targets, deliberately. "94 of 500" needs the guest list, and inventing a
 * denominator an usher cannot verify is how the misleading zero gets in
 * through a different door.
 */
export function DoorSummaryView({
  summary,
  fullName,
}: {
  summary: DoorSummary
  fullName: string
}) {
  const events = [summary.resepsi, summary.akad]

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4">
      <header className="space-y-1 pt-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Tonight</p>
        <h1 className="text-xl font-medium">{fullName}</h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((tally) => (
          <Card key={tally.event}>
            <CardContent className="space-y-3 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {tally.event === 'akad' ? 'Akad' : 'Resepsi'}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-4xl tabular-nums leading-none">{tally.pax}</span>
                <span className="text-sm text-muted-foreground">in the room</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{tally.guests}</span>{' '}
                {tally.guests === 1 ? 'guest checked in' : 'guests checked in'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex items-baseline justify-between gap-3 p-4">
          <span className="text-sm text-muted-foreground">Souvenirs handed out</span>
          <span className="font-mono text-2xl tabular-nums">{summary.souvenirs}</span>
        </CardContent>
      </Card>

      {summary.lastCheckedInAt ? (
        <p className="text-sm text-muted-foreground">
          Last check-in at{' '}
          <span className="font-mono tabular-nums">
            {new Date(summary.lastCheckedInAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          .
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody has been checked in yet.</p>
      )}

      {/* One way onward, to the thing this account exists for. */}
      <Button render={<Link href="/checkin" />} className="h-12 w-full gap-2">
        <ScanLine className="size-4" aria-hidden="true" />
        Open the scanner
      </Button>
    </div>
  )
}
