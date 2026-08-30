import { Fragment } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadDashboardSummary, loadCurrentSideVipUsed } from '@/server/repositories/dashboard-repository'
import { loadDoorSummary } from '@/server/repositories/checkin-repository'
import { DoorSummaryView } from './door-summary-view'
import { scopeSummaryToInviter, scopeSummaryToSide, slotOpportunities } from '@/domain/summary'
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
import { inviterLabel } from '@/lib/inviter-label'

const SIDE_LABEL = { fatan: 'Fatan side', sita: 'Sita side' } as const

// The inviter column pins while the other nine scroll sideways on a phone,
// so the row never becomes an anonymous line of numbers. `bg-inherit` means
// every row that uses it must carry an opaque background of its own; a
// translucent one would let the scrolling columns show through the pin.
const STICKY_COL = 'sticky left-0 z-10 bg-inherit'

function CapacityMeter({
  title,
  totals,
  hint,
  footnote,
}: {
  title: string
  totals: CapacityTotals
  hint: string
  /** Extra line under the meter, for when the ratio measures a wider scope
   *  than the reader and their own share is still worth naming. */
  footnote?: string
}) {
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
        {footnote ? <p className="text-sm text-muted-foreground tabular-nums">{footnote}</p> : null}
      </CardContent>
    </Card>
  )
}

function PrintedInvitationRow({ label, used, cap }: { label: string; used: number; cap: number }) {
  const over = used > cap
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-sm tabular-nums ${over ? 'font-semibold text-destructive' : ''}`}>
          {used} / {cap} cards
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: over ? 'var(--destructive)' : 'var(--chart-2)' }}
        />
      </div>
      {over ? <Badge variant="destructive">{used - cap} cards over the print run</Badge> : null}
    </div>
  )
}

/**
 * Never round up to 100 while entries are still missing: "100%" printed next
 * to "2 still missing" reads as a contradiction. Used by the headline figure
 * and by every per-inviter row, so they cannot disagree with each other.
 */
function coveragePct(withPhone: number, missing: number, total: number): number {
  if (total === 0) return 0
  if (missing === 0) return 100
  return Math.min(99, Math.round((withPhone / total) * 100))
}

function PhoneCoverageRow({
  label,
  phone,
  href,
}: {
  label: string
  phone: { withPhone: number; missing: number; total: number }
  href: string
}) {
  const pct = coveragePct(phone.withPhone, phone.missing, phone.total)
  const done = phone.total > 0 && phone.missing === 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {phone.total === 0 ? (
            'no entries'
          ) : (
            <>
              <span className="font-medium text-foreground">{pct}%</span> {phone.withPhone}/{phone.total}
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: done ? 'var(--chart-2)' : 'var(--chart-3)' }}
        />
      </div>
      {phone.missing > 0 ? (
        <Button render={<Link href={href} />} variant="link" size="sm" className="h-auto p-0 text-xs">
          {phone.missing} missing
        </Button>
      ) : null}
    </div>
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
      {/* Two header rows, not one. "Cap" and "Left" each appeared twice,
          separated only by column position, which a screen reader announces
          identically and a phone reader loses the moment the header scrolls
          out of view. The spanning row names which event owns each group, and
          every leaf header carries its own scope. */}
      <TableHeader>
        <TableRow className="bg-card">
          <TableHead className={`${STICKY_COL} align-bottom`} rowSpan={2} scope="col">
            Inviter
          </TableHead>
          <TableHead className="border-l text-center" colSpan={3} scope="colgroup">
            Akad
          </TableHead>
          <TableHead className="border-l text-center" colSpan={3} scope="colgroup">
            Resepsi
          </TableHead>
          <TableHead className="border-l text-right align-bottom" rowSpan={2} scope="col">
            VIP
          </TableHead>
          <TableHead className="text-right align-bottom" rowSpan={2} scope="col">
            Waitlist
          </TableHead>
          <TableHead className="text-right align-bottom" rowSpan={2} scope="col">
            No phone
          </TableHead>
        </TableRow>
        <TableRow className="bg-card">
          <TableHead className="border-l text-right" scope="col">
            Used
          </TableHead>
          <TableHead className="text-right" scope="col">
            Cap
          </TableHead>
          <TableHead className="text-right" scope="col">
            Left
          </TableHead>
          <TableHead className="border-l text-right" scope="col">
            Used
          </TableHead>
          <TableHead className="text-right" scope="col">
            Cap
          </TableHead>
          <TableHead className="text-right" scope="col">
            Left
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sides.map((side) => (
          <Fragment key={side.side}>
            {summary.inviters
              .filter((inviter) => inviter.side === side.side)
              .map((inviter) => (
                <TableRow key={inviter.inviterKey} className="bg-card">
                  <TableCell className={`${STICKY_COL} font-medium`}>{inviterLabel(inviter.inviterKey)}</TableCell>
                  <TableCell className={`border-l text-right tabular-nums ${inviter.akadRemaining < 0 ? 'font-semibold text-destructive' : ''}`}>
                    {inviter.akadUsed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.akadCap}</TableCell>
                  <RemainingCell value={inviter.akadRemaining} />
                  <TableCell className={`border-l text-right tabular-nums ${inviter.resepsiRemaining < 0 ? 'font-semibold text-destructive' : ''}`}>
                    {inviter.resepsiUsed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inviter.resepsiCap}</TableCell>
                  <RemainingCell value={inviter.resepsiRemaining} />
                  <TableCell className="border-l text-right tabular-nums text-muted-foreground">{inviter.vipUsed}</TableCell>
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
            <TableRow className="bg-muted">
              <TableCell className={`${STICKY_COL} font-medium text-muted-foreground`}>{SIDE_LABEL[side.side]} total</TableCell>
              <TableCell className="border-l text-right font-medium tabular-nums">{side.akadUsed}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{side.akadCap}</TableCell>
              <RemainingCell value={side.akadRemaining} />
              <TableCell className="border-l text-right font-medium tabular-nums">{side.resepsiUsed}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{side.resepsiCap}</TableCell>
              <RemainingCell value={side.resepsiRemaining} />
              <TableCell className="border-l text-right tabular-nums">
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
        <TableRow className="bg-muted">
          <TableCell className={`${STICKY_COL} font-semibold`}>Grand total</TableCell>
          <TableCell className="border-l text-right font-semibold tabular-nums">{summary.events.akad.used}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{summary.events.akad.cap}</TableCell>
          <RemainingCell value={summary.events.akad.remaining} />
          <TableCell className="border-l text-right font-semibold tabular-nums">{summary.events.resepsi.used}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{summary.events.resepsi.cap}</TableCell>
          <RemainingCell value={summary.events.resepsi.remaining} />
          <TableCell className="border-l text-right tabular-nums">
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

  // An usher has no guests-table RLS access at all, so the capacity table
  // below would render as all zeroes with no error — worse than saying
  // nothing. It used to say exactly that: "not available for your role".
  //
  // Now it shows the numbers the door itself recorded, which an usher can
  // genuinely read and is the part they actually want: how many are inside and
  // how many souvenirs have gone. No targets, because a denominator would have
  // to come from the guest list they cannot see.
  if (profile?.role === 'usher') {
    const supabase = await getServerSupabase()
    return (
      <DoorSummaryView summary={await loadDoorSummary(supabase)} fullName={profile.fullName} />
    )
  }

  const supabase = await getServerSupabase()
  const fullSummary = await loadDashboardSummary(supabase)
  const inviterKey = profile?.role === 'inviter' ? profile.inviterKey : null
  // Only an inviter needs this. Every other role's summary already measures
  // VIP correctly: a side-scoped admin reads their whole side under RLS, and a
  // superadmin reads both.
  const sideVipUsed = inviterKey ? await loadCurrentSideVipUsed(supabase) : null
  const isInviter = Boolean(inviterKey)
  // A side-scoped admin's guests query is already RLS-limited to their side;
  // scoping the summary keeps the other side's inviters and caps out of the
  // rollups so they don't render as zero-count rows.
  const adminSide = profile?.role === 'admin' ? profile.side : null
  const summary = inviterKey
    ? scopeSummaryToInviter(fullSummary, inviterKey, sideVipUsed)
    : adminSide
      ? scopeSummaryToSide(fullSummary, adminSide)
      : fullSummary

  const phonePct = coveragePct(summary.phone.withPhone, summary.phone.missing, summary.phone.total)
  // Same never-round-up-to-100 rule as phone coverage: "100%" printed beside
  // "3 still unanswered" reads as a contradiction.
  const answeredPct = coveragePct(summary.rsvp.answered, summary.rsvp.unanswered, summary.rsvp.total)
  const slots = slotOpportunities(summary)

  // Good news currently looks the same as no news: grey text. This page is
  // checked over weeks, so a parent who has actually finished needs to be told
  // they have finished, or they keep checking and keep feeling behind.
  // The VIP clause is skipped when the side total could not be read, rather
  // than trusting a figure the summary itself marks as unmeasurable. Claiming
  // "nothing needs you" off a number we know is wrong is worse than the meter.
  const allClear =
    !summary.events.akad.overCap &&
    !summary.events.resepsi.overCap &&
    (summary.vipTotalKnown === false || !summary.events.vip.overCap) &&
    summary.phone.missing === 0 &&
    summary.waitlist.totalPax === 0 &&
    slots.length === 0

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.role === 'inviter'
            ? 'Showing your own invites only.'
            : adminSide
              ? `Showing the ${SIDE_LABEL[adminSide]} only: ${summary.guestCount} entries, ${summary.totalPax} pax.`
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
                <span className="font-medium text-foreground">{inviterLabel(slot.inviterKey)}</span> has {slot.remaining} pax
                left on <span className="capitalize">{slot.event}</span>, {slot.waitingPax} pax waiting
              </li>
            ))}
          </ul>
          <Button render={<Link href="/waitlist" />} variant="link" size="sm" className="mt-1 h-auto p-0">
            Open the waitlist to promote somebody
          </Button>
        </div>
      ) : null}

      {allClear ? (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Nothing needs you right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isInviter
              ? 'You are inside your caps, everyone on your list has a phone number, and nobody of yours is waiting.'
              : 'Every event is inside its cap, every entry has a phone number, and the waiting list is empty.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <CapacityMeter
          title="Akad"
          totals={summary.events.akad}
          hint={isInviter ? 'Your pax invited, against your own cap' : 'Pax invited and not declined'}
        />
        <CapacityMeter
          title="Resepsi"
          totals={summary.events.resepsi}
          hint={isInviter ? 'Your pax invited, against your own cap' : 'Pax invited and not declined'}
        />
        {/* An inviter's VIP meter measures their whole side, not them, because
            the cap is the side's. The hint says so, and their own contribution
            is named underneath so the number is still personally useful. If
            the side total could not be read the meter is withheld entirely
            rather than drawn from a figure known to be wrong. */}
        {isInviter && summary.vipTotalKnown === false ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">VIP</CardTitle>
              <CardDescription className="text-xs">A tier on Resepsi, capped per side</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{summary.ownVipUsed ?? 0}</span>
                <span className="text-sm text-muted-foreground">pax invited by you</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The cap is shared by your whole side. Ask Fatan or Sita for the side total.
              </p>
            </CardContent>
          </Card>
        ) : (
          <CapacityMeter
            title="VIP"
            totals={summary.events.vip}
            hint={
              isInviter
                ? 'Your whole side, against the cap the side shares'
                : 'A tier on Resepsi, capped per side'
            }
            footnote={
              isInviter && summary.ownVipUsed !== undefined
                ? `${summary.ownVipUsed} of these are yours`
                : undefined
            }
          />
        )}
      </div>

      {/* Everything from here to the capacity table is whole-wedding
          reporting. Scoped to a single inviter these degrade rather than
          shrink: `scopeSummaryToInviter` returns one inviter row and one side
          row, so the bar charts render a single bar and the capacity table a
          single line, restating the meters above. A parent gets the meters,
          their phone gap and their waiting list, and nothing else. */}
      {isInviter ? null : (
      <>
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
      </>
      )}

      <div className={`grid gap-4 ${isInviter ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {isInviter ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Printed invitations</CardTitle>
            <CardDescription>
              {`Physical cards, one per invitation. Print run of ${summary.sides.reduce((sum, side) => sum + side.physicalCap, 0)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.sides.map((side) => (
              <PrintedInvitationRow
                key={side.side}
                label={SIDE_LABEL[side.side]}
                used={side.physicalUsed}
                cap={side.physicalCap}
              />
            ))}
          </CardContent>
        </Card>
        )}

        {/* The RSVP sweep. Sits directly before phone coverage because the
            two are the same job seen twice: a guest with no number is a guest
            somebody has to answer for by hand. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Answers still needed</CardTitle>
            <CardDescription>
              The door admits only a guest recorded as coming, and nobody can override it on the day.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-semibold tabular-nums ${summary.rsvp.unanswered > 0 ? 'text-destructive' : ''}`}
              >
                {summary.rsvp.unanswered}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                of {summary.rsvp.total} still unanswered
                {summary.rsvp.unanswered > 0 ? ` · ${summary.rsvp.unansweredPax} pax` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full"
                style={{
                  width: `${answeredPct}%`,
                  background: summary.rsvp.unanswered > 0 ? 'var(--chart-3)' : 'var(--chart-2)',
                }}
              />
            </div>
            {summary.rsvp.unanswered > 0 ? (
              <Button
                render={<Link href="/guests?unanswered=1" />}
                variant="link"
                size="sm"
                className="h-auto p-0"
              >
                {summary.rsvp.unanswered} guests to answer for
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Everyone invited has an answer on file.
              </p>
            )}

            {/* A guest invited to nothing cannot be answered and is left out of
                the count above, or it would never reach zero. It is still worth
                naming: it is a row somebody has to look at. */}
            {summary.rsvp.invitedToNothing > 0 ? (
              <p className="text-sm text-[#A85A04] dark:text-[#FBBF24]">
                {summary.rsvp.invitedToNothing}{' '}
                {summary.rsvp.invitedToNothing === 1 ? 'guest is' : 'guests are'} invited to neither
                event, so there is nothing to answer for them.
              </p>
            ) : null}

            {summary.inviters.length > 1 ? (
              <details className="group border-t pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                  By inviter
                </summary>
                <div className="mt-3 space-y-2">
                  {summary.inviters.map((inviter) => (
                    <div key={inviter.inviterKey} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{inviterLabel(inviter.inviterKey)}</span>
                      {inviter.unanswered > 0 ? (
                        <Button
                          render={
                            <Link
                              href={`/guests?unanswered=1&inviter=${encodeURIComponent(inviter.inviterKey)}`}
                            />
                          }
                          variant="link"
                          size="sm"
                          className="h-auto shrink-0 p-0 tabular-nums"
                        >
                          {inviter.unanswered} to answer
                        </Button>
                      ) : (
                        <span className="shrink-0 text-sm text-muted-foreground">all answered</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

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

            {/* Per-inviter breakdown, collapsed so the card keeps its
                headline shape. Native <details> rather than a dialog: this page
                is a server component, the six rows are read against the percent
                directly above them, and a modal on a phone covers exactly that.
                `summary.inviters` is already scoped to what this reader may
                see: six rows for a superadmin, their own three for a
                side-scoped admin. An inviter sees one row, which would only
                restate the headline, so they get no disclosure at all. */}
            {summary.inviters.length > 1 ? (
              <details className="group border-t pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                  By inviter
                </summary>
                <div className="mt-3 space-y-3">
                  {summary.inviters.map((inviter) => (
                    <PhoneCoverageRow
                      key={inviter.inviterKey}
                      label={inviterLabel(inviter.inviterKey)}
                      phone={inviter.phone}
                      href={`/guests?missingPhone=1&inviter=${encodeURIComponent(inviter.inviterKey)}`}
                    />
                  ))}
                </div>
              </details>
            ) : null}
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
                      <span className="text-muted-foreground">{inviterLabel(row.inviterKey)}</span>
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

      {isInviter ? null : (
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
      )}
    </main>
  )
}
