import type { Metadata } from 'next'
import Link from 'next/link'
import { MonogramMark } from '@/components/invitation/monogram-mark'
import { DateBlock, SUITE, bodoni, archivo } from '@/components/invitation/invitation-shell'

/**
 * The public root.
 *
 * Until 2026-08-16 this redirected to /dashboard, which meant the first thing
 * anyone typing sitafatan.wedding would see was an admin login. That is fine
 * for an internal tool and wrong for a domain about to be printed on cards.
 *
 * It is deliberately not the invitation. A guest's invitation lives at their
 * own /to/<slug>; this page exists so the bare domain resolves to something
 * that belongs to the wedding, and so /privacy has a parent.
 */
export const metadata: Metadata = {
  title: 'Sita & Fatan — 10 October 2026',
  description: 'The wedding of Sita Cahyani Arasy and Fatan Aminullah.',
}

export default function Home() {
  return (
    <main
      className={`${bodoni.variable} ${archivo.variable} flex min-h-dvh flex-col items-center justify-center px-6 py-16`}
      style={{ background: SUITE.blush, color: SUITE.ink }}
    >
      <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
        <MonogramMark size={124} priority />

        <p
          className="mt-10 text-[0.7rem] tracking-[0.3em] uppercase"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood, opacity: 0.75 }}
        >
          The wedding of
        </p>

        <h1
          className="mt-4 text-[2.5rem] leading-[1.1]"
          style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
        >
          Sita
          <span className="mx-2 align-middle text-[1.5rem]" style={{ opacity: 0.7 }}>
            &amp;
          </span>
          Fatan
        </h1>

        <div className="mt-9">
          <DateBlock />
        </div>

        <div
          className="mt-9 h-px w-16"
          style={{ background: SUITE.oxblood, opacity: 0.28 }}
          aria-hidden
        />

        <p
          className="mt-9 max-w-[18rem] text-[0.95rem] leading-relaxed"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.8 }}
        >
          Invitations are sent personally. If you have received a link from us, it opens your own
          invitation.
        </p>
      </div>

      {/* Staff reach the admin app directly. Kept quiet rather than hidden:
          obscurity is not a control (docs/ROUTING.md, Decision 5), and the
          people who need it should not have to remember a path. */}
      <footer className="mt-16">
        <Link
          href="/login"
          className="text-[0.7rem] tracking-[0.18em] uppercase underline-offset-4 hover:underline"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood, opacity: 0.5 }}
        >
          Sign in
        </Link>
      </footer>
    </main>
  )
}
