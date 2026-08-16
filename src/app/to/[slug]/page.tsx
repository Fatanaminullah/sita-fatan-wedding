import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { MonogramMark } from '@/components/invitation/monogram-mark'
import { DateBlock, GROUND, Label, Reveal, SUITE, bodoni, jost } from '@/components/invitation/invitation-shell'

/**
 * The guest's invitation, first section only: the greeting.
 *
 * This is NOT the full "Paper Theatre" build described in
 * docs/INVITATION_UI_BRIEF.md. That is a section-by-section project whose
 * prototype the owner has not approved. What is here is the intro alone, built
 * to the brief's binding parts (palette, type, the anti-list) so that the rest
 * can be grown into it rather than replacing it.
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

export default async function GuestInvitation({ params }: { params: Promise<{ slug: string }> }) {
  const guest = await getGuest((await params).slug)
  if (!guest) notFound()

  const both = guest.invited_akad && guest.invited_resepsi

  return (
    <main
      className={`${bodoni.variable} ${jost.variable} flex min-h-dvh flex-col items-center justify-center px-6 py-16`}
      style={{ ...GROUND, color: SUITE.ink }}
    >
      <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
        <MonogramMark size={104} />

        <Reveal order={1} className="mt-9">
          <Label style={{ color: SUITE.oxblood, opacity: 0.7 }}>The wedding of</Label>
        </Reveal>

        <Reveal order={2} className="mt-4">
        <h1
          className="text-[2.35rem] leading-[1.1]"
          style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
        >
          Sita
          <span className="mx-2 align-middle text-[1.4rem]" style={{ opacity: 0.7 }}>
            &amp;
          </span>
          Fatan
        </h1>
        </Reveal>

        <Reveal order={3} className="mt-8">
          <DateBlock />
        </Reveal>

        {/* The name card. The one blush object on the page, because the
            printed suite reserves the tint for panels a guest holds. Hard
            offset shadow: paper cut with a blade, not a soft blob. */}
        <Reveal order={4} className="mt-12 w-full">
        <div
          className="w-full px-7 py-8"
          style={{ background: SUITE.blush, boxShadow: `9px 9px 0 0 ${SUITE.oxblood}1F` }}
        >
          <Label style={{ color: SUITE.oxblood, opacity: 0.65 }}>Kepada</Label>
          <p
            className="mt-3 text-[1.55rem] leading-tight break-words"
            style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
          >
            {guest.name}
          </p>
          {guest.pax > 1 ? (
            <p
              className="mt-2 text-sm"
              style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.7 }}
            >
              {guest.pax} orang
            </p>
          ) : null}
        </div>
        </Reveal>

        <Reveal order={5}>
        <p
          className="mt-10 max-w-[19rem] text-[0.95rem] leading-relaxed"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.85 }}
        >
          {both
            ? 'We would be honoured to have you with us at both the Akad and the Resepsi.'
            : guest.invited_akad
              ? 'We would be honoured to have you with us at the Akad.'
              : 'We would be honoured to have you with us at the Resepsi.'}
        </p>
        </Reveal>

        <Reveal order={6}>
        <Label className="mt-12" style={{ color: SUITE.oxblood, opacity: 0.45 }}>
          More details to follow
        </Label>
        </Reveal>
      </div>
    </main>
  )
}
