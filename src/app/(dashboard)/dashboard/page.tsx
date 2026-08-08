import { Fragment } from 'react'
import Link from 'next/link'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadDashboardSummary, scopeSummaryToInviter } from '@/server/repositories/dashboard-repository'
import { slotOpportunities } from '@/domain/summary'
import type { CapacityTotals, Summary } from '@/domain/summary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InviterCapacityChart, SideSplitChart, TypeSplitBar } from './dashboard-charts'

const SIDE_LABEL = { fatan: 'Fatan side', sita: 'Sita side' } as const

function CapacityMeter({ title, totals, hint }: { title: string; totals: CapacityTotals; hint: string }) {
  const pct = totals.cap > 0 ? Math.min(100, Math.round((totals.used / totals.cap) * 100)) : 0
  const overPct = totals.cap > 0 && totals.overCap ? Math.min(100, Math.round((-totals.remaining / totals.cap) * 100)) : 0

  return (
    // No coloured outline (DESIGN.md, Shapes: "no colored outlines except
    // the focus ring"). Over-cap already reads without it: the numeral below
    // turns destructive-toned and the "N pax over cap" badge names the state
    // in words, satisfying the Never-Color-Alone Rule on its own.
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <CardDescription className="text-xs">{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-semibold tabular-nums ${totals.overCap ? 'text-destructive' : ''}`}>
            {totals.used}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">/ {totals.cap} pax</span>
        </div>
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          <div
            style={{ width: `${pct}%`, background: totals.overCap ? 'var(--destructive)' : 'var(--chart-1)' }}
          />
          {overPct > 0 ? <div style={{ width: `${overPct}%`, background: 'var(--destructive)', opacity: 0.45 }} /> : null}
        </div>
        {totals.overCap ? (
          <Badge variant="destructive">{-totals.remaining} pax over cap</Badge>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">{totals.remaining} pax left</p>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function RemainingCell({ value }: { value: number }) {
  return (
    <TableCell className={`text-right tabular-nums ${value < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
      {value < 0 ? `${value}` : `+${value}`}
    </TableCell>
  )
}

function CapacityTable({ summary }: { summary: Summary }) {
  const sides = summary.sides.filter((side) => summary.inviters.some((inviter) => inviter.side === side.side))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Inviter</TableHead>
          <TableHead className="text-right">Akad</TableHead>
          <TableHead className="text-right">Cap</TableHead>
          <TableHead className="text-right">Left</TableHead>
          <TableHead className="text-right">Resepsi</TableHead>
          <TableHead className="text-right">Cap</TableHead>
          <TableHead className="text-right">Left</TableHead>
          <TableHead className="text-right">VIP</TableHead>
          <TableHead className="text-right">Waitlist</TableHead>
          <TableHead className="text-right">No phone</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sides.map((side) => (
          <Fragment key={side.side}>
            {summary.inviters
              .filter((inviter) => inviter.side === side.side)
              .map((inviter) => (
                <TableRow key={inviter.inviterKey}>
                  <TableCell className="font-medium">{inviter.inviterKey}</TableCell>
                  <TableCell className={`text-right tabular-nums ${inviter.akadRemaining < 0 ? 'font-semibold text-destructive' : ''}`}>
                    {inviter.akadUsed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.akadCap}</TableCell>
                  <RemainingCell value={inviter.akadRemaining} />
                  <TableCell className={`text-right tabular-nums ${inviter.resepsiRemaining < 0 ? 'font-semibold text-destructive' : ''}`}>
                    {inviter.resepsiUsed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.resepsiCap}</TableCell>
                  <RemainingCell value={inviter.resepsiRemaining} />
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.vipUsed}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.waitlistPax}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inviter.missingPhone > 0 ? (
                      <Link
                        href={`/guests?missingPhone=1&inviter=${encodeURIComponent(inviter.inviterKey)}`}
                        className="text-warning underline-offset-2 hover:underline"
                      >
                        {inviter.missingPhone}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-muted/40">
              <TableCell className="font-medium text-muted-foreground">{SIDE_LABEL[side.side]} total</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{side.akadUsed}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{side.akadCap}</TableCell>
              <RemainingCell value={side.akadRemaining} />
              <TableCell className="text-right font-medium tabular-nums">{side.resepsiUsed}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{side.resepsiCap}</TableCell>
              <RemainingCell value={side.resepsiRemaining} />
              <TableCell className="text-right tabular-nums">
                {side.vipUsed} <span className="text-muted-foreground">/ {side.vipCap}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{side.waitlistPax}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {summary.inviters
                  .filter((inviter) => inviter.side === side.side)
                  .reduce((sum, inviter) => sum + inviter.missingPhone, 0)}
              </TableCell>
            </TableRow>
          </Fragment>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">Grand total</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{summary.events.akad.used}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{summary.events.akad.cap}</TableCell>
          <RemainingCell value={summary.events.akad.remaining} />
          <TableCell className="text-right font-semibold tabular-nums">{summary.events.resepsi.used}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{summary.events.resepsi.cap}</TableCell>
          <RemainingCell value={summary.events.resepsi.remaining} />
          <TableCell className="text-right tabular-nums">
            {summary.events.vip.used} <span className="text-muted-foreground">/ {summary.events.vip.cap}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">{summary.waitlist.totalPax}</TableCell>
          <TableCell className="text-right tabular-nums">{summary.phone.missing}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  // An usher has no guests-table RLS access at all, so this page would render
  // an all-zero capacity table with no error — worse than saying nothing.
  if (profile?.role === 'usher') {
    return (
      <main className="p-4 md:p-6">
        <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Dashboard is not available for your role.</p>
      </main>
    )
  }

  const supabase = await getServerSupabase()
  const fullSummary = await loadDashboardSummary(supabase)
  const summary =
    profile?.role === 'inviter' && profile.inviterKey
      ? scopeSummaryToInviter(fullSummary, profile.inviterKey)
      : fullSummary

  const phonePct = summary.phone.total > 0 ? Math.round((summary.phone.withPhone / summary.phone.total) * 100) : 0
  const slots = slotOpportunities(summary)

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.role === 'inviter'
            ? 'Showing your own invites only.'
            : `${summary.guestCount} entries, ${summary.totalPax} pax across both events.`}
        </p>
      </div>

      {slots.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">
            {slots.length === 1 ? 'A slot is open' : `${slots.length} slots are open`} with people waiting for it
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {slots.map((slot) => (
              <li key={`${slot.inviterKey}-${slot.event}`} className="tabular-nums">
                <span className="font-medium text-foreground">{slot.inviterKey}</span> has {slot.remaining} pax
                left on <span className="capitalize">{slot.event}</span>, {slot.waitingPax} pax waiting
              </li>
            ))}
          </ul>
          <Button render={<Link href="/waitlist" />} variant="link" size="sm" className="mt-1 h-auto p-0">
            Open the waitlist to promote somebody
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <CapacityMeter title="Akad" totals={summary.events.akad} hint="Pax invited and not declined" />
        <CapacityMeter title="Resepsi" totals={summary.events.resepsi} hint="Pax invited and not declined" />
        <CapacityMeter title="VIP" totals={summary.events.vip} hint="A tier on Resepsi, capped per side" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Akad by inviter</CardTitle>
            <CardDescription>Filled bar is pax invited, full bar length is that inviter&apos;s cap.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviterCapacityChart rows={summary.inviters} event="akad" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resepsi by inviter</CardTitle>
            <CardDescription>Filled bar is pax invited, full bar length is that inviter&apos;s cap.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviterCapacityChart rows={summary.inviters} event="resepsi" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pax by side</CardTitle>
            <CardDescription>Where the headcount sits across the two events and the VIP tier.</CardDescription>
          </CardHeader>
          <CardContent>
            <SideSplitChart sides={summary.sides} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Family vs friend</CardTitle>
              <CardDescription>Pax holding a seat, waiting-list entries excluded.</CardDescription>
            </CardHeader>
            <CardContent>
              <TypeSplitBar family={summary.byType.family} friend={summary.byType.friend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entries, not pax</CardTitle>
              <CardDescription>Souvenir bags and QR tickets are per entry.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Akad" value={summary.entryCounts.akad} />
              <Stat label="Resepsi" value={summary.entryCounts.resepsi} />
              <Stat label="Both" value={summary.entryCounts.both} />
              <Stat label="Unique" value={summary.entryCounts.unique} sub="souvenirs" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* No coloured outline (DESIGN.md, Shapes rule above). The link
            below already states the missing count in words on every render,
            so the state was never carried by this border alone. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phone coverage</CardTitle>
            <CardDescription>No phone means no WhatsApp invitation and no QR ticket.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{phonePct}%</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {summary.phone.withPhone} of {summary.phone.total} entries
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full" style={{ width: `${phonePct}%`, background: 'var(--chart-3)' }} />
            </div>
            <Button render={<Link href="/guests?missingPhone=1" />} variant="link" size="sm" className="h-auto p-0">
              {summary.phone.missing} entries still missing a phone
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting list</CardTitle>
            <CardDescription>Pax on hold, not counted against any cap above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{summary.waitlist.totalPax}</span>
              <span className="text-sm text-muted-foreground">pax waiting</span>
            </div>
            {summary.waitlist.totalPax > 0 ? (
              <ul className="space-y-1 text-sm">
                {summary.waitlist.byInviter
                  .filter((row) => row.total > 0)
                  .map((row) => (
                    <li key={row.inviterKey} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{row.inviterKey}</span>
                      <span className="tabular-nums">
                        {row.akad > 0 ? `${row.akad} akad` : null}
                        {row.akad > 0 && row.resepsi > 0 ? ', ' : null}
                        {row.resepsi > 0 ? `${row.resepsi} resepsi` : null}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nobody is waiting.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capacity by inviter and side</CardTitle>
          <CardDescription>
            Every number on this page in one table. Negative &quot;Left&quot; is over cap.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <CapacityTable summary={summary} />
        </CardContent>
      </Card>
    </main>
  )
}
