import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Bodoni_Moda, Archivo } from 'next/font/google'

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

// Brief section 3. Bodoni for display, Archivo for text. No script anywhere,
// which the brief calls an absolute rule.
const bodoni = Bodoni_Moda({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-display' })
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-text' })

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
      className={`${bodoni.variable} ${archivo.variable} relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16`}
      // Deep red owns the section by area, per the brief: "if a viewport reads
      // mostly cream, the balance is wrong".
      style={{ background: '#8A0F1A' }}
    >
      {/* The chandelier. Light is the only warm-gold on this site, and it is
          light falling on a surface, never a fill, a border or a text colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
        style={{
          background:
            'radial-gradient(70% 55% at 50% 0%, rgba(255,233,200,0.34) 0%, rgba(255,233,200,0.10) 45%, rgba(255,233,200,0) 78%)',
        }}
      />
      {/* A recess behind the card: layers behind layers, in shadow red. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45vh]"
        style={{ background: 'linear-gradient(to top, #5C0A12 0%, rgba(92,10,18,0) 100%)' }}
      />

      <div className="relative flex w-full max-w-[22rem] flex-col items-center">
        <p
          className="text-center text-xs tracking-[0.28em] uppercase"
          style={{ fontFamily: 'var(--font-text)', color: '#F6D4BC' }}
        >
          The wedding of
        </p>

        <h1
          className="mt-5 text-center text-[2.75rem] leading-[1.05]"
          style={{ fontFamily: 'var(--font-display)', color: '#F6D4BC' }}
        >
          Sita
          <span className="mx-2 align-middle text-[1.6rem]" style={{ opacity: 0.75 }}>
            &amp;
          </span>
          Fatan
        </h1>

        {/* The date as a stacked graphic object in heavy Archivo, mirroring the
            printed suite's numerals. Brief section 3. */}
        <div
          className="mt-8 flex items-end gap-2 tabular-nums"
          style={{ fontFamily: 'var(--font-text)', color: '#F6D4BC' }}
          aria-label="10 October 2026"
        >
          <span className="text-5xl font-bold leading-none tracking-tight">10</span>
          <span className="text-5xl font-bold leading-none tracking-tight" style={{ opacity: 0.55 }}>
            10
          </span>
          <span className="text-5xl font-bold leading-none tracking-tight" style={{ opacity: 0.35 }}>
            26
          </span>
        </div>

        {/* The name card. Cream is reserved for objects a guest would
            physically hold, and this is the one such object here. Hard-edged
            offset shadow: paper cut with a blade, never a soft blob. */}
        <div
          className="mt-14 w-full px-7 py-8 text-center"
          style={{
            background: '#F7F0E6',
            color: '#2B1113',
            boxShadow: '10px 10px 0 0 #5C0A12',
          }}
        >
          <p
            className="text-[0.7rem] tracking-[0.22em] uppercase"
            style={{ fontFamily: 'var(--font-text)', opacity: 0.62 }}
          >
            Kepada
          </p>
          <p
            className="mt-3 text-[1.6rem] leading-tight break-words"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {guest.name}
          </p>
          {guest.pax > 1 ? (
            <p className="mt-2 text-sm" style={{ fontFamily: 'var(--font-text)', opacity: 0.7 }}>
              {guest.pax} orang
            </p>
          ) : null}
        </div>

        <p
          className="mt-10 max-w-[19rem] text-center text-[0.95rem] leading-relaxed"
          style={{ fontFamily: 'var(--font-text)', color: '#F6D4BC', opacity: 0.85 }}
        >
          {both
            ? 'We would be honoured to have you with us at both the Akad and the Resepsi.'
            : guest.invited_akad
              ? 'We would be honoured to have you with us at the Akad.'
              : 'We would be honoured to have you with us at the Resepsi.'}
        </p>

        <p
          className="mt-12 text-center text-[0.7rem] tracking-[0.2em] uppercase"
          style={{ fontFamily: 'var(--font-text)', color: '#F6D4BC', opacity: 0.45 }}
        >
          More details to follow
        </p>
      </div>
    </main>
  )
}
