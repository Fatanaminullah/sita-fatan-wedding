import Link from 'next/link'
import { MonogramMark } from '@/components/invitation/monogram-mark'
import { SUITE, bodoni, jost } from '@/components/invitation/invitation-shell'

/**
 * The 404, styled as part of the wedding rather than as a framework error.
 *
 * The likeliest person to land here is a guest whose invite link was retyped
 * wrong, or forwarded with a character lost by a chat app. So the copy speaks
 * to that first and says what to do, instead of stating a status code at
 * someone who has no idea what one is.
 *
 * It deliberately does not offer a search or a guest lookup: /to/<slug> is a
 * bearer credential, and anything that helps a stranger find a valid one would
 * undo the reason it carries entropy at all.
 */
export default function NotFound() {
  return (
    <main
      className={`${bodoni.variable} ${jost.variable} flex min-h-dvh flex-col items-center justify-center px-6 py-16`}
      style={{ background: SUITE.paper, color: SUITE.ink }}
    >
      <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
        <MonogramMark size={96} color={SUITE.oxblood} />

        <h1
          className="mt-9 text-[1.9rem] leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
        >
          This page is not here
        </h1>

        <p
          className="mt-5 max-w-[19rem] text-[0.95rem] leading-relaxed"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.8 }}
        >
          If you were opening your invitation, the link may have been cut short when it was
          forwarded. Try opening it again from the message we sent you, or ask us for a new one.
        </p>

        <div
          className="mt-9 h-px w-16"
          style={{ background: SUITE.oxblood, opacity: 0.28 }}
          aria-hidden
        />

        <Link
          href="/"
          className="mt-9 text-[0.72rem] tracking-[0.22em] uppercase underline-offset-4 hover:underline"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood, opacity: 0.75 }}
        >
          Sita &amp; Fatan
        </Link>
      </div>
    </main>
  )
}
