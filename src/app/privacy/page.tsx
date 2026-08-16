import type { Metadata } from 'next'
import Link from 'next/link'
import { MonogramMark } from '@/components/invitation/monogram-mark'
import { GROUND, Label, Reveal, SUITE, bodoni, jost } from '@/components/invitation/invitation-shell'

/**
 * The privacy notice.
 *
 * Exists for two reasons: guests deserve to know what is held about them, and
 * Meta requires a reachable privacy policy URL before a WhatsApp Business app
 * can leave development mode (docs/ROUTING.md, and the vault's WhatsApp
 * Broadcast note).
 *
 * Every claim here is checked against the schema rather than written from
 * memory. If a column is added that holds something about a guest, this page
 * is wrong until it is updated. The current list comes from `guests`,
 * `guest_events`, `checkin_events`, `souvenir_claims` and `wa_sends`.
 *
 * Confirmed by the owner 2026-08-16: info@sitafatan.wedding is the contact
 * address, and the deletion promise is real. That last one is a commitment to
 * act on, not just copy: the guest list including phone numbers gets deleted
 * once the wedding is settled.
 *
 * The 30-day WhatsApp retention figure is Meta's own, from the Cloud API data
 * privacy documentation, not an estimate.
 */
export const metadata: Metadata = {
  title: 'Privacy — Sita & Fatan',
  description: 'What we collect about our wedding guests, why, and for how long.',
}

const UPDATED = '16 August 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2
        className="text-[1.15rem] leading-snug"
        style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
      >
        {title}
      </h2>
      <div
        className="mt-3 space-y-3 text-[0.95rem] leading-relaxed"
        style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.85 }}
      >
        {children}
      </div>
    </section>
  )
}

export default function Privacy() {
  return (
    <main
      className={`${bodoni.variable} ${jost.variable} flex min-h-dvh flex-col items-center px-6 py-16`}
      style={{ ...GROUND, color: SUITE.ink }}
    >
      <article className="w-full max-w-[34rem]">
        <div className="flex flex-col items-center text-center">
          <MonogramMark size={80} />
          <Reveal order={1} className="mt-8">
            <Label style={{ color: SUITE.oxblood, opacity: 0.7 }}>Sita &amp; Fatan</Label>
          </Reveal>
          <Reveal order={2} className="mt-3">
            <h1
              className="text-[2rem] leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
            >
              Privacy
            </h1>
          </Reveal>
        </div>

        <Reveal order={3}>
          <p
            className="mt-10 text-[0.95rem] leading-relaxed"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.85 }}
          >
            This is a private wedding invitation, run by the two of us rather than by a company. We
            keep the smallest amount of information we can, and only to invite you and to run the
            day itself.
          </p>

          <Section title="What we hold">
            <p>For each guest, some or all of:</p>
            <ul className="ml-4 list-disc space-y-1.5">
              <li>Your name, as we would write it on an invitation</li>
              <li>A WhatsApp number, where we have one, so we can send your invitation</li>
              <li>How many people your invitation is for</li>
              <li>Which of the two events you are invited to, and your reply to each</li>
              <li>
                A private note, for our own organising, such as which side of the family you are
                from or where we know you from
              </li>
              <li>On the day: whether you arrived, and whether a souvenir was collected</li>
              <li>A record that a WhatsApp message was sent to you, and whether it arrived</li>
            </ul>
            <p>
              We do not collect payment details, we do not use cookies for advertising, and there is
              no analytics or tracking on this site.
            </p>
          </Section>

          <Section title="Why we hold it">
            <p>
              To send your invitation, to know how many seats and how much food to arrange, to
              manage a waiting list fairly, and to check people in at the door on the day. Nothing
              else.
            </p>
          </Section>

          <Section title="Who can see it">
            <p>
              The two of us, and a small number of family members helping with the guest list. A
              parent can see only the guests they personally invited. Volunteers helping at the door
              can look up one guest at a time as they arrive, and cannot browse the list. Our
              wedding organiser and caterer see counts, not names or numbers.
            </p>
            <p>
              We do not sell your information, and we do not share it with anyone outside the people
              above, except the services below that we use to run the invitation.
            </p>
          </Section>

          <Section title="Where it is kept">
            <p>
              The guest list is stored with Supabase, on servers in Tokyo, Japan. The site is hosted
              by Vercel. Both are outside Indonesia.
            </p>
            <p>
              Invitations are sent over WhatsApp, so Meta carries the message itself, as it would
              any WhatsApp conversation. Meta keeps the contents of a message sent this way for up
              to 30 days.
            </p>
          </Section>

          <Section title="Why you are hearing from us">
            <p>
              We have your number because you are family, a friend, or someone one of our parents
              invited, and it was given to us for this wedding. You are not on a mailing list and
              there is nothing to unsubscribe from. We will message you about this wedding and
              nothing else.
            </p>
            <p>
              If you would rather not be contacted on WhatsApp, tell us and we will invite you
              another way.
            </p>
          </Section>

          <Section title="Your invitation link">
            <p>
              Your link is private. It contains your name and a random code, so that only someone
              who was sent it can open your invitation. Please treat it as personal: anyone you
              forward it to can see and change your reply.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              Until the wedding has happened and everything around it is settled. After that we
              delete the guest list, including phone numbers, and keep only what we want as a
              memory: who came.
            </p>
          </Section>

          <Section title="Changing or removing your details">
            <p>
              Ask either of us, or reply to the message your invitation came in, and we will correct
              or delete your details. There is no form to fill in and no account to close.
            </p>
            <p>
              You can also write to{' '}
              <a
                href="mailto:info@sitafatan.wedding"
                className="underline underline-offset-4"
                style={{ color: SUITE.oxblood }}
              >
                info@sitafatan.wedding
              </a>
              .
            </p>
          </Section>

          <div
            className="mt-12 h-px w-16"
            style={{ background: SUITE.oxblood, opacity: 0.28 }}
            aria-hidden
          />

          <p
            className="mt-6 text-[0.8rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.6 }}
          >
            Last updated {UPDATED}.
          </p>

          <Link
            href="/"
            className="mt-10 inline-block text-[0.72rem] uppercase underline-offset-4 hover:underline"
            style={{
              fontFamily: 'var(--font-text)',
              letterSpacing: '0.22em',
              color: SUITE.oxblood,
              opacity: 0.75,
            }}
          >
            Sita &amp; Fatan
          </Link>
        </Reveal>
      </article>
    </main>
  )
}
