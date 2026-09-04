import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isLikelyBot } from '@/domain/whatsapp'
import { createClient } from '@supabase/supabase-js'
import { Invitation, type InvitationGuest } from '@/components/invitation/v2/invitation'

/**
 * The guest's invitation. This file loads the guest and hands them to the
 * client-side walk; every screen lives in `src/components/invitation/v2`.
 *
 * The brief writes this surface as `/to/[token]`. The path is right, the
 * credential is not: `/to/<slug>` uses the invite slug, never `rsvp_token`.
 * The token is the entry ticket, and a URL forwarded into a family WhatsApp
 * group must not carry it (docs/ROUTING.md, Decision 2).
 */

type Guest = {
  name: string
  pax: number
  side: string
  is_vip: boolean
  invited_akad: boolean
  invited_resepsi: boolean
  akad_rsvp: 'pending' | 'attending' | 'not_attending' | null
  resepsi_rsvp: 'pending' | 'attending' | 'not_attending' | null
  akad_pax: number | null
  resepsi_pax: number | null
  /** Absent until migration 20260905100000 is applied; treated as false. */
  candid?: boolean | null
}

/**
 * Publishable key, not the secret key. The lookup is a SECURITY DEFINER
 * function that returns exactly one guest and no credential, so anon is
 * sufficient and CLAUDE.md's four sanctioned uses of SUPABASE_SECRET_KEY stay
 * at four.
 */
async function getGuest(slug: string): Promise<Guest | null> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data, error } = await db.rpc('guest_by_public_slug', { p_slug: slug })
  if (error) throw new Error(`guest lookup failed: ${error.message}`)
  return (data as Guest[])?.[0] ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const guest = await getGuest((await params).slug)
  return {
    title: guest ? `${guest.name} — Sita & Fatan` : 'Sita & Fatan',
    // A guest link is a private address. It should never be indexed, and it
    // should not leak the guest's name into a link preview posted in a group
    // chat, so the description stays generic.
    description: 'The wedding of Sita Cahyani Arasy and Fatan Aminullah, 10 October 2026.',
    robots: { index: false, follow: false },
  }
}

/**
 * Record that a guest opened their invitation.
 *
 * Fire and forget: a failure here must never stop a guest seeing their
 * invitation. The count is a convenience for the couple; the page is the point.
 *
 * Bot fetches are dropped before the call. WhatsApp requests every link it is
 * sent in order to build the preview card, seconds after a wave goes out, and
 * counting those would show near-perfect open rates within minutes and make
 * "opened but never answered" meaningless.
 */
async function recordOpen(slug: string) {
  const userAgent = (await headers()).get('user-agent')
  if (isLikelyBot(userAgent)) return

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } }
    )
    await db.rpc('record_invitation_open', { p_slug: slug })
  } catch {
    // Deliberately silent.
  }
}

export default async function GuestInvitation({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  const guest = await getGuest(slug)
  if (!guest) notFound()

  // After the lookup, so an unknown slug is a plain 404 and never a counted
  // open. Not awaited into the render path: the page does not wait on it.
  void recordOpen(slug)

  // Only the events they hold a confirmed invitation to. A guest invited to
  // one is never shown the other, not even greyed out: absence is silent, and
  // a visibly withheld event reads as exclusion.
  const model: InvitationGuest = {
    slug,
    name: guest.name,
    pax: guest.pax,
    candid: guest.candid === true,
    events: [
      ...(guest.invited_akad
        ? [{ event: 'akad' as const, answer: guest.akad_rsvp ?? ('pending' as const), paxConfirmed: guest.akad_pax }]
        : []),
      ...(guest.invited_resepsi
        ? [
            {
              event: 'resepsi' as const,
              answer: guest.resepsi_rsvp ?? ('pending' as const),
              paxConfirmed: guest.resepsi_pax,
            },
          ]
        : []),
    ],
  }

  return <Invitation guest={model} />
}
