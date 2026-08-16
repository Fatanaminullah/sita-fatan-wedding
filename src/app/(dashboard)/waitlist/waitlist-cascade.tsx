'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { CascadeContext, CascadeTier } from '@/domain/waitlist'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PromoteButton } from './promote-button'
import { inviterLabel } from '@/lib/inviter-label'
import { nativeFieldClass } from '@/lib/field-class'

const TIER_LABEL: Record<CascadeTier, string> = {
  same_inviter: 'Tier 1, same inviter',
  same_side: 'Tier 2, same side',
  global: 'Tier 3, global',
}

const SIDE_LABEL = { fatan: 'Fatan side', sita: 'Sita side' } as const

const selectClass = nativeFieldClass

export type WaitlistOffer = {
  tier: CascadeTier
  guest: {
    guestEventId: string
    guestId: string
    name: string
    inviterKey: string
    side: 'fatan' | 'sita'
    pax: number
    waitlistRank: number | null
  }
}

export type EventCascade = {
  event: 'akad' | 'resepsi'
  anchor: CascadeContext | null
  offers: WaitlistOffer[]
}

export function WaitlistCascade({
  cascades,
  scopedToInviter = false,
}: {
  cascades: EventCascade[]
  /**
   * An inviter's RLS view is their own guests only, so every offer is
   * "Tier 1, same inviter" and the inviter/side filters have one value:
   * hide the cascade framing and keep just the name search.
   */
  scopedToInviter?: boolean
}) {
  const [search, setSearch] = useState('')
  const [inviter, setInviter] = useState('any')
  const [side, setSide] = useState<'any' | 'fatan' | 'sita'>('any')

  const inviters = useMemo(
    () =>
      Array.from(new Set(cascades.flatMap(({ offers }) => offers.map(({ guest }) => guest.inviterKey)))).sort(),
    [cascades]
  )

  const filtersActive = Boolean(search) || inviter !== 'any' || side !== 'any'

  function matches(offer: WaitlistOffer) {
    const needle = search.trim().toLowerCase()
    if (needle && !offer.guest.name.toLowerCase().includes(needle)) return false
    if (inviter !== 'any' && offer.guest.inviterKey !== inviter) return false
    if (side !== 'any' && offer.guest.side !== side) return false
    return true
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name"
            className="pl-8"
          />
        </div>

        {scopedToInviter ? null : (
          <>
            <select
              className={selectClass}
              value={inviter}
              onChange={(event) => setInviter(event.target.value)}
              aria-label="Inviter"
            >
              <option value="any">All inviters</option>
              {inviters.map((key) => (
                <option key={key} value={key}>
                  {inviterLabel(key)}
                </option>
              ))}
            </select>

            <select
              className={selectClass}
              value={side}
              onChange={(event) => setSide(event.target.value as typeof side)}
              aria-label="Side"
            >
              <option value="any">All sides</option>
              <option value="fatan">Fatan side</option>
              <option value="sita">Sita side</option>
            </select>
          </>
        )}

        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setInviter('any')
              setSide('any')
            }}
          >
            <X className="size-4" aria-hidden /> Reset
          </Button>
        ) : null}
      </div>

      {cascades.map(({ event, anchor, offers }) => {
        const shown = offers.filter(matches)
        return (
          <Card key={event}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{event}</CardTitle>
              {offers.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {scopedToInviter
                    ? 'In rank order. Promoting takes the seat immediately.'
                    : `Offer order for a slot freed on ${anchor ? inviterLabel(anchor.inviterKey) : ''} (${anchor ? SIDE_LABEL[anchor.side] : ''}): same inviter first, then same side, then everyone else.`}
                  {filtersActive ? (
                    <span className="tabular-nums"> Showing {shown.length} of {offers.length} waiting.</span>
                  ) : null}
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody waiting.</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody matching the filter, {offers.length} waiting in total.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {shown.map(({ tier, guest }) => (
                    <li
                      key={guest.guestEventId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{guest.name}</span>
                        <span className="text-muted-foreground">
                          {scopedToInviter ? '' : `${inviterLabel(guest.inviterKey)}, ${guest.side}, `}
                          {guest.pax} pax
                          {guest.waitlistRank !== null ? `, rank ${guest.waitlistRank}` : ''}
                        </span>
                        {scopedToInviter ? null : <Badge variant="secondary">{TIER_LABEL[tier]}</Badge>}
                      </div>
                      <PromoteButton
                        guestEventId={guest.guestEventId}
                        guestId={guest.guestId}
                        guestName={guest.name}
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
    </div>
  )
}
