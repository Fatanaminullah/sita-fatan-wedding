import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getCascadeForEvent } from '@/server/actions/waitlist-actions'
import type { CascadeTier } from '@/domain/waitlist'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PromoteButton } from './promote-button'

const EVENTS = ['akad', 'resepsi'] as const

const TIER_LABEL: Record<CascadeTier, string> = {
  same_inviter: 'Tier 1, same inviter',
  same_side: 'Tier 2, same side',
  global: 'Tier 3, global',
}

export default async function WaitlistPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  // Ordered by the slot-fill cascade rather than raw query order, so the list
  // clusters by inviter then side instead of arriving shuffled.
  const cascades = await Promise.all(EVENTS.map((event) => getCascadeForEvent(event)))

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
          <p className="text-sm text-muted-foreground">Slot-fill cascade, per event.</p>
        </div>
        <Button render={<a href="/waitlist" />} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {EVENTS.map((event, i) => {
        const { anchor, offers } = cascades[i]
        return (
          <Card key={event}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{event}</CardTitle>
              {offers.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Offer order for a slot freed on {anchor?.inviterKey} ({anchor?.side}): same
                  inviter first, then same side, then everyone else.
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody waiting.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {offers.map(({ tier, guest }) => (
                    <li
                      key={guest.guestEventId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{guest.name}</span>
                        <span className="text-muted-foreground">
                          {guest.inviterKey}, {guest.side}, {guest.pax} pax
                          {guest.waitlistRank !== null ? `, rank ${guest.waitlistRank}` : ''}
                        </span>
                        <Badge variant="secondary">{TIER_LABEL[tier]}</Badge>
                      </div>
                      <PromoteButton
                        guestEventId={guest.guestEventId}
                        inviterKey={guest.inviterKey}
                        event={event}
                        guestPax={guest.pax}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}
    </main>
  )
}
