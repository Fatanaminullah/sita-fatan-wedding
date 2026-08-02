import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getCascadeForEvent } from '@/server/actions/waitlist-actions'
import type { CascadeTier } from '@/domain/waitlist'
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
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Waitlist</h1>
        <a href="/waitlist" className="text-sm text-blue-600 underline">
          Refresh
        </a>
      </div>
      {EVENTS.map((event, i) => {
        const { anchor, offers } = cascades[i]
        return (
          <section key={event} className="mb-8">
            <h2 className="mb-1 font-semibold capitalize">{event}</h2>
            {offers.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody waiting.</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-gray-500">
                  Offer order for a slot freed on {anchor?.inviterKey} ({anchor?.side}), the next
                  guest in line: same inviter first, then same side, then everyone else.
                </p>
                <ul className="flex flex-col gap-2">
                  {offers.map(({ tier, guest }) => (
                    <li
                      key={guest.guestEventId}
                      className="flex items-center justify-between border-b py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">{guest.name}</span>
                        <span className="text-gray-500">
                          {' '}
                          — {guest.inviterKey}, {guest.side}, {guest.pax} pax
                          {guest.waitlistRank !== null ? `, rank ${guest.waitlistRank}` : ''}
                        </span>
                        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {TIER_LABEL[tier]}
                        </span>
                      </span>
                      <PromoteButton
                        guestEventId={guest.guestEventId}
                        inviterKey={guest.inviterKey}
                        event={event}
                        guestPax={guest.pax}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      })}
    </main>
  )
}
